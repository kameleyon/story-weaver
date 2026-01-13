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
  subVisuals?: string[];       // Additional visual prompts for longer scenes
  duration: number;
  narrativeBeat?: "hook" | "conflict" | "choice" | "solution" | "formula"; // Track story position
  imageUrl?: string;
  imageUrls?: string[];        // Multiple images per scene
  audioUrl?: string;
  title?: string;
  subtitle?: string;
}

interface ScriptResponse {
  title: string;
  scenes: Scene[];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Sanitize visual prompts to remove any text labels, beat prefixes, or style names
// that the LLM might have included despite instructions
function sanitizeVisualPrompt(prompt: string): string {
  let cleaned = prompt;
  
  // Remove bracketed prefixes like [HOOK], [CONFLICT], [SOLUTION], [CHOICE], [FORMULA], etc.
  cleaned = cleaned.replace(/\[(HOOK|CONFLICT|CHOICE|SOLUTION|FORMULA|BEAT|SCENE|STEP|INTRO|OUTRO|CTA|TITLE|SUBTITLE)\s*[-–—:]?\s*[^\]]*\]/gi, '');
  
  // Remove style name prefixes like "Urban Minimalist Doodle style:", "Minimalist style:", etc.
  cleaned = cleaned.replace(/^(Urban\s+)?(Minimalist|Doodle|Stick|Realistic|Anime|3D[\s-]?Pixar|Claymation|Futuristic|Editorial)(\s+style)?\s*[:–—-]?\s*/gi, '');
  
  // Remove inline style mentions
  cleaned = cleaned.replace(/\b(in\s+)?(Urban\s+)?(Minimalist|Doodle)\s+style\b/gi, '');
  
