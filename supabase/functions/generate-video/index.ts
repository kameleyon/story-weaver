import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerationRequest {
  content: string;
  format: string;
  length: string;
  style: string;
  customStyle?: string;
}

interface Scene {
  number: number;
  voiceover: string;
  visualPrompt: string;
  duration: number;
  imageUrl?: string;
  audioUrl?: string;
  title?: string;
  subtitle?: string;
}

interface ScriptResponse {
  title: string;
  scenes: Scene[];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function normalizeBase64(b64: string) {
  return b64.replace(/-/g, "+").replace(/_/g, "/");
}

function decodeInlineDataToBytes(inlineData: { data: string }) {
  return base64Decode(normalizeBase64(inlineData.data));
}

function pickFirstInlineAudio(ttsData: any): { data: string; mimeType?: string } | null {
  const parts = ttsData?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;

  for (const part of parts) {
    const inline = part?.inlineData ?? part?.inline_data;
    if (inline?.data) return inline;
  }
  return null;
}

function parsePcmSampleRate(mimeType: string | undefined) {
  if (!mimeType) return null;
  const m = mimeType.match(/rate=(\d+)/i);
  if (!m) return null;
  const rate = Number(m[1]);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function scorePcm16(pcmBytes: Uint8Array, littleEndian: boolean) {
  const dv = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);
  const sampleCount = Math.floor(pcmBytes.byteLength / 2);

  let sumAbs = 0;
  let clipCount = 0;
  const CLIP_THRESHOLD = 32000;

  for (let i = 0; i + 1 < pcmBytes.byteLength; i += 2) {
    const s = dv.getInt16(i, littleEndian);
    const a = Math.abs(s);
    sumAbs += a;
    if (a >= CLIP_THRESHOLD) clipCount++;
  }

  const meanAbs = sampleCount > 0 ? sumAbs / sampleCount : 0;
  const clipFrac = sampleCount > 0 ? clipCount / sampleCount : 0;

  return { meanAbs, clipFrac, sampleCount };
}

function swap16(pcm: Uint8Array) {
  const out = new Uint8Array(pcm.length - (pcm.length % 2));
  for (let i = 0; i + 1 < out.length; i += 2) {
    out[i] = pcm[i + 1];
    out[i + 1] = pcm[i];
  }
  return out;
}

function pcm16leToWav(pcm16le: Uint8Array, sampleRate: number, channels = 1) {
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  const dataSize = pcm16le.length - (pcm16le.length % 2);
  const header = new Uint8Array(44);
  const dv = new DataView(header.buffer);

  header[0] = 0x52; header[1] = 0x49; header[2] = 0x46; header[3] = 0x46;
  dv.setUint32(4, 36 + dataSize, true);
  header[8] = 0x57; header[9] = 0x41; header[10] = 0x56; header[11] = 0x45;
  header[12] = 0x66; header[13] = 0x6d; header[14] = 0x74; header[15] = 0x20;
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bitsPerSample, true);
  header[36] = 0x64; header[37] = 0x61; header[38] = 0x74; header[39] = 0x61;
  dv.setUint32(40, dataSize, true);

  const wav = new Uint8Array(44 + dataSize);
  wav.set(header, 0);
  wav.set(pcm16le.subarray(0, dataSize), 44);
  return wav;
}

function pcm16ToWavAuto(pcm: Uint8Array, sampleRate: number, channels = 1) {
  const le = scorePcm16(pcm, true);
  const be = scorePcm16(pcm, false);

  const beClearlyBetter =
    be.clipFrac + 0.01 < le.clipFrac ||
    (be.clipFrac < le.clipFrac && be.meanAbs < le.meanAbs * 0.85);

  const pcm16le = beClearlyBetter ? swap16(pcm) : pcm.subarray(0, pcm.length - (pcm.length % 2));
  return pcm16leToWav(pcm16le, sampleRate, channels);
}

// Styles that should include text overlays
const TEXT_OVERLAY_STYLES = ["minimalist", "doodle", "stick"];

