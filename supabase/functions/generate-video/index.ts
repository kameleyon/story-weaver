import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============= TYPES =============
interface GenerationRequest {
  // For starting new generation
  content?: string;
  format?: string;
  length?: string;
  style?: string;
  customStyle?: string;
  // For chunked phases
  phase?: "script" | "audio" | "images" | "finalize";
  generationId?: string;
  projectId?: string;
}

interface Scene {
  number: number;
  voiceover: string;
  visualPrompt: string;
  subVisuals?: string[];
  duration: number;
  narrativeBeat?: "hook" | "conflict" | "choice" | "solution" | "formula";
  imageUrl?: string;
  imageUrls?: string[];
  audioUrl?: string;
  title?: string;
  subtitle?: string;
  _meta?: {
    statusMessage?: string;
    totalImages?: number;
    completedImages?: number;
    sceneIndex?: number;
    costTracking?: CostTracking;
    phaseTimings?: Record<string, number>;
    totalTimeMs?: number;
    lastUpdate?: string;
  };
}

interface ScriptResponse {
  title: string;
  scenes: Scene[];
}

interface CostTracking {
  scriptTokens: number;
  audioSeconds: number;
  imagesGenerated: number;
  estimatedCostUsd: number;
}

// ============= CONSTANTS =============
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Pricing estimates (approximate)
const PRICING = {
  scriptPerToken: 0.000001, // ~$1 per 1M tokens
  audioPerSecond: 0.002,    // ~$0.002 per second
  imagePerImage: 0.02,      // ~$0.02 per image
};

// ============= PCM SILENCE TRIMMING =============
// Trims leading and trailing silence from 16-bit PCM audio
function trimPcmSilence(
  pcmBytes: Uint8Array,
  sampleRate: number,
  options?: { threshold?: number; bufferMs?: number }
): Uint8Array {
  const SILENCE_THRESHOLD = options?.threshold ?? 500; // Higher threshold to catch quiet noise floor
  const BUFFER_BYTES = Math.floor((options?.bufferMs ?? 80) * sampleRate * 2 / 1000); // 80ms buffer (2 bytes per sample)
  
  if (pcmBytes.length < 4) return pcmBytes;
  
  let trimStart = 0;
  let trimEnd = pcmBytes.length;
  
  // Find where audio actually starts (trim leading silence)
  for (let i = 0; i < pcmBytes.length - 1; i += 2) {
    const sample = Math.abs((pcmBytes[i] | (pcmBytes[i + 1] << 8)) << 16 >> 16);
    if (sample > SILENCE_THRESHOLD) {
      // Found audio, go back by buffer amount
      trimStart = Math.max(0, i - BUFFER_BYTES);
      break;
    }
  }
  
  // Find where audio actually ends (trim trailing silence)
  for (let i = pcmBytes.length - 2; i >= 0; i -= 2) {
    const sample = Math.abs((pcmBytes[i] | (pcmBytes[i + 1] << 8)) << 16 >> 16);
    if (sample > SILENCE_THRESHOLD) {
      // Found audio, add buffer
      trimEnd = Math.min(pcmBytes.length, i + BUFFER_BYTES);
      break;
    }
  }
  
  // Ensure we have at least some audio
  if (trimStart >= trimEnd) return pcmBytes;
  
  // Ensure byte alignment (must be even for 16-bit samples)
  trimStart = trimStart - (trimStart % 2);
  trimEnd = trimEnd + (trimEnd % 2);
  
  return pcmBytes.slice(trimStart, trimEnd);
}

const STYLE_PROMPTS: Record<string, string> = {
  "minimalist": `Ultra-clean modern vector art. Flat 2D design with absolutely no gradients, shadows, or textures. Use sharp, geometric shapes and crisp, thin lines. Palette: Stark white background with jet black ink and a single vibrant accent color (electric blue or coral) for emphasis. High use of negative space. Professional, corporate, and sleek data-visualization aesthetic. Iconic and symbolic rather than literal. Heavily influenced by Swiss Design and Bauhaus.`,
  "doodle": `Urban Minimalist Doodle style. Flat 2D vector illustration with indie comic aesthetic. LINE WORK: Bold, consistent-weight black outlines (monoline) that feel hand-drawn but clean, with slightly rounded terminals for a friendly, approachable feel. COLOR PALETTE: Muted Primary tones—desaturated dusty reds, sage greens, mustard yellows, and slate blues—set against a warm, textured cream or off-white background reminiscent of recycled paper or newsprint. CHARACTER DESIGN: Object-Head surrealism where character heads are replaced with symbolic objects creating an instant iconographic look that is relatable yet stylized. TEXTURING: Subtle Lo-Fi distressing with light paper grain, tiny ink flecks, and occasional print misalignments where color doesn't perfectly hit the line for a vintage screen-printed quality. COMPOSITION: Centralized and Floating—main subject grounded surrounded by a halo of smaller floating icons (coins, arrows, charts) representing the theme without cluttering. Technical style: Flat 2D Vector Illustration, Indie Comic Aesthetic. Vibe: Lo-fi, Chill, Entrepreneurial, Whimsical. Influences: Modern editorial illustration, 90s streetwear graphics, and Lofi Girl aesthetics.`,
  "stick": `Hand-drawn stick figure comic style. Crude, expressive black marker lines on a pure white or notebook paper background. Extremely simple character designs (circles for heads, single lines for limbs). No fill colors—strictly black and white line art. Focus on humor and clarity. Rough, sketchy aesthetic similar to 'XKCD' or 'Wait But Why'. Imperfect circles and wobbly lines to emphasize the handmade, napkin-sketch quality.`,
  "realistic": `Photorealistic cinematic photography. 4K UHD, HDR, 8k resolution. Shot on 35mm lens with shallow depth of field (bokeh) to isolate subjects. Hyper-realistic textures, dramatic studio lighting with rim lights. Natural skin tones and accurate material physics. Look of high-end stock photography or a Netflix documentary. Sharp focus, rich contrast, and true-to-life color grading. Unreal Engine 5 render quality.`,
  "anime": `High-quality Anime art style. Crisp cel-shaded coloring with dramatic lighting and lens flares. Vibrant, saturated color palette with emphasis on deep blue skies and lush greens. Detailed backgrounds in the style of Makoto Shinkai or Studio Ghibli. Clean fine line work. Expressive characters with large eyes. Atmospheric, emotional, and polished animation aesthetic. 2D animation look.`,
  "3d-pixar": `3D animated feature film style (Pixar/Disney). Soft, subsurface scattering on materials to make them look soft and touchable. Warm, bounce lighting and global illumination. Stylized characters with exaggerated features but realistic textures (fabric, hair). Vibrant, friendly color palette. Rendered in Redshift or Octane. Cute, appealing, and high-budget animation look. Smooth shapes, no sharp edges.`,
  "claymation": `Stop-motion claymation style. Textures of plasticine and modeling clay with visible fingerprints and imperfections. Handmade, tactile look. Soft, physical studio lighting with real shadows. Miniature photography aesthetic with tilt-shift depth of field. Vibrant, playful colors. Characters and objects look like physical toys. Imperfect, organic shapes. Aardman Animations vibe.`,
  "futuristic": `Clean futuristic sci-fi aesthetic. Dark background with glowing neon accents (cyan, magenta, electric purple). Holographic interfaces (HUDs) and glass textures. Sleek, metallic surfaces (chrome, brushed aluminum, matte black). Cyberpunk but minimal and tidy. High-tech, digital atmosphere. Lens flares, bloom effects, and volumetric lighting. Smooth curves, floating UI elements, and data streams.`
};