  // Remove text instruction phrases that might appear
  cleaned = cleaned.replace(/\b(with\s+text|text\s+overlay|title\s+reading|text\s+saying|words|lettering|typography)\s*["']?[^,.]*["']?/gi, '');
  
  // Remove specific text that shouldn't appear as labels in images
  cleaned = cleaned.replace(/\b(HOOK|CONFLICT|CHOICE|SOLUTION|FORMULA|EDITORIAL\s+REQUIREMENTS|VISUAL\s+CONTENT|EDITORIAL\s+ILLUSTRA?E?I?O?N?S?)\b/gi, '');
  
  // Remove quotes that might contain text instructions
  cleaned = cleaned.replace(/"[A-Z][A-Z\s]{2,}"/g, '');
  
  // Clean up extra whitespace and punctuation
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/^[,.:;\s]+/, '').replace(/[,.:;\s]+$/, '');
  
  return cleaned || prompt; // Fallback to original if cleaning removed everything
}

// Style-specific prompts optimized for AI image generation
const STYLE_PROMPTS: Record<string, string> = {
  "minimalist": `Ultra-clean modern vector art. Flat 2D design with absolutely no gradients, shadows, or textures. Use sharp, geometric shapes and crisp, thin lines. Palette: Stark white background with jet black ink and a single vibrant accent color (electric blue or coral) for emphasis. High use of negative space. Professional, corporate, and sleek data-visualization aesthetic. Iconic and symbolic rather than literal. Heavily influenced by Swiss Design and Bauhaus.`,
  
  "doodle": `Urban Minimalist Doodle style. Line Work: Bold, consistent-weight black outlines (monoline) with slightly rounded terminals for a friendly, approachable feel. Color Palette: Muted Primary tones—desaturated dusty reds, sage greens, mustard yellows, and slate blues—set against a warm, textured cream or off-white background (recycled paper/newsprint texture). Character Design: 'Object-Head' surrealism—replace character heads with symbolic objects for an iconographic look. Texturing: Subtle lo-fi distressing with light paper grain, tiny ink flecks, and occasional print misalignments where color doesn't perfectly hit the line (vintage screen-print quality). Composition: Centralized and floating—main subject grounded, surrounded by a halo of smaller floating icons (coins, arrows, charts). Art Style: Flat 2D Vector Illustration / Indie Comic Aesthetic. Vibe: Lo-fi, chill, entrepreneurial, whimsical. Influences: Modern editorial illustration, 90s streetwear graphics, and Lofi Girl aesthetics.`,
  
  "stick": `Hand-drawn stick figure comic style. Crude, expressive black marker lines on a pure white or notebook paper background. Extremely simple character designs (circles for heads, single lines for limbs). No fill colors—strictly black and white line art. Focus on humor and clarity. Rough, sketchy aesthetic similar to 'XKCD' or 'Wait But Why'. Imperfect circles and wobbly lines to emphasize the handmade, napkin-sketch quality.`,
  
  "realistic": `Photorealistic cinematic photography. 4K UHD, HDR, 8k resolution. Shot on 35mm lens with shallow depth of field (bokeh) to isolate subjects. Hyper-realistic textures, dramatic studio lighting with rim lights. Natural skin tones and accurate material physics. Look of high-end stock photography or a Netflix documentary. Sharp focus, rich contrast, and true-to-life color grading. Unreal Engine 5 render quality.`,
  
  "anime": `High-quality Anime art style. Crisp cel-shaded coloring with dramatic lighting and lens flares. Vibrant, saturated color palette with emphasis on deep blue skies and lush greens. Detailed backgrounds in the style of Makoto Shinkai or Studio Ghibli. Clean fine line work. Expressive characters with large eyes. Atmospheric, emotional, and polished animation aesthetic. 2D animation look.`,
  
  "3d-pixar": `3D animated feature film style (Pixar/Disney). Soft, subsurface scattering on materials to make them look soft and touchable. Warm, bounce lighting and global illumination. Stylized characters with exaggerated features but realistic textures (fabric, hair). Vibrant, friendly color palette. Rendered in Redshift or Octane. Cute, appealing, and high-budget animation look. Smooth shapes, no sharp edges.`,
  
  "claymation": `Stop-motion claymation style. Textures of plasticine and modeling clay with visible fingerprints and imperfections. Handmade, tactile look. Soft, physical studio lighting with real shadows. Miniature photography aesthetic with tilt-shift depth of field. Vibrant, playful colors. Characters and objects look like physical toys. Imperfect, organic shapes. Aardman Animations vibe.`,
  
  "futuristic": `Clean futuristic sci-fi aesthetic. Dark background with glowing neon accents (cyan, magenta, electric purple). Holographic interfaces (HUDs) and glass textures. Sleek, metallic surfaces (chrome, brushed aluminum, matte black). Cyberpunk but minimal and tidy. High-tech, digital atmosphere. Lens flares, bloom effects, and volumetric lighting. Smooth curves, floating UI elements, and data streams.`
};

// Helper to get style prompt - uses detailed prompt if available, falls back to style name or custom style
function getStylePrompt(style: string, customStyle?: string): string {
  if (style === "custom" && customStyle) {
    return customStyle;
  }
  return STYLE_PROMPTS[style.toLowerCase()] || style;
}

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

// Generate image using Replicate prunaai/z-image-turbo
async function generateImageWithReplicate(
  prompt: string,
  replicateApiToken: string,
  format: string
): Promise<
  | { ok: true; imageBase64: string }
  | { ok: false; error: string; status?: number; retryAfterSeconds?: number }
> {
  // z-image-turbo constraints:
  // - width and height must be divisible by 16
  // - height must be <= 1440
  // Portrait targets ~9:16, Square 1:1, Landscape ~16:9
  const dimensions = format === "portrait" 
    ? { width: 720, height: 1280 }  // 9:16 ratio (both divisible by 16, height<=1440)
    : format === "square" 
    ? { width: 1024, height: 1024 } // 1:1 ratio (divisible by 16)
    : { width: 1440, height: 816 }; // ~16:9 ratio (divisible by 16, height<=1440)
  
  console.log(`[REPLICATE] Starting image generation with prunaai/z-image-turbo`);
  console.log(`[REPLICATE] Prompt (truncated): ${prompt.substring(0, 100)}...`);
  console.log(`[REPLICATE] Format: ${format}, Dimensions: ${dimensions.width}x${dimensions.height}`);
  console.log(`[REPLICATE] API Key prefix: ${replicateApiToken.substring(0, 12)}...`);
  
  try {
    const startTime = Date.now();
    
    // Create prediction with prunaai/z-image-turbo model using width/height
    const createResponse = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateApiToken}`,
        "Content-Type": "application/json",
        "Prefer": "wait", // Wait for completion (up to 60s)
      },
      body: JSON.stringify({
        version: "prunaai/z-image-turbo",
        input: {
          prompt: prompt,
          width: dimensions.width,
          height: dimensions.height,
          num_inference_steps: 50,
          guidance_scale: 0,
          output_format: "webp",
          output_quality: 100,
        },
      }),
    });

    console.log(`[REPLICATE] Response status: ${createResponse.status}`);
    console.log(`[REPLICATE] Response headers: ${JSON.stringify(Object.fromEntries(createResponse.headers))}`);

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      const retryAfterHeader = createResponse.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;

      console.error(`[REPLICATE ERROR] Status: ${createResponse.status}`);
      console.error(`[REPLICATE ERROR] Body: ${errorText}`);
      console.error(`[REPLICATE ERROR] Time elapsed: ${Date.now() - startTime}ms`);

      // Try to extract retry_after from JSON body too
      let retryAfterFromBody: number | undefined;
      try {
        const parsed = JSON.parse(errorText);
        if (typeof parsed?.retry_after === "number") retryAfterFromBody = parsed.retry_after;
      } catch {
        // ignore
      }

      const retryAfter = retryAfterFromBody ?? retryAfterSeconds;

      if (createResponse.status === 401) {
        return { ok: false, status: 401, error: "Invalid Replicate API token - please update in Settings" };
      }
      if (createResponse.status === 402) {
        return { ok: false, status: 402, error: "Replicate credits exhausted - add funds at replicate.com" };
      }
      if (createResponse.status === 429) {
        return {
          ok: false,
          status: 429,
          retryAfterSeconds: retryAfter,
          error: `Replicate throttled (429): ${errorText}`,
        };
      }
      return { ok: false, status: createResponse.status, error: `Replicate API error ${createResponse.status}: ${errorText}` };
    }

    let prediction = await createResponse.json();
    console.log(`[REPLICATE] Initial prediction status: ${prediction.status}, id: ${prediction.id}`);
    
    // Poll for completion if not done
    let pollAttempts = 0;
    const maxPolls = 60; // 60 seconds max
    
    while (prediction.status !== "succeeded" && prediction.status !== "failed" && pollAttempts < maxPolls) {
      if (prediction.status === "canceled") {
        console.error(`[REPLICATE ERROR] Prediction was canceled`);
        return { ok: false, error: "Image generation was canceled" };
      }
      
      await new Promise(r => setTimeout(r, 1000));
      pollAttempts++;
      
      console.log(`[REPLICATE] Polling attempt ${pollAttempts}, status: ${prediction.status}`);
      
      const pollResponse = await fetch(prediction.urls.get, {
        headers: { Authorization: `Bearer ${replicateApiToken}` },
      });
      
      if (!pollResponse.ok) {
        const pollErrorText = await pollResponse.text();
        console.error(`[REPLICATE ERROR] Poll failed: ${pollResponse.status} - ${pollErrorText}`);
        return { ok: false, error: `Failed to poll prediction status: ${pollResponse.status}` };
      }
      
      prediction = await pollResponse.json();
    }
    
    console.log(`[REPLICATE] Final status: ${prediction.status}, time: ${Date.now() - startTime}ms`);
    
    if (prediction.status !== "succeeded") {
      console.error(`[REPLICATE ERROR] Generation failed: ${prediction.error || "timeout"}`);
      console.error(`[REPLICATE ERROR] Full prediction: ${JSON.stringify(prediction)}`);
      return { ok: false, error: prediction.error || "Image generation timed out" };
    }
    
    // Get the output URL - z-image-turbo returns URL directly or in output
    const outputUrl = typeof prediction.output === "string" 
      ? prediction.output 
      : Array.isArray(prediction.output) 
        ? prediction.output[0] 
        : prediction.output?.url;
    
    console.log(`[REPLICATE] Output URL: ${outputUrl?.substring(0, 80)}...`);
    
    if (!outputUrl) {
      console.error(`[REPLICATE ERROR] No output URL. Full output: ${JSON.stringify(prediction.output)}`);
      return { ok: false, error: "No image URL in prediction output" };
    }
    
    // Download the image and convert to base64 (chunked to avoid stack overflow)
    const imageResponse = await fetch(outputUrl);
    if (!imageResponse.ok) {
      console.error(`[REPLICATE ERROR] Failed to download image: ${imageResponse.status}`);
      return { ok: false, error: `Failed to download generated image: ${imageResponse.status}` };
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
    
    console.log(`[REPLICATE] Success! Image size: ${bytes.length} bytes, time: ${Date.now() - startTime}ms`);
    
    return { ok: true, imageBase64: base64 };
  } catch (error) {
    console.error(`[REPLICATE ERROR] Exception: ${error}`);
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// REMOVED: Lovable AI fallback - now using Replicate only


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
    
    // Replicate is REQUIRED for image generation (no fallback)
    if (!REPLICATE_API_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Please add your Replicate API key in Settings to generate images." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[REPLICATE] Using API key: ${REPLICATE_API_TOKEN.substring(0, 12)}...`);
    console.log("Using Replicate (prunaai/z-image-turbo) for image generation");