// Get image dimensions based on format
function getImageDimensions(format: string): { width: number; height: number } {
  switch (format) {
    case "portrait":
      return { width: 1080, height: 1920 };
    case "square":
      return { width: 1080, height: 1080 };
    case "landscape":
    default:
      return { width: 1920, height: 1080 };
  }
}

// Generate image using Replicate Flux with exact dimensions
async function generateImageWithReplicate(
  prompt: string,
  replicateApiToken: string,
  format: string
): Promise<{ ok: true; imageBase64: string } | { ok: false; error: string }> {
  const dimensions = getImageDimensions(format);
  
  // Map format to Flux aspect ratio string
  const aspectRatio = format === "portrait" ? "9:16" : format === "square" ? "1:1" : "16:9";
  
  try {
    // Create prediction with Flux schnell model (fast, good quality)
    const createResponse = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateApiToken}`,
        "Content-Type": "application/json",
        "Prefer": "wait", // Wait for completion (up to 60s)
      },
      body: JSON.stringify({
        version: "black-forest-labs/flux-schnell",
        input: {
          prompt: prompt,
          aspect_ratio: aspectRatio,
          output_format: "png",
          output_quality: 90,
        },
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      if (createResponse.status === 401) {
        return { ok: false, error: "Invalid Replicate API token" };
      }
      if (createResponse.status === 402) {
        return { ok: false, error: "Replicate credits exhausted" };
      }
      return { ok: false, error: `Replicate API error ${createResponse.status}: ${errorText}` };
    }

    let prediction = await createResponse.json();
    
    // If not completed yet, poll for result
    let pollAttempts = 0;
    const maxPolls = 30; // 30 seconds max
    
    while (prediction.status !== "succeeded" && prediction.status !== "failed" && pollAttempts < maxPolls) {
      if (prediction.status === "failed" || prediction.status === "canceled") {
        return { ok: false, error: prediction.error || "Image generation failed" };
      }
      
      await new Promise(r => setTimeout(r, 1000));
      pollAttempts++;
      
      const pollResponse = await fetch(prediction.urls.get, {
        headers: { Authorization: `Bearer ${replicateApiToken}` },
      });
      
      if (!pollResponse.ok) {
        return { ok: false, error: "Failed to poll prediction status" };
      }
      
      prediction = await pollResponse.json();
    }
    
    if (prediction.status !== "succeeded") {
      return { ok: false, error: prediction.error || "Image generation timed out" };
    }
    
    // Get the output URL (Flux returns an array with one URL)
    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    
    if (!outputUrl) {
      return { ok: false, error: "No image URL in prediction output" };
    }
    
    // Download the image and convert to base64 (chunked to avoid stack overflow)
    const imageResponse = await fetch(outputUrl);
    if (!imageResponse.ok) {
      return { ok: false, error: "Failed to download generated image" };
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const bytes = new Uint8Array(imageBuffer);
    
    // Convert to base64 in chunks to avoid stack overflow on large images
    let base64 = "";
    const chunkSize = 32768; // 32KB chunks
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      base64 += String.fromCharCode.apply(null, Array.from(chunk));
    }
    base64 = btoa(base64);
    
    return { ok: true, imageBase64: base64 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Fallback: Generate image using Lovable AI Gateway (no dimension control)
async function generateImageWithLovable(
  prompt: string,
  lovableApiKey: string,
  format: string
): Promise<{ ok: true; imageBase64: string } | { ok: false; error: string }> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) return { ok: false, error: "Rate limited" };
      if (response.status === 402) return { ok: false, error: "Credits exhausted" };
      return { ok: false, error: `API error ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) return { ok: false, error: "No image returned" };

    const base64Match = imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (!base64Match) return { ok: false, error: "Invalid image format" };

    return { ok: true, imageBase64: base64Match[1] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}


// Helpers to classify TTS failures
function truncateForLogs(input: string, maxLen = 220) {
  if (!input) return "";
  return input.length > maxLen ? input.slice(0, maxLen) + "…" : input;
}

