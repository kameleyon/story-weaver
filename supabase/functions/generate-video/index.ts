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
async function createReplicatePredictionWithRetry({
  replicateToken,
  input,
  maxRetries = 12,
}: {
  replicateToken: string;
  input: Record<string, unknown>;
  maxRetries?: number;
}): Promise<{ ok: true; prediction: any } | { ok: false; status: number; error: string }> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const resp = await fetch(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${replicateToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input }),
      }
    );

    if (resp.status === 429) {
      let retryMs = 11_000;
      try {
        const j = await resp.json();
        const retryAfter = (j?.retry_after ?? j?.detail?.retry_after) as number | undefined;
        if (typeof retryAfter === "number") retryMs = Math.max(1000, retryAfter * 1000) + 250;
      } catch {
        // ignore
      }
      console.error("Replicate rate-limited (429). Waiting", retryMs, "ms");
      await sleep(retryMs);
      attempt++;
      continue;
    }

    if (!resp.ok) {
      const t = await resp.text();
      return { ok: false, status: resp.status, error: t };
    }

    const prediction = await resp.json();
    return { ok: true, prediction };
  }

  return { ok: false, status: 429, error: "Replicate rate limit retries exceeded" };
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

    if (!apiKeys?.replicate_api_token) {
      return new Response(
        JSON.stringify({ error: "Please add your Replicate API token in Settings" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = apiKeys.gemini_api_key;
    const REPLICATE_API_TOKEN = apiKeys.replicate_api_token;

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

          const mimeType = inlineAudio.mimeType || "audio/wav";
          const ext = mimeType.includes("mp3") || mimeType.includes("mpeg") ? "mp3" : "wav";

          // Ensure the underlying buffer is a plain ArrayBuffer (Blob typing compatibility)
          const audioBytes = new Uint8Array(decodeInlineDataToBytes({ data: inlineAudio.data }));

          if (!audioBytes?.length || audioBytes.length < 512) {
            lastTtsError = `model=${modelName} decoded audio too small (${audioBytes?.length ?? 0} bytes)`;
            console.error(`Scene ${i + 1} invalid audio payload:`, lastTtsError);
            continue;
          }

          const audioBlob = new Blob([audioBytes], { type: mimeType });
          const audioPath = `${user.id}/${project.id}/scene-${i + 1}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from("audio")
            .upload(audioPath, audioBlob, {
              contentType: mimeType,
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
          console.log(`Scene ${i + 1} audio generated (model=${modelName}, mime=${mimeType})`);
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
    // Using Replicate Flux 1.1 Pro
    // ===============================================
    console.log("Step 3: Generating images with Replicate Flux 1.1 Pro...");
    const imageUrls: (string | null)[] = [];

    const aspectRatioMap: Record<string, string> = {
      landscape: "16:9",
      portrait: "9:16",
      square: "1:1"
    };
    const aspectRatio = aspectRatioMap[format] || "16:9";

    for (let i = 0; i < parsedScript.scenes.length; i++) {
      const scene = parsedScript.scenes[i];
      
      try {
        // Create prediction on Replicate (use latest model version)
        const created = await createReplicatePredictionWithRetry({
          replicateToken: REPLICATE_API_TOKEN,
          input: {
            prompt: `${scene.visualPrompt}. Style: ${styleDescription}. High quality, professional, cinematic.`,
            aspect_ratio: aspectRatio,
            output_format: "webp",
            output_quality: 90,
          },
        });

        if (!created.ok) {
          console.error(
            `Scene ${i + 1} Replicate create failed:`,
            created.status,
            created.error
          );
          imageUrls.push(null);
          continue;
        }

        const prediction = created.prediction;
        
        // Poll for completion
        let result = prediction;
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds timeout
        
        while (result.status !== "succeeded" && result.status !== "failed" && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const statusResponse = await fetch(result.urls.get, {
            headers: {
              "Authorization": `Bearer ${REPLICATE_API_TOKEN}`,
            },
          });
          
          if (statusResponse.ok) {
            result = await statusResponse.json();
          }
          attempts++;
        }

        if (result.status === "succeeded" && result.output) {
          const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
          imageUrls.push(outputUrl);
          console.log(`Scene ${i + 1} image generated`);
        } else {
          console.error(`Scene ${i + 1} image failed:`, result.status, result.error);
          imageUrls.push(null);
        }
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

      // Replicate free-tier burst limits are extremely low; space requests out
      if (i < parsedScript.scenes.length - 1) {
        await sleep(11_000);
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