    const { content, format, length, style, customStyle }: GenerationRequest = await req.json();

    // Scene count calculation based on minimum video duration requirements:
    // Short: min 60s (1 min), max 120s (2 min), target ~90s
    // Brief: min 150s (2.5 min), max 300s (5 min), target ~225s
    // Presentation: min 360s (6 min), max 600s (10 min), target ~480s
    // Using ~15-20s average per scene for dynamic pacing
    const lengthConfig: Record<string, { count: number; minDuration: number; maxDuration: number; targetDuration: number; avgSceneDuration: number }> = {
      short: { count: 6, minDuration: 60, maxDuration: 120, targetDuration: 90, avgSceneDuration: 15 },
      brief: { count: 12, minDuration: 150, maxDuration: 300, targetDuration: 225, avgSceneDuration: 18 },
      presentation: { count: 24, minDuration: 360, maxDuration: 600, targetDuration: 480, avgSceneDuration: 20 },
    };
    const config = lengthConfig[length] || lengthConfig.brief;
    const sceneCount = config.count;
    const avgSceneDuration = config.avgSceneDuration;
    const targetWords = Math.floor(avgSceneDuration * 2.5); // ~150 words/min = 2.5 words/sec

    // ===============================================
    // STEP 1: THE DIRECTOR - Script Generation
    // ===============================================
    const styleDescription = getStylePrompt(style, customStyle);
    const includeTextOverlay = TEXT_OVERLAY_STYLES.includes(style.toLowerCase());
    const dimensions = getImageDimensions(format);
    