function isHardQuotaExhausted(status: number, errorText: string) {
  if (status !== 429 && status !== 402) return false;
  const t = (errorText || "").toLowerCase();
  return (
    t.includes("limit: 0") ||
    t.includes("resource_exhausted") ||
    t.includes("quota") ||
    t.includes("exhaust") ||
    t.includes("insufficient")
  );
}

 // Generate TTS for a single scene
async function generateSceneAudio(
  scene: Scene,
  sceneIndex: number,
  GEMINI_API_KEY: string,
  supabase: any,
  userId: string,
  projectId: string,
  enabledModels: { flash: boolean; pro: boolean }
): Promise<{ url: string | null; disableFlash: boolean; disablePro: boolean }> {
  const TTS_ATTEMPTS_PER_MODEL = 2;
  const TTS_RETRY_BASE_DELAY_MS = 200;

  let finalAudioUrl: string | null = null;
  let lastTtsError: string | null = null;
  let disableFlash = false;
  let disablePro = false;

  const modelCandidates = [
    ...(enabledModels.flash ? ["gemini-2.5-flash-preview-tts"] : []),
    ...(enabledModels.pro ? ["gemini-2.5-pro-preview-tts"] : []),
  ];

  for (const modelName of modelCandidates) {
    for (let attempt = 1; attempt <= TTS_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        const ttsResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `Please read this text clearly and naturally:\n\n${scene.voiceover}`,
                    },
                  ],
                },
              ],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: "Aoede",
                    },
                  },
                },
              },
            }),
          }
        );

        if (!ttsResponse.ok) {
          const errorText = await ttsResponse.text();
          lastTtsError = `model=${modelName} status=${ttsResponse.status} attempt=${attempt}`;

          console.warn(
            `Scene ${sceneIndex + 1} TTS HTTP error (${modelName}) status=${ttsResponse.status} attempt=${attempt}: ${truncateForLogs(errorText)}`
          );

          // Permanent / configuration issues
          if (ttsResponse.status === 400 && errorText.toLowerCase().includes("response modalities")) {
            break;
          }
          if (ttsResponse.status === 404) {
            break;
          }

          // Hard quota exhaustion (no point retrying this model)
          const hardQuota = isHardQuotaExhausted(ttsResponse.status, errorText);
          if (hardQuota) {
            if (modelName.includes("flash-preview-tts")) disableFlash = true;
            if (modelName.includes("-pro-")) disablePro = true;
            break;
          }

          // Retriable (rate limit / transient)
          const retriable = ttsResponse.status === 429 || ttsResponse.status >= 500;
          if (retriable && attempt < TTS_ATTEMPTS_PER_MODEL) {
            await sleep(TTS_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
            continue;
          }
          continue;
        }

        const ttsData = await ttsResponse.json();

        if (ttsData?.error) {
          if (attempt < TTS_ATTEMPTS_PER_MODEL) {
            await sleep(TTS_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
            continue;
          }
          continue;
        }

        const inlineAudio = pickFirstInlineAudio(ttsData);

        if (!inlineAudio?.data) {
          if (attempt < TTS_ATTEMPTS_PER_MODEL) {
            await sleep(TTS_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
            continue;
          }
          if (modelName.includes("flash-preview-tts")) disableFlash = true;
          continue;
        }

        const mimeTypeRaw = inlineAudio.mimeType || "audio/wav";
        const decoded = new Uint8Array(decodeInlineDataToBytes({ data: inlineAudio.data }));

        let uploadBytes: Uint8Array = decoded;
        let uploadMime = mimeTypeRaw;
        let ext = "wav";

        if (/audio\/L16/i.test(mimeTypeRaw) || /pcm/i.test(mimeTypeRaw)) {
          const rate = parsePcmSampleRate(mimeTypeRaw) ?? 24000;
          uploadBytes = pcm16ToWavAuto(decoded, rate, 1);
          uploadMime = "audio/wav";
          ext = "wav";
        } else if (mimeTypeRaw.includes("mp3") || mimeTypeRaw.includes("mpeg")) {
          uploadMime = "audio/mpeg";
          ext = "mp3";
        } else if (mimeTypeRaw.includes("wav")) {
          uploadMime = "audio/wav";
          ext = "wav";
        } else {
          uploadMime = "audio/wav";
          ext = "wav";
        }

        if (!uploadBytes?.length || uploadBytes.length < 512) {
          if (attempt < TTS_ATTEMPTS_PER_MODEL) {
            await sleep(TTS_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
            continue;
          }
          continue;
        }

        const uploadCopy = new Uint8Array(uploadBytes.length);
        uploadCopy.set(uploadBytes);

        const audioBlob = new Blob([uploadCopy.buffer], { type: uploadMime });
        const audioPath = `${userId}/${projectId}/scene-${sceneIndex + 1}.${ext}`;

        const { error: uploadError } = await supabase.storage.from("audio").upload(audioPath, audioBlob, {
          contentType: uploadMime,
          upsert: true,
        });

        if (uploadError) {
          console.error(`Scene ${sceneIndex + 1} audio upload failed:`, uploadError);
          if (attempt < TTS_ATTEMPTS_PER_MODEL) {
            await sleep(TTS_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
            continue;
          }
          continue;
        }

        const { data: { publicUrl } } = supabase.storage.from("audio").getPublicUrl(audioPath);
        finalAudioUrl = publicUrl;
        console.log(`Scene ${sceneIndex + 1} audio OK (${modelName})`);
        break;
      } catch (ttsError) {
        if (attempt < TTS_ATTEMPTS_PER_MODEL) {
          await sleep(TTS_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
          continue;
        }
        console.error(`Scene ${sceneIndex + 1} TTS error:`, ttsError);
      }
    }
    if (finalAudioUrl) break;
  }

  return { url: finalAudioUrl, disableFlash, disablePro };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: apiKeys, error: apiKeysError } = await supabase
      .from("user_api_keys")
      .select("gemini_api_key, replicate_api_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (apiKeysError) {
      console.error("Error fetching API keys:", apiKeysError);
      return new Response(
        JSON.stringify({ error: "Failed to retrieve API keys" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!apiKeys?.gemini_api_key) {
      return new Response(
        JSON.stringify({ error: "Please add your Google Gemini API key in Settings" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = apiKeys.gemini_api_key;
    const REPLICATE_API_TOKEN = apiKeys.replicate_api_token;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    // Determine image generation method
    const useReplicate = !!REPLICATE_API_TOKEN;
    if (useReplicate) {
      console.log("Using Replicate for image generation (exact aspect ratios)");
    } else if (LOVABLE_API_KEY) {
      console.log("Using Lovable AI for image generation (no Replicate key)");
    } else {
      return new Response(
        JSON.stringify({ error: "No image generation API configured. Please add your Replicate API key in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { content, format, length, style, customStyle }: GenerationRequest = await req.json();

    const sceneCounts: Record<string, number> = {
      short: 4,
      brief: 6,
      presentation: 10,
    };
    const sceneCount = sceneCounts[length] || 6;

    // ===============================================
    // STEP 1: THE DIRECTOR - Script Generation
    // ===============================================
    const styleDescription = style === "custom" ? customStyle : style;
    const includeTextOverlay = TEXT_OVERLAY_STYLES.includes(style.toLowerCase());
    const dimensions = getImageDimensions(format);
    
    const scriptPrompt = `You are a video script writer. Create a compelling video script from the following content.
    
Content: ${content}

Requirements:
- Video format: ${format} (${format === "landscape" ? "16:9 horizontal" : format === "portrait" ? "9:16 vertical" : "1:1 square"})
- Exact dimensions: ${dimensions.width}x${dimensions.height} pixels
- Target length: ${length === "short" ? "under 2 minutes" : length === "brief" ? "2-5 minutes" : "5-10 minutes"}
- Visual style: ${styleDescription}
- Create exactly ${sceneCount} scenes
${includeTextOverlay ? `
IMPORTANT: For each scene, also provide:
- A short scene title (2-5 words, like a headline)
- A brief subtitle (one short sentence summarizing the key point)
These will be displayed as text overlays on the image, similar to educational explainer videos.
` : ""}

For each scene, provide:
1. Scene number
2. Voiceover text (what will be spoken - keep it natural and engaging)
3. Visual description (detailed prompt for image generation in the ${styleDescription} style)
4. Duration in seconds (based on voiceover length, roughly 150 words per minute)
${includeTextOverlay ? `5. Title (short headline text for the scene)
6. Subtitle (one sentence key point)` : ""}

IMPORTANT: Return ONLY valid JSON with this exact structure:
{
  "title": "Video Title",
  "scenes": [
    {
      "number": 1,
      "voiceover": "Text to be spoken...",
      "visualPrompt": "Detailed image generation prompt...",
      "duration": 15${includeTextOverlay ? `,
      "title": "Scene Headline",
      "subtitle": "Key point or call to action"` : ""}
    }
  ]
}`;

    console.log("Step 1: Generating script...");
    
    const scriptResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ 
            parts: [{ text: scriptPrompt }] 
          }],
          generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            maxOutputTokens: 8192,
          }
        }),
      }
    );

    if (!scriptResponse.ok) {
      const errorText = await scriptResponse.text();
      console.error("Gemini script error:", scriptResponse.status, errorText);
      throw new Error(`Script generation failed: ${scriptResponse.status}`);
    }

    const scriptData = await scriptResponse.json();
    const scriptContent = scriptData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!scriptContent) {
      throw new Error("No script content received from Gemini");
    }

    let parsedScript: ScriptResponse;
    try {
      const jsonMatch = scriptContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedScript = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse script:", parseError, scriptContent);
      throw new Error("Failed to parse generated script");
    }

    console.log("Script generated:", parsedScript.title, `(${parsedScript.scenes.length} scenes)`);

    // Create project in database
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title: parsedScript.title || "Untitled Video",
        content: content,
        format: format,
        length: length,
        style: style,
        status: "generating",
      })
      .select()
      .single();

    if (projectError) {
      console.error("Project creation error:", projectError);
      throw new Error("Failed to create project");
    }

    // Create generation record
    const { data: generation, error: genError } = await supabase
      .from("generations")
      .insert({
        project_id: project.id,
        user_id: user.id,
        status: "generating",
        progress: 10,
        script: scriptContent,
        scenes: parsedScript.scenes,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (genError) {
      console.error("Generation creation error:", genError);
      throw new Error("Failed to create generation record");
    }

    // ===============================================
    // STEP 2: THE NARRATOR - Audio Generation (TTS)
    // Process scenes in parallel batches of 2
    // ===============================================
    console.log("Step 2: Generating audio...");

    const audioUrls: (string | null)[] = new Array(parsedScript.scenes.length).fill(null);
    // Track disabled models but don't stop trying entirely
    const modelStatus = { flashDisabled: false, proDisabled: false, lastSuccessModel: "" };
    const AUDIO_BATCH_SIZE = 2;
    const INTER_BATCH_DELAY_MS = 1500; // Longer delay to avoid rate limits

    for (let batchStart = 0; batchStart < parsedScript.scenes.length; batchStart += AUDIO_BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + AUDIO_BATCH_SIZE, parsedScript.scenes.length);
      
      console.log(`Audio batch: scenes ${batchStart + 1}-${batchEnd} of ${parsedScript.scenes.length}`);
      
      // Determine which models to try for this batch
      const enabledModels = { 
        flash: !modelStatus.flashDisabled, 
        pro: !modelStatus.proDisabled 
      };
      
      // If both are disabled, re-enable flash and try with longer delays
      if (!enabledModels.flash && !enabledModels.pro) {
        console.log("Both models were rate-limited, waiting 3s and re-enabling flash...");
        await sleep(3000);
        enabledModels.flash = true;
        modelStatus.flashDisabled = false;
      }
      
      const batchPromises: Promise<{ index: number; result: { url: string | null; disableFlash: boolean; disablePro: boolean } }>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const scene = parsedScript.scenes[i];
        batchPromises.push(
          generateSceneAudio(scene, i, GEMINI_API_KEY, supabase, user.id, project.id, enabledModels)
            .then(result => ({ index: i, result }))
        );
      }

      const batchResults = await Promise.all(batchPromises);
      
      let batchSuccessCount = 0;
       for (const { index, result } of batchResults) {
         audioUrls[index] = result.url;
         if (result.url) batchSuccessCount++;

         if (result.disablePro) {
           console.log("Pro TTS quota exhausted, disabling for remaining scenes");
           modelStatus.proDisabled = true;
         }
         if (result.disableFlash) {
           console.log("Flash TTS quota exhausted, disabling for remaining scenes");
           modelStatus.flashDisabled = true;
         }
       }

      console.log(`Audio batch complete: ${batchSuccessCount}/${batchEnd - batchStart} succeeded`);

      // Update progress
      const progress = 10 + Math.floor((batchEnd / parsedScript.scenes.length) * 30);
      await supabase.from("generations").update({ progress }).eq("id", generation.id);

      // Delay between batches to avoid rate limits
      if (batchEnd < parsedScript.scenes.length) {
        await sleep(INTER_BATCH_DELAY_MS);
      }
    }
    
     const successfulAudio = audioUrls.filter((u) => u !== null).length;
     console.log(
       `Audio generation complete: ${successfulAudio}/${parsedScript.scenes.length} scenes have audio`
     );

     // If we produced zero audio, fail fast with a clear, actionable message.
     // (Otherwise the UI shows a "success" result but all scenes are silent.)
     if (successfulAudio === 0) {
       const msg =
         "Audio generation failed: your Gemini text-to-speech quota appears exhausted (or your key doesn't have audio access). Update your Gemini API key/credits in Settings and try again.";

       await supabase
         .from("generations")
         .update({
           status: "error",
           error_message: msg,
           progress: 100,
           completed_at: new Date().toISOString(),
         })
         .eq("id", generation.id);

       await supabase.from("projects").update({ status: "error" }).eq("id", project.id);

       return new Response(JSON.stringify({ error: msg }), {
         status: 400,
         headers: { ...corsHeaders, "Content-Type": "application/json" },
       });
     }

    // ===============================================
    // STEP 3: THE ILLUSTRATOR - Image Generation
    // Process images in parallel batches of 3 for speed
    // ===============================================
    console.log("Step 3: Generating images...");
    const imageUrls: (string | null)[] = new Array(parsedScript.scenes.length).fill(null);
    
    // Process images SEQUENTIALLY to respect Replicate rate limits (6/min when low credits)
    const IMAGE_DELAY_MS = useReplicate ? 12000 : 500; // 12s between Replicate requests = 5/min
    // When using Replicate, process one at a time; otherwise batch of 3
    const IMAGE_BATCH_SIZE = useReplicate ? 1 : 3;

    // Build all image prompts with correct aspect ratio and optional text overlay
    const imagePrompts = parsedScript.scenes.map((scene, i) => {
      const orientationDesc = format === "portrait" 
        ? "VERTICAL/PORTRAIT orientation (taller than wide, 9:16 aspect ratio)"
        : format === "square" 
        ? "SQUARE orientation (equal width and height, 1:1 aspect ratio)"
        : "HORIZONTAL/LANDSCAPE orientation (wider than tall, 16:9 aspect ratio)";
      
      let textOverlayInstructions = "";
      if (includeTextOverlay && scene.title) {
        textOverlayInstructions = `

IMPORTANT - Include these text elements directly in the image:
- Display the number "${scene.number}" prominently (large, stylized, like a chapter number)
- Display the title text: "${scene.title}" (bold, readable headline style)
- Display subtitle: "${scene.subtitle || ""}" (smaller text below the title)
The text should be integrated into the illustration style, with decorative elements around it. Use hand-drawn looking text that matches the ${styleDescription} style. The text should be clearly readable and positioned to not obstruct key visual elements.`;
      }

      return `Generate an image in EXACTLY ${orientationDesc}.

CRITICAL REQUIREMENTS:
- The image MUST be in ${format.toUpperCase()} format
- Dimensions: ${dimensions.width}x${dimensions.height} pixels
- Aspect ratio: ${format === "portrait" ? "9:16 (vertical)" : format === "square" ? "1:1 (square)" : "16:9 (horizontal)"}

Visual content: ${scene.visualPrompt}

Style: ${styleDescription} style illustration. High quality, professional, with consistent aesthetic throughout.${textOverlayInstructions}

Remember: The image MUST be ${orientationDesc}. Do NOT generate a square image unless specifically requested.`;
    });

    for (let batchStart = 0; batchStart < parsedScript.scenes.length; batchStart += IMAGE_BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + IMAGE_BATCH_SIZE, parsedScript.scenes.length);
      const batchPromises: Promise<{ index: number; url: string | null }>[] = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const prompt = imagePrompts[i];
        
        batchPromises.push(
          (async () => {
            try {
              // Use Replicate if available (exact aspect ratios), otherwise Lovable AI
              const result = useReplicate
                ? await generateImageWithReplicate(prompt, REPLICATE_API_TOKEN!, format)
                : await generateImageWithLovable(prompt, LOVABLE_API_KEY!, format);

              if (!result.ok) {
                console.error(`Scene ${i + 1} image failed:`, result.error);
                return { index: i, url: null };
              }

              const imageBytes = new Uint8Array(base64Decode(result.imageBase64));
              const imageBlob = new Blob([imageBytes], { type: "image/png" });
              const imagePath = `${user.id}/${project.id}/scene-${i + 1}.png`;

              const { error: uploadError } = await supabase.storage
                .from("audio")
                .upload(imagePath, imageBlob, {
                  contentType: "image/png",
                  upsert: true,
                });

              if (uploadError) {
                console.error(`Scene ${i + 1} image upload failed:`, uploadError);
                return { index: i, url: null };
              }

              const { data: { publicUrl } } = supabase.storage
                .from("audio")
                .getPublicUrl(imagePath);

              console.log(`Scene ${i + 1} image generated`);
              return { index: i, url: publicUrl };
            } catch (imgError) {
              console.error(`Scene ${i + 1} image error:`, imgError);
              return { index: i, url: null };
            }
          })()
        );
      }

      const batchResults = await Promise.all(batchPromises);
      
      for (const { index, url } of batchResults) {
        imageUrls[index] = url;
      }

      // Update progress
      const progress = 40 + Math.floor((batchEnd / parsedScript.scenes.length) * 50);
      await supabase.from("generations").update({ progress }).eq("id", generation.id);
      
      // Rate limit delay between batches (critical for Replicate)
      if (batchEnd < parsedScript.scenes.length) {
        console.log(`Waiting ${IMAGE_DELAY_MS}ms before next image...`);
        await sleep(IMAGE_DELAY_MS);
      }
    }
    
    const successfulImages = imageUrls.filter(u => u !== null).length;
    console.log(`Image generation complete: ${successfulImages}/${parsedScript.scenes.length} scenes have images`);

    // ===============================================
    // STEP 4: FINALIZE - Compile results
    // ===============================================
    console.log("Step 4: Finalizing generation...");
    
    const finalScenes = parsedScript.scenes.map((scene, idx) => ({
      ...scene,
      imageUrl: imageUrls[idx] || null,
      audioUrl: audioUrls[idx] || null,
    }));

    // Update generation as complete
    await supabase
      .from("generations")
      .update({
        status: "complete",
        progress: 100,
        scenes: finalScenes,
        completed_at: new Date().toISOString(),
      })
      .eq("id", generation.id);

    await supabase
      .from("projects")
      .update({ status: "complete" })
      .eq("id", project.id);

    console.log("Generation complete!");

    return new Response(
      JSON.stringify({
        success: true,
        projectId: project.id,
        generationId: generation.id,
        title: parsedScript.title,
        scenes: finalScenes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