const TEXT_OVERLAY_STYLES = ["minimalist", "doodle", "stick"];

// ============= HELPER FUNCTIONS =============
function getStylePrompt(style: string, customStyle?: string): string {
  if (style === "custom" && customStyle) return customStyle;
  return STYLE_PROMPTS[style.toLowerCase()] || style;
}

function getImageDimensions(format: string): { width: number; height: number } {
  switch (format) {
    case "portrait": return { width: 1080, height: 1920 };
    case "square": return { width: 1080, height: 1080 };
    default: return { width: 1920, height: 1080 };
  }
}

// Paralinguistic tags to preserve for natural TTS expression
const ALLOWED_PARALINGUISTIC_TAGS = [
  "clear throat", "sigh", "sush", "cough", "groan", 
  "sniff", "gasp", "chuckle", "laugh"
];

function sanitizeVoiceover(input: unknown): string {
  const raw = typeof input === "string" ? input : "";
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .replace(/^\s*(?:hook|scene\s*\d+|narrator|body|solution|conflict|choice|formula)\s*[:\-–—]\s*/i, "")
        .replace(/^\s*\[[^\]]+\]\s*/g, "")
    );
  let out = lines.join(" ");
  
  // Remove bracketed content EXCEPT allowed paralinguistic tags
  out = out.replace(/\[([^\]]+)\]/g, (match, content) => {
    const normalized = content.toLowerCase().trim();
    if (ALLOWED_PARALINGUISTIC_TAGS.includes(normalized)) {
      return match; // Keep the tag
    }
    return " "; // Remove other bracketed content
  });
  
  out = out.replace(/[*_~`]+/g, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

// ============= LANGUAGE DETECTION =============
function isHaitianCreole(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Common Haitian Creole words and patterns
  const creoleIndicators = [
    // Common words
    "mwen", "ou", "li", "nou", "yo", "sa", "ki", "nan", "pou", "ak",
    "pa", "se", "te", "ap", "gen", "fè", "di", "ale", "vin", "bay",
    "konnen", "wè", "pran", "mete", "vle", "kapab", "dwe", "bezwen",
    "tankou", "paske", "men", "lè", "si", "kote", "kouman", "poukisa",
    "anpil", "tout", "chak", "yon", "de", "twa", "kat", "senk",
    // Haitian specific
    "ayiti", "kreyòl", "kreyol", "bondye", "mèsi", "bonjou", "bonswa",
    "kijan", "eske", "kounye", "toujou", "jamè", "anvan", "apre",
    // Verb markers
    "t ap", "te", "pral", "ta"
  ];
  
  let matchCount = 0;
  for (const indicator of creoleIndicators) {
    const regex = new RegExp(`\\b${indicator}\\b`, "gi");
    if (regex.test(lowerText)) matchCount++;
  }
  
  // If 3+ Creole indicators found, likely Haitian Creole
  return matchCount >= 3;
}

// ============= PCM TO WAV CONVERSION =============
function pcmToWav(pcmData: Uint8Array, sampleRate: number = 24000, numChannels: number = 1, bitsPerSample: number = 16): Uint8Array {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  
  // RIFF header
  view.setUint8(0, 0x52); // R
  view.setUint8(1, 0x49); // I
  view.setUint8(2, 0x46); // F
  view.setUint8(3, 0x46); // F
  view.setUint32(4, totalSize - 8, true); // File size - 8
  view.setUint8(8, 0x57);  // W
  view.setUint8(9, 0x41);  // A
  view.setUint8(10, 0x56); // V
  view.setUint8(11, 0x45); // E
  
  // fmt subchunk
  view.setUint8(12, 0x66); // f
  view.setUint8(13, 0x6D); // m
  view.setUint8(14, 0x74); // t
  view.setUint8(15, 0x20); // (space)
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  
  // data subchunk
  view.setUint8(36, 0x64); // d
  view.setUint8(37, 0x61); // a
  view.setUint8(38, 0x74); // t
  view.setUint8(39, 0x61); // a
  view.setUint32(40, dataSize, true);
  
  // Copy PCM data
  const wavArray = new Uint8Array(buffer);
  wavArray.set(pcmData, headerSize);
  
  return wavArray;
}

// Extra sanitization for Gemini TTS to avoid content filtering
function sanitizeForGeminiTTS(text: string): string {
  let sanitized = sanitizeVoiceover(text);
  
  // Temporarily replace paralinguistic tags with placeholders
  const tagPlaceholders: string[] = [];
  sanitized = sanitized.replace(/\[([^\]]+)\]/g, (match, content) => {
    const normalized = content.toLowerCase().trim();
    if (ALLOWED_PARALINGUISTIC_TAGS.includes(normalized)) {
      tagPlaceholders.push(match);
      return `__PTAG${tagPlaceholders.length - 1}__`;
    }
    return " ";
  });
  
  // Remove any remaining special characters that might trigger filters
  sanitized = sanitized.replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF.,!?;:'-]/g, ' ');
  
  // Restore paralinguistic tags
  tagPlaceholders.forEach((tag, i) => {
    sanitized = sanitized.replace(`__PTAG${i}__`, tag);
  });
  
  // Collapse multiple spaces
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  // Ensure it ends with proper punctuation for natural speech
  if (sanitized && !/[.!?]$/.test(sanitized)) {
    sanitized += '.';
  }
  
  return sanitized;
}

// ============= GEMINI TTS FOR HAITIAN CREOLE =============
async function generateSceneAudioGemini(
  scene: Scene,
  sceneIndex: number,
  googleApiKey: string,
  supabase: any,
  userId: string,
  projectId: string,
  retryAttempt: number = 0
): Promise<{ url: string | null; error?: string; durationSeconds?: number }> {
  let voiceoverText = sanitizeForGeminiTTS(scene.voiceover);
  
  if (!voiceoverText || voiceoverText.length < 2) {
    return { url: null, error: "No voiceover text" };
  }
  
  // On retries, add slight text variation to bypass content filtering
  if (retryAttempt > 0) {
    // Add a soft breathing pause at the start to slightly vary the input
    const variations = [
      "... " + voiceoverText,
      voiceoverText + " ...",
      ". " + voiceoverText,
    ];
    voiceoverText = variations[retryAttempt % variations.length];
  }

  try {
    console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} - Using Gemini 2.5 Flash TTS for Haitian Creole`);
    console.log(`[TTS-Gemini] Text length: ${voiceoverText.length} chars, retry: ${retryAttempt}`);
    
    // Use Gemini 2.5 Flash TTS model (dedicated TTS model)
    // Voice: Kore (Female) - natural, conversational, and enthusiastic
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${googleApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ 
              text: `[Speak with natural enthusiasm, warmth and energy like sharing exciting news with a friend] ${voiceoverText}` 
            }]
          }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Kore"
                }
              }
            }
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[TTS-Gemini] API error response:`, errText);
      throw new Error(`Gemini TTS failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    console.log(`[TTS-Gemini] Response structure:`, JSON.stringify(Object.keys(data)));
    
    // Check for candidates
    if (!data.candidates || data.candidates.length === 0) {
      console.error(`[TTS-Gemini] No candidates in response:`, JSON.stringify(data));
      throw new Error("No candidates in Gemini response");
    }
    
    const candidate = data.candidates[0];
    const content = candidate?.content;
    const parts = content?.parts;
    
    if (!parts || parts.length === 0) {
      console.error(`[TTS-Gemini] No parts in candidate:`, JSON.stringify(candidate));
      throw new Error("No parts in Gemini response");
    }
    
    const inlineData = parts[0]?.inlineData;
    if (!inlineData || !inlineData.data) {
      console.error(`[TTS-Gemini] No inlineData:`, JSON.stringify(parts[0]));
      throw new Error("No audio data in Gemini response");
    }
    
    const audioData = inlineData.data;
    const mimeType = inlineData.mimeType || "audio/L16";
    console.log(`[TTS-Gemini] Got audio data, mimeType: ${mimeType}, base64 length: ${audioData.length}`);

    // Decode base64 audio (raw PCM data)
    const rawPcmBytes = base64Decode(audioData);
    console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} raw PCM bytes: ${rawPcmBytes.length}`);
    
    // Trim leading AND trailing silence aggressively (24kHz sample rate)
    const pcmBytes = trimPcmSilence(rawPcmBytes, 24000, { threshold: 500, bufferMs: 80 });
    console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} trimmed to ${pcmBytes.length} bytes (removed ${rawPcmBytes.length - pcmBytes.length} bytes of silence)`);
    
    // Convert PCM to WAV (Gemini returns 24kHz, 16-bit mono PCM)
    const wavBytes = pcmToWav(pcmBytes, 24000, 1, 16);
    console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} WAV bytes: ${wavBytes.length}`);

    // Calculate accurate duration (24kHz, 16-bit mono = 48000 bytes per second)
    const durationSeconds = Math.max(1, pcmBytes.length / (24000 * 2));

    const audioPath = `${userId}/${projectId}/scene-${sceneIndex + 1}.wav`;
    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(audioPath, wavBytes, { contentType: "audio/wav", upsert: true });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: { publicUrl } } = supabase.storage.from("audio").getPublicUrl(audioPath);
    console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} audio uploaded OK`);
    return { url: publicUrl, durationSeconds };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown Gemini TTS error";
    console.error(`[TTS-Gemini] Scene ${sceneIndex + 1} error:`, errorMsg);
    return { url: null, error: errorMsg };
  }
}