    const scriptPrompt = `You are a DYNAMIC video script writer creating engaging, narrative-driven content that follows a compelling story arc.

Content: ${content}

=== TIMING REQUIREMENTS (CRITICAL) ===
- Target video duration: ${config.targetDuration} seconds (${Math.floor(config.targetDuration / 60)} min ${config.targetDuration % 60}s)
- Create exactly ${sceneCount} scenes
- MAXIMUM 25 seconds per scene (HARD LIMIT - no exceptions)
- Average scene duration: ${avgSceneDuration} seconds
- Each scene's voiceover: approximately ${targetWords} words (at 150 words/minute pace)

=== VIDEO SPECIFICATIONS ===
- Format: ${format} (${format === "landscape" ? "16:9 horizontal" : format === "portrait" ? "9:16 vertical" : "1:1 square"})
- Exact dimensions: ${dimensions.width}x${dimensions.height} pixels
- Visual style: ${styleDescription}

=== NARRATIVE ARC STRUCTURE (CRITICAL - Map scenes to these story beats) ===
Distribute your ${sceneCount} scenes across this narrative framework:

1. THE HOOK (Scenes 1-2, narrativeBeat: "hook"):
   - Visual represents the "Secret Advantage" or core promise
   - Create intrigue with a mysterious element that draws viewers in
   - Example: A glowing key, hidden door, or unexplored opportunity

2. THE CONFLICT (Early-middle scenes, narrativeBeat: "conflict"):
   - Split-screen or comparative compositions showing TENSION
   - Contrast: Success vs. Failure, Old Way vs. New Way, Patience vs. Chaos
   - Visual must be DIVIDED to show opposing forces

3. THE CHOICE (Middle scenes, narrativeBeat: "choice"):
   - Visualize the fork in the road, the decision point
   - Two modes: Power Mode (construction, progress, light) vs. Shadow Mode (doubt, stagnation, darkness)
   - Show the viewer they have agency

4. THE SOLUTION (Later scenes, narrativeBeat: "solution"):
   - Visualization of the method, system, or game plan
   - Show Time + Effort = Results as a visual progression
   - Timeline or ascending structure showing growth

5. THE FORMULA (Final scenes, narrativeBeat: "formula"):
   - Summary visual showing the complete framework/equation
   - Clear visual equation: Input + Action = Outcome
   - Triumphant, resolution imagery

=== CLEAN AUDIO RULE (CRITICAL - TEXT-TO-SPEECH WILL READ THIS ALOUD) ===
The 'voiceover' field is fed DIRECTLY into a Text-to-Speech engine that reads every word aloud.

ABSOLUTELY FORBIDDEN in voiceover (TTS will read these as spoken words):
- Labels like "Hook:", "Scene 1:", "Narrator:", "Solution:", "Point 1:"
- Actions in brackets like "[pauses]", "[dramatic music]", "[cut to]"
- Asterisks or markdown formatting like **bold** or *italic*
- Meta-instructions like "In this scene we see..." or "The narrator says..."
- ANY non-spoken formatting

REQUIRED in voiceover:
- ONLY the raw spoken words that the voice actor would say
- Natural, conversational language as if speaking to a friend
- No stage directions, no labels, no formatting

GOOD voiceover example:
"Did you know that 90% of startups fail in the first year? But here's what nobody tells you about the ones that succeed..."

BAD voiceover (TTS will read these aloud - NEVER DO THIS):
"Hook: Did you know that 90% of startups fail?"
"[Narrator] Here is what we learned..."
"**Point 1:** The first thing to understand is..."

=== VOICEOVER STYLE (Critical for engagement) ===
- Use an ENERGETIC, conversational tone like a TED speaker
- Start EACH scene with a surprising fact, provocative question, or bold statement
- Examples: "But here's what nobody tells you..." "What if I told you..." "The shocking truth is..."
- Mix short punchy sentences (5-8 words) with longer explanations
- Include rhetorical questions to create engagement pauses
- Vary emotional energy - build up, then resolve

${includeTextOverlay ? `
=== TEXT OVERLAY REQUIREMENTS ===
- Provide a punchy scene title (2-5 words, like a headline)
- Provide a subtitle (one impactful sentence - the key takeaway)
These will be integrated directly into the illustration as PART OF THE COMPOSITION.
` : ""}

=== EDITORIAL ILLUSTRATION DESIGN RULES (CRITICAL for visual prompts) ===
Generate prompts for EDITORIAL ILLUSTRATIONS or INFOGRAPHIC SLIDES with clear visual storytelling.

SEMANTIC LAYOUT RULES (visual structure MUST match concept):
- "Two Modes" or "Comparison" → composition MUST be visually SPLIT (left/right or top/bottom)
- "Stacking Up" or "Growth" → visual elements MUST be vertical and ASCENDING
- "Timeline" or "Journey" → HORIZONTAL progression with clear stages
- "Formula" or "Equation" → equation-style layout with visual operators (icons representing +, =, →)
- "Choice" or "Fork" → clear DIVERGING paths

COMPOSITION REQUIREMENTS:
- Describe CONCRETE visual elements: objects, characters, settings, lighting
- Specify layout arrangement: centered, split, diagonal, ascending, etc.
- Include mood, colors, and atmosphere
- Use visual metaphors, NOT text labels in the illustration

=== VISUAL PROMPT FORMAT (ABSOLUTELY CRITICAL - ZERO TEXT IN IMAGES!) ===

**THE IMAGE GENERATOR RENDERS ANY WORDS AS VISIBLE TEXT IN THE IMAGE**
This means if you write "HOOK" or "FORMULA" anywhere in visualPrompt, it will appear as ugly, garbled text burned into the image. This RUINS the output.

ABSOLUTELY FORBIDDEN in visualPrompt (will cause text to render in image):
- ANY word in ALL CAPS (like HOOK, CONFLICT, SOLUTION, FORMULA, SUCCESS, STEP)
- ANY bracketed prefixes like [HOOK], [CONFLICT], [SOLUTION], etc.
- Style names like "Urban Minimalist", "Doodle style", etc.
- Scene numbers, beat labels, or category names
- Instructions or metadata
- ANY word meant as a label or title

REQUIRED in visualPrompt:
- ONLY describe visual objects, people, actions, colors, lighting, composition
- Describe what a camera would SEE, not concepts or labels
- Use lowercase descriptive language
- Use visual metaphors (e.g., "a glowing key above a locked chest" for opportunity)

GOOD visualPrompt example:
"A split composition showing contrast. On the left, a chaotic desk with scattered papers, cluttered screens, coffee cups, harsh fluorescent lighting. On the right, a clean organized workspace with a single project, neat stacks, a thriving plant, warm golden sunlight through a window. Muted earth tones with green accent on the organized side. Overhead camera angle."

BAD visualPrompt (WILL RENDER AS TEXT IN IMAGE - NEVER DO THIS):
"[HOOK] Urban Minimalist showing productivity..."
"The word SUCCESS above a trophy..."
"FORMULA: diagram showing steps..."
"HOOK visual with editorial layout..."

=== OUTPUT FORMAT ===
Return ONLY valid JSON with this exact structure:
{
  "title": "Engaging Video Title",
  "scenes": [
    {
      "number": 1,
      "narrativeBeat": "hook",
      "voiceover": "Hook opening that grabs attention... main content with varied pacing...",
      "visualPrompt": "A glowing golden key floating in darkness, surrounded by swirling particles of light. The key hovers over a mysterious locked box with intricate engravings. Dramatic rim lighting highlights the key's edges. Dark navy background fading to deep purple at the edges. Sense of anticipation and hidden potential.",
      "subVisuals": ["Close-up of fingers reaching toward the floating key, soft focus on the background", "The box beginning to open with rays of warm light spilling out"],
      "duration": 18${includeTextOverlay ? `,
      "title": "Punchy Headline",
      "subtitle": "Key takeaway in one impactful line"` : ""}
    }
  ]
}

REMEMBER:
- NO scene over 25 seconds
- Exactly ${sceneCount} scenes
- Map each scene to a narrativeBeat: hook, conflict, choice, solution, or formula
- visualPrompt must contain ONLY visual descriptions - NO text labels, NO style names, NO beat prefixes
- Semantic layouts: visual composition reflects the narrative concept through visual metaphor`;

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
    console.log("Step 3: Generating images (with sub-visuals for longer scenes)...");
    
