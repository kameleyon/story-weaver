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
}

interface ScriptResponse {
  title: string;
  scenes: Scene[];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function normalizeBase64(b64: string) {
  // Handle base64url variants just in case
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

function pcm16beToWav(pcm16be: Uint8Array, sampleRate: number, channels = 1) {
  // WAV is little-endian PCM. "audio/L16" is typically big-endian PCM.
  // Convert to little-endian by swapping bytes per 16-bit sample.
  const pcm16le = new Uint8Array(pcm16be.length);
  for (let i = 0; i + 1 < pcm16be.length; i += 2) {
    pcm16le[i] = pcm16be[i + 1];
    pcm16le[i + 1] = pcm16be[i];
  }

  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  const dataSize = pcm16le.length;
  const header = new Uint8Array(44);
  const dv = new DataView(header.buffer);

  // "RIFF"
  header[0] = 0x52;
  header[1] = 0x49;
  header[2] = 0x46;
  header[3] = 0x46;
  // Chunk size = 36 + dataSize
  dv.setUint32(4, 36 + dataSize, true);
  // "WAVE"
  header[8] = 0x57;
  header[9] = 0x41;
  header[10] = 0x56;
  header[11] = 0x45;
  // "fmt "
  header[12] = 0x66;
  header[13] = 0x6d;
  header[14] = 0x74;
  header[15] = 0x20;
  // Subchunk1Size (16 for PCM)
  dv.setUint32(16, 16, true);
  // AudioFormat (1 = PCM)
  dv.setUint16(20, 1, true);
  // NumChannels
  dv.setUint16(22, channels, true);
  // SampleRate
  dv.setUint32(24, sampleRate, true);
  // ByteRate
  dv.setUint32(28, byteRate, true);
  // BlockAlign
  dv.setUint16(32, blockAlign, true);
  // BitsPerSample
  dv.setUint16(34, bitsPerSample, true);
  // "data"
  header[36] = 0x64;
  header[37] = 0x61;
  header[38] = 0x74;
  header[39] = 0x61;
  // Subchunk2Size
  dv.setUint32(40, dataSize, true);

  const wav = new Uint8Array(44 + dataSize);
  wav.set(header, 0);
  wav.set(pcm16le, 44);
  return wav;
}

// Generate image using Lovable AI Gateway (free, no API key needed from user)
async function generateImageWithLovable(
  prompt: string,
  lovableApiKey: string
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
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        return { ok: false, error: "Rate limited - please try again later" };
      }
      if (response.status === 402) {
        return { ok: false, error: "Credits exhausted - please add credits to your workspace" };
      }
      return { ok: false, error: `API error ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      return { ok: false, error: "No image returned from API" };
    }

    // Extract base64 data from data URL
    const base64Match = imageUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (!base64Match) {
      return { ok: false, error: "Invalid image format returned" };
    }

    return { ok: true, imageBase64: base64Match[1] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get the user from the authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Verify the user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's API keys from database
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
    
    // Use Lovable AI for image generation (free, no user API key needed)
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Lovable AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { content, format, length, style, customStyle }: GenerationRequest = await req.json();

    // Determine scene count based on video length
    const sceneCounts: Record<string, number> = {
      short: 4,
      brief: 6,
      presentation: 10,
    };
    const sceneCount = sceneCounts[length] || 6;

    // ===============================================
    // STEP 1: THE DIRECTOR - Script Generation
    // Using Google Gemini 2.5 Pro Preview
    // ===============================================
    const styleDescription = style === "custom" ? customStyle : style;
    
    const scriptPrompt = `You are a video script writer. Create a compelling video script from the following content.
    
Content: ${content}

Requirements:
- Video format: ${format} (${format === "landscape" ? "16:9" : format === "portrait" ? "9:16" : "1:1"})
- Target length: ${length === "short" ? "under 2 minutes" : length === "brief" ? "2-5 minutes" : "5-10 minutes"}
- Visual style: ${styleDescription}
- Create exactly ${sceneCount} scenes

For each scene, provide:
1. Scene number
2. Voiceover text (what will be spoken - keep it natural and engaging)
3. Visual description (detailed prompt for image generation in the ${styleDescription} style)
4. Duration in seconds (based on voiceover length, roughly 150 words per minute)

IMPORTANT: Return ONLY valid JSON with this exact structure:
{
  "title": "Video Title",
  "scenes": [
    {
      "number": 1,
      "voiceover": "Text to be spoken...",
      "visualPrompt": "Detailed image generation prompt...",
      "duration": 15
    }
  ]
}`;

    console.log("Step 1: Generating script with Gemini 2.5 Pro Preview...");
    
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

    // Parse the script JSON
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
    // IMPORTANT: Requires a *TTS-capable* Gemini model.
    // ===============================================
    console.log("Step 2: Generating audio with Gemini TTS...");

    const TTS_MODEL_CANDIDATES = [
      // Prefer dedicated TTS models when available
      "gemini-2.5-flash-preview-tts",
      "gemini-2.5-pro-preview-tts",
      "gemini-2.0-flash-preview-tts",
    ];

    const audioUrls: (string | null)[] = [];

    for (let i = 0; i < parsedScript.scenes.length; i++) {
      const scene = parsedScript.scenes[i];

      let finalAudioUrl: string | null = null;
      let lastTtsError: string | null = null;

      for (const modelName of TTS_MODEL_CANDIDATES) {
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
                        // If a voice is restricted on an account, the call may fail.
                        // Aoede tends to be broadly available.
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
            lastTtsError = `model=${modelName} status=${ttsResponse.status} body=${errorText}`;

            // Common failure: model doesn't support AUDIO -> try next model candidate.
            if (ttsResponse.status === 400 && errorText.includes("response modalities")) {
              console.error(`Scene ${i + 1} TTS model not AUDIO-capable:`, lastTtsError);
              continue;
            }

            // If the model doesn't exist / isn't enabled on this key -> try next.
            if (ttsResponse.status === 404) {
              console.error(`Scene ${i + 1} TTS model not found:`, lastTtsError);
              continue;
            }

            console.error(`Scene ${i + 1} TTS failed:`, lastTtsError);
            continue;
          }

          const ttsData = await ttsResponse.json();
          const inlineAudio = pickFirstInlineAudio(ttsData);

          if (!inlineAudio?.data) {
            lastTtsError = `model=${modelName} no inline audio data`;
            console.error(`Scene ${i + 1} no audio data returned:`, lastTtsError);
            continue;
          }

          const mimeTypeRaw = inlineAudio.mimeType || "audio/wav";

          // Ensure the underlying buffer is a plain ArrayBuffer (Blob typing compatibility)
          const decoded = new Uint8Array(decodeInlineDataToBytes({ data: inlineAudio.data }));

          // Convert raw PCM -> WAV so browsers can actually play it.
          let uploadBytes: Uint8Array = decoded;
          let uploadMime = mimeTypeRaw;
          let ext = "wav";

          if (/audio\/L16/i.test(mimeTypeRaw) || /pcm/i.test(mimeTypeRaw)) {
            const rate = parsePcmSampleRate(mimeTypeRaw) ?? 24000;
            uploadBytes = pcm16beToWav(decoded, rate, 1);
            uploadMime = "audio/wav";
            ext = "wav";
          } else if (mimeTypeRaw.includes("mp3") || mimeTypeRaw.includes("mpeg")) {
            uploadMime = "audio/mpeg";
            ext = "mp3";
          } else if (mimeTypeRaw.includes("wav")) {
            uploadMime = "audio/wav";
            ext = "wav";
          } else {
            // Default to wav to maximize browser compatibility.
            uploadMime = "audio/wav";
            ext = "wav";
          }

          if (!uploadBytes?.length || uploadBytes.length < 512) {
            lastTtsError = `model=${modelName} decoded audio too small (${uploadBytes?.length ?? 0} bytes)`;
            console.error(`Scene ${i + 1} invalid audio payload:`, lastTtsError);
            continue;
          }

          // Force a non-shared ArrayBuffer backing store for Blob compatibility in Deno.
          const uploadCopy = new Uint8Array(uploadBytes.length);
          uploadCopy.set(uploadBytes);

          const audioBlob = new Blob([uploadCopy.buffer], { type: uploadMime });
          const audioPath = `${user.id}/${project.id}/scene-${i + 1}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from("audio")
            .upload(audioPath, audioBlob, {
              contentType: uploadMime,
              upsert: true,
            });

          if (uploadError) {
            lastTtsError = `model=${modelName} uploadError=${uploadError.message}`;
            console.error(`Scene ${i + 1} audio upload failed:`, uploadError);
            continue;
          }

          const {
            data: { publicUrl },
          } = supabase.storage.from("audio").getPublicUrl(audioPath);

          finalAudioUrl = publicUrl;
          console.log(
            `Scene ${i + 1} audio generated (model=${modelName}, mime=${uploadMime}, srcMime=${mimeTypeRaw})`
          );
          break; // stop trying models
        } catch (ttsError) {
          lastTtsError = `model=${modelName} exception=${ttsError instanceof Error ? ttsError.message : String(ttsError)}`;
          console.error(`Scene ${i + 1} TTS error:`, ttsError);
          // try next model
        }
      }