// ============= TTS GENERATION (Replicate Chatterbox) =============
async function generateSceneAudioReplicate(
  scene: Scene,
  sceneIndex: number,
  replicateApiKey: string,
  supabase: any,
  userId: string,
  projectId: string
): Promise<{ url: string | null; error?: string; durationSeconds?: number }> {
  const TTS_ATTEMPTS = 3;
  const TTS_RETRY_BASE_DELAY_MS = 2000;
  const voiceoverText = sanitizeVoiceover(scene.voiceover);
  
  if (!voiceoverText || voiceoverText.length < 2) {
    return { url: null, error: "No voiceover text" };
  }

  let finalAudioUrl: string | null = null;
  let lastError: string | null = null;
  let durationSeconds = 0;

  for (let attempt = 1; attempt <= TTS_ATTEMPTS; attempt++) {
    try {
      console.log(`[TTS] Scene ${sceneIndex + 1} attempt ${attempt} - Starting Replicate Chatterbox TTS`);
      
      // Use official model endpoint (no version hash needed for official models)
      const createResponse = await fetch("https://api.replicate.com/v1/models/resemble-ai/chatterbox-turbo/predictions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${replicateApiKey}`,
          "Content-Type": "application/json",
          "Prefer": "wait"
        },
        body: JSON.stringify({
          input: {
            text: voiceoverText,
            voice: "Marisol",
            temperature: 1,
            top_p: 0.9,
            top_k: 1800,
            repetition_penalty: 1.5
          }
        })
      });

      if (!createResponse.ok) {
        const errText = await createResponse.text();
        throw new Error(`Replicate TTS failed: ${createResponse.status} - ${errText}`);
      }

      let prediction = await createResponse.json();
      console.log(`[TTS] Scene ${sceneIndex + 1} prediction status: ${prediction.status}, id: ${prediction.id}`);

      // Poll if not completed
      while (prediction.status !== "succeeded" && prediction.status !== "failed") {
        await sleep(1000);
        const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
          headers: { "Authorization": `Bearer ${replicateApiKey}` }
        });
        prediction = await pollResponse.json();
      }

      if (prediction.status === "failed") {
        throw new Error(prediction.error || "TTS prediction failed");
      }

      const outputUrl = prediction.output;
      if (!outputUrl) throw new Error("No output URL from TTS");

      console.log(`[TTS] Scene ${sceneIndex + 1} output URL: ${outputUrl.substring(0, 80)}...`);

      // Download and upload to Supabase
      const audioResponse = await fetch(outputUrl);
      if (!audioResponse.ok) throw new Error("Failed to download audio");

      const rawAudioBytes = new Uint8Array(await audioResponse.arrayBuffer());
      console.log(`[TTS] Scene ${sceneIndex + 1} raw audio - ${rawAudioBytes.length} bytes`);

      // Replicate returns WAV format - extract PCM, trim silence, re-wrap as WAV
      // WAV header is typically 44 bytes, PCM data follows
      let audioBytes: Uint8Array = rawAudioBytes;
      if (rawAudioBytes.length > 44) {
        // Check for WAV header (RIFF....WAVEfmt )
        const isWav = rawAudioBytes[0] === 0x52 && rawAudioBytes[1] === 0x49 && 
                      rawAudioBytes[2] === 0x46 && rawAudioBytes[3] === 0x46;
        
        if (isWav) {
          // Find 'data' chunk (marker: 0x64 0x61 0x74 0x61 = "data")
          let dataStart = 44; // Default WAV header size
          for (let i = 0; i < Math.min(200, rawAudioBytes.length - 4); i++) {
            if (rawAudioBytes[i] === 0x64 && rawAudioBytes[i+1] === 0x61 && 
                rawAudioBytes[i+2] === 0x74 && rawAudioBytes[i+3] === 0x61) {
              dataStart = i + 8; // Skip "data" + 4 bytes size
              break;
            }
          }
          
          // Copy to new ArrayBuffer to ensure proper types
          const pcmBuffer = rawAudioBytes.buffer.slice(dataStart);
          const rawPcm = new Uint8Array(pcmBuffer);
          // Chatterbox outputs 44.1kHz audio
          const trimmedPcm = trimPcmSilence(rawPcm, 44100, { threshold: 500, bufferMs: 80 });
          console.log(`[TTS] Scene ${sceneIndex + 1} trimmed to ${trimmedPcm.length} bytes (removed ${rawPcm.length - trimmedPcm.length} bytes of silence)`);
          
          // Re-wrap as WAV - copy result to ensure type consistency
          const wavResult = pcmToWav(trimmedPcm, 44100, 1, 16);
          audioBytes = new Uint8Array(wavResult);
        }
      }
      
      console.log(`[TTS] Scene ${sceneIndex + 1} final audio - ${audioBytes.length} bytes`);

      // Estimate duration (~44100 samples/sec, 16-bit = 2 bytes/sample)
      const pcmSize = audioBytes.length - 44; // Subtract WAV header
      durationSeconds = Math.max(1, pcmSize / (44100 * 2));

      const audioPath = `${userId}/${projectId}/scene-${sceneIndex + 1}.wav`;
      const { error: uploadError } = await supabase.storage
        .from("audio")
        .upload(audioPath, audioBytes, { contentType: "audio/wav", upsert: true });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: { publicUrl } } = supabase.storage.from("audio").getPublicUrl(audioPath);
      finalAudioUrl = publicUrl;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown TTS error";
      console.error(`[TTS] Scene ${sceneIndex + 1} error:`, lastError);
      if (attempt < TTS_ATTEMPTS) await sleep(TTS_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }

  return { url: finalAudioUrl, error: lastError || undefined, durationSeconds };
}