    // Build image prompt helper function with editorial design rules
    const buildImagePrompt = (visualPrompt: string, scene: Scene, subIndex: number = 0): string => {
      const orientationDesc = format === "portrait" 
        ? "VERTICAL/PORTRAIT orientation (taller than wide, 9:16 aspect ratio)"
        : format === "square" 
        ? "SQUARE orientation (equal width and height, 1:1 aspect ratio)"
        : "HORIZONTAL/LANDSCAPE orientation (wider than tall, 16:9 aspect ratio)";
      
      // Narrative beat context for image generation
      const beatContext = scene.narrativeBeat ? `
NARRATIVE CONTEXT: This is a "${scene.narrativeBeat.toUpperCase()}" scene in the story arc.
${scene.narrativeBeat === "hook" ? "Create intrigue and mystery - draw viewers in with something captivating." : ""}
${scene.narrativeBeat === "conflict" ? "Show TENSION through split/comparative composition - opposing forces clearly divided." : ""}
${scene.narrativeBeat === "choice" ? "Visualize DIVERGING paths or two distinct options - the fork in the road." : ""}
${scene.narrativeBeat === "solution" ? "Show PROGRESSION and growth - ascending elements, timeline, building upward." : ""}
${scene.narrativeBeat === "formula" ? "Create a SUMMARY visual - equation layout showing Input + Action = Outcome." : ""}` : "";

      // Editorial design rules
      const editorialRules = `
EDITORIAL ILLUSTRATION REQUIREMENTS:
- This is an INFOGRAPHIC SLIDE, not just an illustration
- Text is PART OF THE COMPOSITION, not a label stuck on top
- Visual structure MUST match conceptual structure semantically:
  * Comparisons → SPLIT composition (left/right or top/bottom)
  * Growth/Progress → ASCENDING/vertical elements
  * Timelines → HORIZONTAL progression
  * Formulas → EQUATION layout with visual operators
- Reserve clear NEGATIVE SPACE zones for all text elements
- Background must have CONTRAST zones for text legibility
- Text hierarchy: Headline (big/bold/upper-third), Subtext (smaller/integrated), Labels (minimal)`;

      let textOverlayInstructions = "";
      // Only include text overlay on the primary image (subIndex 0)
      if (includeTextOverlay && scene.title && subIndex === 0) {
        textOverlayInstructions = `

TEXT INTEGRATION (Critical - text is part of the artwork):
- Display scene number "${scene.number}" prominently (large, stylized, like a chapter number)
- HEADLINE: "${scene.title}" - big, bold, positioned in upper third with clean background zone
- SUBTITLE: "${scene.subtitle || ""}" - smaller text below headline, integrated into composition
- Use ${styleDescription} style lettering that matches the illustration
- Ensure dedicated NEGATIVE SPACE behind text - never place text over busy areas
- Text placement: Upper third for headline, supporting elements anchor the composition below`;
      }

      const subVisualNote = subIndex > 0 
        ? `\n\nSEQUENCE NOTE: This is visual ${subIndex + 1} of ${(scene.subVisuals?.length || 0) + 1} for this scene.
Show PROGRESSION from the previous visual: different angle, next moment in time, or evolution of the concept.
Maintain visual continuity with previous images in this scene.` 
        : "";

      return `Generate an EDITORIAL ILLUSTRATION in EXACTLY ${orientationDesc}.

=== TECHNICAL REQUIREMENTS ===
- Format: ${format.toUpperCase()}
- Dimensions: ${dimensions.width}x${dimensions.height} pixels
- Aspect ratio: ${format === "portrait" ? "9:16 (vertical)" : format === "square" ? "1:1 (square)" : "16:9 (horizontal)"}
${beatContext}
${editorialRules}

=== VISUAL CONTENT ===
${visualPrompt}

=== STYLE ===
${styleDescription} style editorial illustration. Professional, cohesive aesthetic.
${textOverlayInstructions}${subVisualNote}

=== COMPOSITION REMINDER ===
The visual structure must SEMANTICALLY MATCH the concept:
- If it's a comparison → use SPLIT composition
- If it's progression → use ASCENDING layout
- If it's a formula → use EQUATION layout with visual operators
Create DYNAMIC composition with clear focal hierarchy. Reserve negative space for text.`
    };