      if (!finalAudioUrl) {
        console.error(`Scene ${i + 1} audio generation failed for all models.`, lastTtsError);
      }

      audioUrls.push(finalAudioUrl);

      // Update progress
      const progress = 10 + Math.floor(((i + 1) / parsedScript.scenes.length) * 30);
      await supabase.from("generations").update({ progress }).eq("id", generation.id);
    }
    // ===============================================
    // STEP 3: THE ILLUSTRATOR - Image Generation
    // Using Lovable AI (free, no user API key needed)
    // ===============================================
    console.log("Step 3: Generating images with Lovable AI...");
    const imageUrls: (string | null)[] = [];

    const aspectRatioHint: Record<string, string> = {
      landscape: "16:9 landscape",
      portrait: "9:16 portrait",
      square: "1:1 square"
    };
    const aspectHint = aspectRatioHint[format] || "16:9 landscape";

    for (let i = 0; i < parsedScript.scenes.length; i++) {
      const scene = parsedScript.scenes[i];
      
      try {
        const imagePrompt = `Generate a ${aspectHint} image: ${scene.visualPrompt}. Style: ${styleDescription}. High quality, professional, cinematic lighting.`;
        
        const result = await generateImageWithLovable(imagePrompt, LOVABLE_API_KEY);

        if (!result.ok) {
          console.error(`Scene ${i + 1} image failed:`, result.error);
          imageUrls.push(null);
          continue;
        }

        // Upload base64 image to Supabase storage
        const imageBytes = new Uint8Array(base64Decode(result.imageBase64));
        const imageBlob = new Blob([imageBytes], { type: "image/png" });
        const imagePath = `${user.id}/${project.id}/scene-${i + 1}.png`;

        const { error: uploadError } = await supabase.storage
          .from("audio") // Reusing audio bucket for now, or create images bucket
          .upload(imagePath, imageBlob, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          console.error(`Scene ${i + 1} image upload failed:`, uploadError);
          imageUrls.push(null);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from("audio")
          .getPublicUrl(imagePath);

        imageUrls.push(publicUrl);
        console.log(`Scene ${i + 1} image generated and uploaded`);
      } catch (imgError) {
        console.error(`Scene ${i + 1} image error:`, imgError);
        imageUrls.push(null);
      }

      // Update progress
      const progress = 40 + Math.floor(((i + 1) / parsedScript.scenes.length) * 50);
      await supabase
        .from("generations")
        .update({ progress })
        .eq("id", generation.id);

      // Small delay to avoid rate limits
      if (i < parsedScript.scenes.length - 1) {
        await sleep(2000);
      }
    }

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