// ============= UNIFIED TTS HANDLER =============
async function generateSceneAudio(
  scene: Scene,
  sceneIndex: number,
  replicateApiKey: string,
  googleApiKey: string | undefined,
  supabase: any,
  userId: string,
  projectId: string
): Promise<{ url: string | null; error?: string; durationSeconds?: number }> {
  const voiceoverText = sanitizeVoiceover(scene.voiceover);
  
  // Check if content is Haitian Creole - use Gemini TTS exclusively (NO FALLBACK)
  if (googleApiKey && isHaitianCreole(voiceoverText)) {
    console.log(`[TTS] Scene ${sceneIndex + 1} - Detected Haitian Creole, using Gemini 2.5 Flash TTS (exclusive)`);
    
    // Retry Gemini TTS up to 5 times for Haitian Creole - NO fallback
    const MAX_RETRIES = 5;
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      if (retry > 0) {
        console.log(`[TTS] Scene ${sceneIndex + 1} - Gemini retry ${retry + 1}/${MAX_RETRIES}`);
        await sleep(2000 * retry); // Exponential backoff
      }
      
      const geminiResult = await generateSceneAudioGemini(scene, sceneIndex, googleApiKey, supabase, userId, projectId, retry);
      
      if (geminiResult.url) {
        return geminiResult;
      }
      
      console.log(`[TTS] Scene ${sceneIndex + 1} - Gemini attempt ${retry + 1} failed: ${geminiResult.error}`);
    }
    
    // All retries exhausted - return error, NO fallback
    console.error(`[TTS] Scene ${sceneIndex + 1} - Gemini TTS failed after ${MAX_RETRIES} attempts, no fallback`);
    return { url: null, error: `Gemini TTS failed after ${MAX_RETRIES} retries for Haitian Creole` };
  }
  
  // Default to Replicate Chatterbox for other languages (English, etc.)
  return generateSceneAudioReplicate(scene, sceneIndex, replicateApiKey, supabase, userId, projectId);
}