    // Collect all image prompts (including sub-visuals for longer scenes)
    interface ImageTask {
      sceneIndex: number;
      subIndex: number; // 0 = primary, 1+ = sub-visuals
      prompt: string;
    }
    
    const imageTasks: ImageTask[] = [];
    
    for (let i = 0; i < parsedScript.scenes.length; i++) {
      const scene = parsedScript.scenes[i];
      
      // Primary visual (always) - sanitize the prompt before building
      const sanitizedMainPrompt = sanitizeVisualPrompt(scene.visualPrompt);
      imageTasks.push({
        sceneIndex: i,
        subIndex: 0,
        prompt: buildImagePrompt(sanitizedMainPrompt, scene, 0)
      });
      
      // Sub-visuals based on scene duration
      if (scene.subVisuals && scene.subVisuals.length > 0 && scene.duration >= 12) {
        // Scenes 12-18s: 1 sub-visual, 19-25s: 2 sub-visuals
        const maxSubVisuals = scene.duration >= 19 ? 2 : 1;
        const subVisualsToUse = Math.min(scene.subVisuals.length, maxSubVisuals);
        
        for (let j = 0; j < subVisualsToUse; j++) {
          const sanitizedSubPrompt = sanitizeVisualPrompt(scene.subVisuals[j]);
          imageTasks.push({
            sceneIndex: i,
            subIndex: j + 1,
            prompt: buildImagePrompt(sanitizedSubPrompt, scene, j + 1)
          });
        }
      }
    }
    