// ============= IMAGE GENERATION =============
async function generateImageWithReplicate(
  prompt: string,
  replicateApiKey: string,
  format: string
): Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string; status?: number; retryAfterSeconds?: number }
> {
  const aspectRatio = format === "portrait" ? "9:16" : format === "square" ? "1:1" : "16:9";

  try {
    // Use the OFFICIAL model endpoint (no version hash).
    // Docs: https://replicate.com/bytedance/seedream-4.5/api
    const createResponse = await fetch(
      "https://api.replicate.com/v1/models/bytedance/seedream-4.5/predictions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${replicateApiKey}`,
          "Content-Type": "application/json",
          "Prefer": "wait",
        },
        body: JSON.stringify({
          input: {
            prompt,
            size: "4K",
            aspect_ratio: aspectRatio,
            // keep output deterministic (one image) and avoid surprise multi-image runs
            sequential_image_generation: "disabled",
            max_images: 1,
          },
        }),
      }
    );

    if (!createResponse.ok) {
      const status = createResponse.status;
      const retryAfter = createResponse.headers.get("retry-after");
      const errText = await createResponse.text().catch(() => "");
      return {
        ok: false,
        error: `Replicate image create failed: ${status}${errText ? ` - ${errText}` : ""}`,
        status,
        retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : undefined,
      };
    }

    let prediction = await createResponse.json();

    while (prediction.status !== "succeeded" && prediction.status !== "failed") {
      await sleep(2000);
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { "Authorization": `Bearer ${replicateApiKey}` },
      });
      prediction = await pollResponse.json();
    }

    if (prediction.status === "failed") {
      return { ok: false, error: prediction.error || "Image generation failed" };
    }

    const first = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    const imageUrl =
      typeof first === "string"
        ? first
        : first && typeof first === "object" && typeof first.url === "string"
          ? first.url
          : null;

    if (!imageUrl) return { ok: false, error: "No image URL returned" };

    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) return { ok: false, error: "Failed to download image" };

    const bytes = new Uint8Array(await imgResponse.arrayBuffer());
    return { ok: true, bytes };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}


// ============= PHASE HANDLERS =============