    console.log(`Total images to generate: ${imageTasks.length} for ${parsedScript.scenes.length} scenes`);
    
    // Store image task count in generation record for frontend progress display
    await supabase.from("generations").update({ 
      progress: 40,
      // Store metadata for frontend: totalImages field in scenes JSON
      scenes: parsedScript.scenes.map((s, idx) => ({
        ...s,
        _meta: { totalImages: imageTasks.length, sceneIndex: idx }
      }))
    }).eq("id", generation.id);
    
    // Storage for results: sceneIndex -> array of image URLs
    const sceneImageUrls: (string | null)[][] = parsedScript.scenes.map(() => []);

    // Process images in PARALLEL batches of 3 for speed
    // Replicate handles concurrent requests well; we batch to avoid overwhelming and for progress updates
    const IMAGE_BATCH_SIZE = 3;
    const INTER_IMAGE_BATCH_DELAY_MS = 2000; // Small delay between batches
    
    // Helper to update progress and persist partial results after each image
    const persistProgress = async (completedCount: number) => {
      const progress = 40 + Math.floor((completedCount / imageTasks.length) * 50);
      
      // Build partial scenes with current image URLs for recovery
      const partialScenes = parsedScript.scenes.map((scene, idx) => {
        const allImages = sceneImageUrls[idx].filter(url => url !== null) as string[];
        return {
          ...scene,
          imageUrl: allImages[0] || null,
          imageUrls: allImages.length > 0 ? allImages : undefined,
          audioUrl: audioUrls[idx] || null,
          _meta: { 
            totalImages: imageTasks.length, 
            completedImages: completedCount,
            sceneIndex: idx 
          }
        };
      });
      
      await supabase.from("generations").update({ 
        progress,
        scenes: partialScenes
      }).eq("id", generation.id);
    };

    let completedImages = 0;

    for (let batchStart = 0; batchStart < imageTasks.length; batchStart += IMAGE_BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + IMAGE_BATCH_SIZE, imageTasks.length);
      const batchPromises: Promise<{ task: ImageTask; url: string | null }>[] = [];