async function handleScriptPhase(
  supabase: any,
  user: any,
  content: string,
  format: string,
  length: string,
  style: string,
  customStyle?: string
): Promise<Response> {
  const phaseStart = Date.now();
  
  const lengthConfig: Record<string, { count: number; targetDuration: number; avgSceneDuration: number }> = {
    short: { count: 6, targetDuration: 90, avgSceneDuration: 15 },
    brief: { count: 12, targetDuration: 225, avgSceneDuration: 18 },
    presentation: { count: 24, targetDuration: 480, avgSceneDuration: 20 },
  };
  const config = lengthConfig[length] || lengthConfig.brief;
  const sceneCount = config.count;
  const targetWords = Math.floor(config.avgSceneDuration * 2.5);

  const styleDescription = getStylePrompt(style, customStyle);
  const includeTextOverlay = TEXT_OVERLAY_STYLES.includes(style.toLowerCase());
  const dimensions = getImageDimensions(format);

  const scriptPrompt = `You are a DYNAMIC video script writer creating engaging, narrative-driven content.

Content: ${content}

=== TIMING REQUIREMENTS ===
- Target duration: ${config.targetDuration} seconds
- Create exactly ${sceneCount} scenes
- MAXIMUM 25 seconds per scene
- Each voiceover: ~${targetWords} words

=== FORMAT ===
- Format: ${format} (${dimensions.width}x${dimensions.height})
- Style: ${styleDescription}

=== NARRATIVE ARC ===
1. HOOK (Scenes 1-2): Create intrigue
2. CONFLICT (Early-middle): Show tension
3. CHOICE (Middle): Fork in the road
4. SOLUTION (Later): Show method/progress
5. FORMULA (Final): Summary visual

=== VOICEOVER STYLE ===
- ENERGETIC, conversational tone
- Start each scene with a hook
- NO labels, NO stage directions, NO markdown
- Just raw spoken text
- Include paralinguistic tags where appropriate for natural expression: [clear throat], [sigh], [sush], [cough], [groan], [sniff], [gasp], [chuckle], [laugh]
- Example: "Oh, that's interesting! [chuckle] Let me explain why..."

${includeTextOverlay ? `
=== TEXT OVERLAY ===
- Provide title (2-5 words) and subtitle for each scene
` : ""}

=== OUTPUT FORMAT ===
Return ONLY valid JSON:
{
  "title": "Video Title",
  "scenes": [
    {
      "number": 1,
      "narrativeBeat": "hook",
      "voiceover": "Spoken text...",
      "visualPrompt": "Visual description...",
      "subVisuals": ["Optional additional visual..."],
      "duration": 18${includeTextOverlay ? `,
      "title": "Headline",
      "subtitle": "Takeaway"` : ""}
    }
  ]
}`;

  console.log("Phase: SCRIPT - Generating via OpenRouter...");

  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

  const scriptResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://audiomax.lovable.app",
      "X-Title": "AudioMax Video Generator"
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4.5",
      messages: [{ role: "user", content: scriptPrompt }],
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });

  if (!scriptResponse.ok) {
    throw new Error(`Script generation failed: ${scriptResponse.status}`);
  }

  const scriptData = await scriptResponse.json();
  const scriptContent = scriptData.choices?.[0]?.message?.content;
  const tokensUsed = scriptData.usage?.total_tokens || 0;

  if (!scriptContent) throw new Error("No script content received");

  let parsedScript: ScriptResponse;
  try {
    const jsonMatch = scriptContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    parsedScript = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Failed to parse script");
  }

  // Sanitize voiceovers
  parsedScript.scenes = parsedScript.scenes.map((s) => ({
    ...s,
    voiceover: sanitizeVoiceover(s.voiceover),
  }));

  // Calculate total images needed
  let totalImages = 0;
  for (const scene of parsedScript.scenes) {
    totalImages += 1; // Primary
    if (scene.subVisuals && scene.duration >= 12) {
      const maxSub = scene.duration >= 19 ? 2 : 1;
      totalImages += Math.min(scene.subVisuals.length, maxSub);
    }
  }

  // Create project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: parsedScript.title || "Untitled Video",
      content,
      format,
      length,
      style,
      status: "generating",
    })
    .select()
    .single();

  if (projectError) throw new Error("Failed to create project");

  const phaseTime = Date.now() - phaseStart;
  const costTracking: CostTracking = {
    scriptTokens: tokensUsed,
    audioSeconds: 0,
    imagesGenerated: 0,
    estimatedCostUsd: tokensUsed * PRICING.scriptPerToken,
  };

  // Create generation record
  const { data: generation, error: genError } = await supabase
    .from("generations")
    .insert({
      project_id: project.id,
      user_id: user.id,
      status: "generating",
      progress: 10,
      script: scriptContent,
      scenes: parsedScript.scenes.map((s, idx) => ({
        ...s,
        _meta: {
          statusMessage: "Script complete. Ready for audio generation.",
          totalImages,
          completedImages: 0,
          sceneIndex: idx,
          costTracking,
          phaseTimings: { script: phaseTime },
        }
      })),
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (genError) throw new Error("Failed to create generation");

  console.log(`Phase: SCRIPT complete in ${phaseTime}ms - ${parsedScript.scenes.length} scenes, ${totalImages} images planned`);

  return new Response(
    JSON.stringify({
      success: true,
      phase: "script",
      projectId: project.id,
      generationId: generation.id,
      title: parsedScript.title,
      sceneCount: parsedScript.scenes.length,
      totalImages,
      progress: 10,
      costTracking,
      phaseTime,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleAudioPhase(
  supabase: any,
  user: any,
  generationId: string,
  projectId: string,
  replicateApiKey: string,
  googleApiKey?: string
): Promise<Response> {
  const phaseStart = Date.now();

  // Fetch generation
  const { data: generation, error: genFetchError } = await supabase
    .from("generations")
    .select("*")
    .eq("id", generationId)
    .eq("user_id", user.id)
    .single();

  if (genFetchError || !generation) {
    throw new Error("Generation not found");
  }

  const scenes = generation.scenes as Scene[];
  const meta = scenes[0]?._meta || {};
  let costTracking: CostTracking = meta.costTracking || { scriptTokens: 0, audioSeconds: 0, imagesGenerated: 0, estimatedCostUsd: 0 };
  const phaseTimings = meta.phaseTimings || {};

  console.log(`Phase: AUDIO - Processing ${scenes.length} scenes...`);

  const audioUrls: (string | null)[] = new Array(scenes.length).fill(null);
  let totalAudioSeconds = 0;

  // Process audio in batches of 2
  const BATCH_SIZE = 2;
  for (let batchStart = 0; batchStart < scenes.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, scenes.length);
    
    const statusMsg = `Generating voiceover... (scenes ${batchStart + 1}-${batchEnd} of ${scenes.length})`;
    const progress = 10 + Math.floor((batchStart / scenes.length) * 30);
    
    // Update progress
    await supabase.from("generations").update({
      progress,
      scenes: scenes.map((s, idx) => ({
        ...s,
        audioUrl: audioUrls[idx],
        _meta: { ...s._meta, statusMessage: statusMsg }
      }))
    }).eq("id", generationId);

    const batchPromises = [];
    for (let i = batchStart; i < batchEnd; i++) {
      batchPromises.push(
        generateSceneAudio(scenes[i], i, replicateApiKey, googleApiKey, supabase, user.id, projectId)
          .then((result) => ({ index: i, result }))
      );
    }

    const results = await Promise.all(batchPromises);
    for (const { index, result } of results) {
      audioUrls[index] = result.url;
      if (result.durationSeconds) totalAudioSeconds += result.durationSeconds;
    }

    if (batchEnd < scenes.length) await sleep(2000);
  }

  const successfulAudio = audioUrls.filter(Boolean).length;
  if (successfulAudio === 0) {
    throw new Error("Audio generation failed for all scenes");
  }

  costTracking.audioSeconds = totalAudioSeconds;
  costTracking.estimatedCostUsd += totalAudioSeconds * PRICING.audioPerSecond;
  phaseTimings.audio = Date.now() - phaseStart;

  // Update generation with audio URLs
  await supabase.from("generations").update({
    progress: 40,
    scenes: scenes.map((s, idx) => ({
      ...s,
      audioUrl: audioUrls[idx],
      _meta: {
        ...s._meta,
        statusMessage: "Audio complete. Ready for image generation.",
        costTracking,
        phaseTimings,
      }
    }))
  }).eq("id", generationId);

  console.log(`Phase: AUDIO complete in ${phaseTimings.audio}ms - ${successfulAudio}/${scenes.length} scenes, ${totalAudioSeconds.toFixed(1)}s total`);

  return new Response(
    JSON.stringify({
      success: true,
      phase: "audio",
      progress: 40,
      audioGenerated: successfulAudio,
      audioSeconds: totalAudioSeconds,
      costTracking,
      phaseTime: phaseTimings.audio,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Images phase now processes in chunks to avoid timeout
// Each call processes up to MAX_IMAGES_PER_CALL images and returns "continue" if more remain
const MAX_IMAGES_PER_CALL = 8;

async function handleImagesPhase(
  supabase: any,
  user: any,
  generationId: string,
  projectId: string,
  replicateApiKey: string,
  startIndex: number = 0
): Promise<Response> {
  const phaseStart = Date.now();

  // Fetch generation with project format
  const { data: generation } = await supabase
    .from("generations")
    .select("*, projects!inner(format, style)")
    .eq("id", generationId)
    .eq("user_id", user.id)
    .single();

  if (!generation) throw new Error("Generation not found");

  const scenes = generation.scenes as Scene[];
  const format = generation.projects.format;
  const style = generation.projects.style;
  const styleDescription = getStylePrompt(style);
  const includeTextOverlay = TEXT_OVERLAY_STYLES.includes(style.toLowerCase());
  const dimensions = getImageDimensions(format);
  
  const meta = scenes[0]?._meta || {};
  let costTracking: CostTracking = meta.costTracking || { scriptTokens: 0, audioSeconds: 0, imagesGenerated: 0, estimatedCostUsd: 0 };
  const phaseTimings = meta.phaseTimings || {};
  
  // Get already completed images count from meta
  let completedImagesSoFar = meta.completedImages || 0;

  // Build image tasks
  interface ImageTask { sceneIndex: number; subIndex: number; prompt: string; taskIndex: number; }
  const allImageTasks: ImageTask[] = [];

  const buildImagePrompt = (visualPrompt: string, scene: Scene, subIndex: number): string => {
    const orientationDesc = format === "portrait" 
      ? "VERTICAL 9:16" : format === "square" ? "SQUARE 1:1" : "HORIZONTAL 16:9";

    let textInstructions = "";
    if (includeTextOverlay && scene.title && subIndex === 0) {
      textInstructions = `
TEXT: Render "${scene.title}" as headline, "${scene.subtitle || ""}" as subtitle.
Text must be LEGIBLE, correctly spelled, and integrated into the composition.`;
    }

    return `Generate an EDITORIAL ILLUSTRATION in ${orientationDesc} (${dimensions.width}x${dimensions.height}).

VISUAL: ${visualPrompt}

STYLE: ${styleDescription}
${textInstructions}

COMPOSITION: Dynamic, clear hierarchy. Professional editorial illustration.`;
  };

  let taskIndex = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    allImageTasks.push({ sceneIndex: i, subIndex: 0, prompt: buildImagePrompt(scene.visualPrompt, scene, 0), taskIndex: taskIndex++ });
    
    if (scene.subVisuals && scene.duration >= 12) {
      const maxSub = scene.duration >= 19 ? 2 : 1;
      for (let j = 0; j < Math.min(scene.subVisuals.length, maxSub); j++) {
        allImageTasks.push({ sceneIndex: i, subIndex: j + 1, prompt: buildImagePrompt(scene.subVisuals[j], scene, j + 1), taskIndex: taskIndex++ });
      }
    }
  }

  const totalImages = allImageTasks.length;
  
  // Get tasks for this chunk
  const endIndex = Math.min(startIndex + MAX_IMAGES_PER_CALL, totalImages);
  const tasksThisChunk = allImageTasks.slice(startIndex, endIndex);
  
  console.log(`Phase: IMAGES - Chunk ${startIndex}-${endIndex} of ${totalImages} images...`);

  // Load existing image URLs from scenes
  const sceneImageUrls: (string | null)[][] = scenes.map((s) => {
    if (s.imageUrls && Array.isArray(s.imageUrls)) {
      return [...s.imageUrls];
    } else if (s.imageUrl) {
      return [s.imageUrl];
    }
    return [];
  });

  let completedThisChunk = 0;

  // Process this chunk in batches of 4
  const BATCH_SIZE = 4;
  for (let batchStart = 0; batchStart < tasksThisChunk.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, tasksThisChunk.length);
    
    const currentCompleted = completedImagesSoFar + completedThisChunk;
    const statusMsg = `Generating images... (${currentCompleted}/${totalImages} complete)`;
    const progress = 40 + Math.floor((currentCompleted / totalImages) * 50);

    // Update progress
    await supabase.from("generations").update({
      progress,
      scenes: scenes.map((s, idx) => {
        const imgs = sceneImageUrls[idx].filter(Boolean) as string[];
        return {
          ...s,
          imageUrl: imgs[0] || s.imageUrl || null,
          imageUrls: imgs.length > 0 ? imgs : s.imageUrls,
          _meta: {
            ...s._meta,
            statusMessage: statusMsg,
            totalImages,
            completedImages: currentCompleted,
            costTracking,
            phaseTimings,
          }
        };
      })
    }).eq("id", generationId);

    const batchPromises = [];
    for (let t = batchStart; t < batchEnd; t++) {
      const task = tasksThisChunk[t];
      batchPromises.push(
        (async () => {
          for (let attempt = 1; attempt <= 3; attempt++) {
            const result = await generateImageWithReplicate(task.prompt, replicateApiKey, format);
            if (result.ok) {
              const suffix = task.subIndex > 0 ? `-${task.subIndex + 1}` : "";
              const path = `${user.id}/${projectId}/scene-${task.sceneIndex + 1}${suffix}.png`;

              const { error: uploadError } = await supabase.storage
                .from("audio")
                .upload(path, result.bytes, { contentType: "image/png", upsert: true });

              if (uploadError) {
                console.error(`[IMG] Upload failed for ${path}: ${uploadError.message}`);
                return { task, url: null };
              }

              const { data: { publicUrl } } = supabase.storage.from("audio").getPublicUrl(path);
              return { task, url: publicUrl };
            }

            console.warn(`[IMG] Generation failed (attempt ${attempt}) for task ${task.taskIndex}: ${result.error}`);
            
            if (attempt < 3) {
              const delay = result.retryAfterSeconds ? result.retryAfterSeconds * 1000 : 5000;
              await sleep(delay + Math.random() * 1000);
            }
          }
          return { task, url: null };
        })()
      );
    }

    const results = await Promise.all(batchPromises);
    for (const { task, url } of results) {
      while (sceneImageUrls[task.sceneIndex].length <= task.subIndex) {
        sceneImageUrls[task.sceneIndex].push(null);
      }
      sceneImageUrls[task.sceneIndex][task.subIndex] = url;
      if (url) completedThisChunk++;
    }

    if (batchEnd < tasksThisChunk.length) await sleep(1000);
  }

  const newCompletedTotal = completedImagesSoFar + completedThisChunk;
  const hasMore = endIndex < totalImages;

  // If we reached the end and still have 0 images, fail loudly (avoids "successful" runs with no visuals).
  if (!hasMore && newCompletedTotal === 0) {
    await supabase.from("generations").update({
      status: "error",
      error_message: "Image generation failed for all images",
    }).eq("id", generationId);

    await supabase.from("projects").update({ status: "error" }).eq("id", projectId);

    throw new Error("Image generation failed for all images");
  }

  // Update cost tracking
  costTracking.imagesGenerated = newCompletedTotal;
  costTracking.estimatedCostUsd = (costTracking.scriptTokens * PRICING.scriptPerToken) + 
                                   (costTracking.audioSeconds * PRICING.audioPerSecond) + 
                                   (newCompletedTotal * PRICING.imagePerImage);

  if (!hasMore) {
    phaseTimings.images = (phaseTimings.images || 0) + (Date.now() - phaseStart);
  }

  const finalProgress = hasMore ? (40 + Math.floor((newCompletedTotal / totalImages) * 50)) : 90;

  // Update generation
  await supabase.from("generations").update({
    progress: finalProgress,
    scenes: scenes.map((s, idx) => {
      const imgs = sceneImageUrls[idx].filter(Boolean) as string[];
      return {
        ...s,
        imageUrl: imgs[0] || s.imageUrl || null,
        imageUrls: imgs.length > 0 ? imgs : s.imageUrls,
        _meta: {
          ...s._meta,
          statusMessage: hasMore ? `Images ${newCompletedTotal}/${totalImages}...` : "Images complete. Finalizing...",
          totalImages,
          completedImages: newCompletedTotal,
          costTracking,
          phaseTimings,
        }
      };
    })
  }).eq("id", generationId);

  console.log(`Phase: IMAGES chunk complete - ${completedThisChunk} this chunk, ${newCompletedTotal}/${totalImages} total, hasMore: ${hasMore}`);

  return new Response(
    JSON.stringify({
      success: true,
      phase: "images",
      progress: finalProgress,
      imagesGenerated: newCompletedTotal,
      totalImages,
      hasMore,
      nextStartIndex: hasMore ? endIndex : undefined,
      costTracking,
      phaseTime: Date.now() - phaseStart,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleFinalizePhase(
  supabase: any,
  user: any,
  generationId: string,
  projectId: string
): Promise<Response> {
  const phaseStart = Date.now();

  const { data: generation } = await supabase
    .from("generations")
    .select("*, projects!inner(title)")
    .eq("id", generationId)
    .eq("user_id", user.id)
    .single();

  if (!generation) throw new Error("Generation not found");

  const scenes = generation.scenes as Scene[];
  const meta = scenes[0]?._meta || {};
  const costTracking: CostTracking = meta.costTracking || { scriptTokens: 0, audioSeconds: 0, imagesGenerated: 0, estimatedCostUsd: 0 };
  const phaseTimings = meta.phaseTimings || {};
  phaseTimings.finalize = Date.now() - phaseStart;

  const totalTime = (phaseTimings.script || 0) + (phaseTimings.audio || 0) + (phaseTimings.images || 0) + phaseTimings.finalize;

  // Clean scenes (remove _meta from final output)
  const finalScenes = scenes.map((s: any) => {
    const { _meta, ...rest } = s;
    return rest;
  });

  // Mark complete
  await supabase.from("generations").update({
    status: "complete",
    progress: 100,
    scenes: finalScenes.map((s: Scene, idx: number) => ({
      ...s,
      _meta: {
        statusMessage: "Generation complete!",
        costTracking,
        phaseTimings,
        totalTimeMs: totalTime,
      }
    })),
    completed_at: new Date().toISOString(),
  }).eq("id", generationId);

  await supabase.from("projects").update({ status: "complete" }).eq("id", projectId);

  console.log(`Phase: FINALIZE complete - Total time: ${totalTime}ms, Cost: $${costTracking.estimatedCostUsd.toFixed(4)}`);

  return new Response(
    JSON.stringify({
      success: true,
      phase: "finalize",
      progress: 100,
      projectId,
      generationId,
      title: generation.projects.title,
      scenes: finalScenes,
      costTracking,
      phaseTimings,
      totalTimeMs: totalTime,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ============= MAIN HANDLER =============
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_TTS_API_KEY");
    if (!REPLICATE_API_KEY) {
      return new Response(JSON.stringify({ error: "Replicate not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Optional: Google API key for Haitian Creole TTS
    const GOOGLE_TTS_API_KEY = Deno.env.get("GOOGLE_TTS_API_KEY");

    const body: GenerationRequest & { imageStartIndex?: number } = await req.json();
    const { phase, generationId, projectId, content, format, length, style, customStyle, imageStartIndex } = body;

    console.log(`[generate-video] Phase: ${phase || "script"}, GenerationId: ${generationId || "new"}`);

    // Route to appropriate phase handler
    if (!phase || phase === "script") {
      if (!content || !format || !length || !style) {
        return new Response(JSON.stringify({ error: "Missing required fields for script phase" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      return await handleScriptPhase(supabase, user, content, format, length, style, customStyle);
    }

    if (!generationId || !projectId) {
      return new Response(JSON.stringify({ error: "Missing generationId/projectId for continuation" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    switch (phase) {
      case "audio":
        return await handleAudioPhase(supabase, user, generationId, projectId, REPLICATE_API_KEY, GOOGLE_TTS_API_KEY);
      case "images":
        return await handleImagesPhase(supabase, user, generationId, projectId, REPLICATE_API_KEY, imageStartIndex || 0);
      case "finalize":
        return await handleFinalizePhase(supabase, user, generationId, projectId);
      default:
        return new Response(JSON.stringify({ error: `Unknown phase: ${phase}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
  } catch (error) {
    console.error("Generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