      for (let t = batchStart; t < batchEnd; t++) {
        const task = imageTasks[t];
        
        batchPromises.push(
          (async () => {
            try {
              let result:
                | { ok: true; imageBase64: string }
                | { ok: false; error: string; status?: number; retryAfterSeconds?: number }
                | undefined;

              let lastError = "";

              const logPrefix = task.subIndex > 0
                ? `Scene ${task.sceneIndex + 1} visual ${task.subIndex + 1}`
                : `Scene ${task.sceneIndex + 1}`;

              // Generate image with Replicate (required, no fallback) + retry on throttling
              const MAX_IMAGE_ATTEMPTS = 10;
              for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS; attempt++) {
                console.log(
                  `${logPrefix}: Generating with Replicate (image ${t + 1}/${imageTasks.length}) attempt ${attempt}/${MAX_IMAGE_ATTEMPTS}...`
                );

                const attemptResult = await generateImageWithReplicate(task.prompt, REPLICATE_API_TOKEN!, format);

                if (attemptResult.ok) {
                  result = attemptResult;
                  break;
                }

                lastError = attemptResult.error;
                console.error(`${logPrefix} image failed: ${attemptResult.error}`);
                console.error(
                  `[REPLICATE ERROR] Scene ${task.sceneIndex + 1}, sub ${task.subIndex}: ${attemptResult.error}`
                );

                if (attempt === MAX_IMAGE_ATTEMPTS) {
                  throw new Error(
                    `${logPrefix}: Image generation failed after ${MAX_IMAGE_ATTEMPTS} attempts: ${attemptResult.error}`
                  );
                }

                // If throttled, honor retry_after when present; otherwise back off conservatively.
                const retryAfterMs =
                  attemptResult.status === 429
                    ? Math.max(1000, (attemptResult.retryAfterSeconds ?? 8) * 1000)
                    : 8000;

                const jitter = Math.floor(Math.random() * 400);
                await sleep(retryAfterMs + jitter);
              }

              if (!result || !result.ok) {
                // Should be unreachable because we either break on success or throw on final failure.
                throw new Error(`${logPrefix}: Image generation failed: ${lastError || "unknown error"}`);
              }

              const imageBytes = new Uint8Array(base64Decode(result.imageBase64));
              const imageBlob = new Blob([imageBytes], { type: "image/png" });
              const imageSuffix = task.subIndex > 0 ? `-${task.subIndex + 1}` : "";
              const imagePath = `${user.id}/${project.id}/scene-${task.sceneIndex + 1}${imageSuffix}.png`;

              const { error: uploadError } = await supabase.storage
                .from("audio")
                .upload(imagePath, imageBlob, {
                  contentType: "image/png",
                  upsert: true,
                });

              if (uploadError) {
                console.error(`${logPrefix} image upload failed:`, uploadError);
                return { task, url: null };
              }

              const { data: { publicUrl } } = supabase.storage
                .from("audio")
                .getPublicUrl(imagePath);

              console.log(`${logPrefix} image generated successfully`);
              return { task, url: publicUrl };
            } catch (imgError) {
              console.error(`Scene ${task.sceneIndex + 1} image error:`, imgError);
              return { task, url: null };
            }
          })()
        );
      }

      const batchResults = await Promise.all(batchPromises);
      
      for (const { task, url } of batchResults) {
        // Ensure the array is long enough
        while (sceneImageUrls[task.sceneIndex].length <= task.subIndex) {
          sceneImageUrls[task.sceneIndex].push(null);
        }
        sceneImageUrls[task.sceneIndex][task.subIndex] = url;
        completedImages++;
      }

      // Persist progress after each batch for recovery
      await persistProgress(completedImages);
      console.log(`Image progress: ${completedImages}/${imageTasks.length} complete`);
      
      // Small delay between batches to avoid overwhelming
      if (batchEnd < imageTasks.length) {
        await sleep(INTER_IMAGE_BATCH_DELAY_MS);
      }
    }
    
    const totalImagesGenerated = sceneImageUrls.flat().filter(u => u !== null).length;
    console.log(`Image generation complete: ${totalImagesGenerated}/${imageTasks.length} images for ${parsedScript.scenes.length} scenes`);

    // ===============================================
    // STEP 4: FINALIZE - Compile results
    // ===============================================
    console.log("Step 4: Finalizing generation...");
    
    const finalScenes = parsedScript.scenes.map((scene, idx) => {
      const allImages = sceneImageUrls[idx].filter(url => url !== null) as string[];
      return {
        ...scene,
        imageUrl: allImages[0] || null,          // Primary image (backward compatible)
        imageUrls: allImages.length > 0 ? allImages : undefined,  // All images for the scene
        audioUrl: audioUrls[idx] || null,
      };
    });

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
