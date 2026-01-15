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
  phase?: "script" | "audio" | "images" | "finalize" | "regenerate-audio" | "regenerate-image";
  generationId?: string;
  projectId?: string;
  // For regeneration
  sceneIndex?: number;
  newVoiceover?: string;
  imageModification?: string;
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
  audioPerSecond: 0.002, // ~$0.002 per second
  imagePerImage: 0.02, // ~$0.02 per image
};

const STYLE_PROMPTS: Record<string, string> = {
  minimalist: `Modern Iconographic Minimalism. A professional minimalist flat vector icon style, centered on a solid matte cream background. Visual Architecture: Symbolic Geometry—subjects stripped of all internal detail and reduced to their most iconic, recognizable silhouettes. Color Logic: The Rule of Three—a neutral flat background (cream or light grey), a primary structural color (deep charcoal or slate), and a single pop accent color (terracotta, mustard, or sage). Linework: Monoline Weight—clean, medium-weight outlines with perfectly rounded caps and corners, consistent line thickness for a branded UI/UX feel. Texture & Finish: Vector Matte—zero gradients, zero highlights, zero 3D shading, like a high-end physical decal or premium vector icon set. Layout: Floating Iconography—subject isolated in the center with massive padding (negative space), no horizon lines, no ground planes, no complex environments. Solid color fills with a muted palette of slate blue and earthy terracotta. No shadows, no 3D effects. Heavy use of negative space, symmetrical composition. Inspired by modern UI design systems and Bauhaus graphic principles. UHD, high-precision vector lines.`,
  doodle: `Urban Minimalist Doodle style. Flat 2D vector illustration with indie comic aesthetic. LINE WORK: Bold, consistent-weight black outlines (monoline) that feel hand-drawn but clean, with slightly rounded terminals for a friendly, approachable feel. COLOR PALETTE: Muted Primary tones—desaturated dusty reds, sage greens, mustard yellows, and slate blues—set against a warm, textured cream or off-white background reminiscent of recycled paper or newsprint. CHARACTER DESIGN: Object-Head surrealism where character heads are replaced with symbolic objects creating an instant iconographic look that is relatable yet stylized. TEXTURING: Subtle Lo-Fi distressing with light paper grain, tiny ink flecks, and occasional print misalignments where color doesn't perfectly hit the line for a vintage screen-printed quality. COMPOSITION: Centralized and Floating—main subject grounded surrounded by a halo of smaller floating icons (coins, arrows, charts) representing the theme without cluttering. Technical style: Flat 2D Vector Illustration, Indie Comic Aesthetic. Vibe: Lo-fi, Chill, Entrepreneurial, Whimsical. Influences: Modern editorial illustration, 90s streetwear graphics, and Lofi Girl aesthetics.`,
  stick: `Dynamic Sketchnote illustration style. Loose, unprecise hand-drawn aesthetics using bold black marker lines on a clean white background. Features expressive stick figures with circle heads. Unlike a simple doodle, use rough cross-hatching for shading and texture (on boxes or depth). Include selective accent colors (like muted gold/yellow or grey) for key objects. The vibe is energetic and spontaneous, resembling a live visual explanation or whiteboard animation. Incorporate bold, hand-written style text elements as part of the composition. Premium quality.`,
  realistic: `Photorealistic cinematic photography. 4K UHD, HDR, 8k resolution. Shot on 35mm lens with shallow depth of field (bokeh) to isolate subjects. Hyper-realistic textures, dramatic studio lighting with rim lights. Natural skin tones and accurate material physics. Look of high-end stock photography or a Netflix documentary. Sharp focus, rich contrast, and true-to-life color grading. Unreal Engine 5 render quality.`,
  anime: `Expressive Modern Manga-Style Sketchbook. An expressive modern manga-style sketchbook illustration. Anatomy: Large-eye expressive anime/manga influence focusing on high emotional impact and kawaii but relatable proportions. Line Work: Very loose, visible rough sketch lines—looks like a final drawing made over a messy pencil draft. Coloring: Warm peachy tones with focus on skin-glow and soft environmental lighting, painterly approach with visible thick brush strokes. Vibe: Cozy, chaotic, and sentimental slice-of-life moments. Features loose sketchy digital pencil lines and painterly slice-of-life aesthetic. High-detail facial expressions with large emotive eyes. Warm muted palette with visible brush strokes and soft lighting bloom. Set in detailed, slightly messy environment that feels lived-in. Cozy, relatable, and artistically sophisticated.`,
  "3d-pixar": `Cinematic 3D Animation. A stunning 3D cinematic animation-style render in the aesthetic of modern Disney-Pixar films. Surface Geometry: Squash and Stretch—appealing rounded shapes with soft exaggerated features, avoiding sharp angles unless part of mechanical design. Material Science: Subsurface Scattering—that Disney glow where light slightly penetrates the surface like real skin or wax, textures are stylized realism with soft fur, knit fabrics, or polished plastic. Lighting Design: Three-Point Cinematic—strong key light, soft fill light to eliminate harsh shadows, bright rim light (backlight) creating glowing silhouette separating from background. Eyes: The Soul Focal Point—large, highly detailed eyes with realistic specular highlights and deep iris colors making character feel sentient and emotive. Atmosphere: Volumetric Depth—light fog, dust motes, or god rays creating sense of physical space, background has soft bokeh blur keeping focus on subject. High-detail textures, expressive large eyes, soft rounded features. Vibrant saturated colors with high-end subsurface scattering on all surfaces. Rendered in 8k using Octane, shallow depth of field, whimsical softly blurred background. Masterpiece quality, charming, tactile, and highly emotive.`,
  claymation: `Handcrafted Digital Clay. A high-detail 3D claymation-style render. Material Texture: Matte & Tactile—surfaces must show subtle, realistic imperfections like tiny thumbprints, slight molding creases, and a soft matte finish that mimics polymer clay (like Sculpey or Fimo). Lighting: Miniature Macro Lighting—soft, high-contrast studio lighting that makes the subject look like a small physical object, includes Rim Lighting to make the edges glow and deep, soft-edge shadows. Proportions: Chunky & Appealing—thick, rounded limbs and exaggerated squashy features, avoid any sharp digital edges, everything should look like it was rolled between two palms. Atmosphere: Depth of Field—heavy background blur (bokeh) essential to sell the small toy scale, making the subject pop as the central focus. Color Palette: Saturated & Playful—bold, solid primary colors that look like they came straight out of a clay pack, avoiding complex gradients. 8k resolution, Octane Render, masterpiece quality.`,
  sketch: `Expressive Modern Manga-Style Sketchbook. An expressive modern manga-style sketchbook illustration. Anatomy: Large-eye expressive anime/manga influence focusing on high emotional impact and kawaii but relatable proportions. Line Work: Very loose, visible rough sketch lines—looks like a final drawing made over a messy pencil draft. Coloring: Warm peachy tones with focus on skin-glow and soft environmental lighting, painterly approach with visible thick brush strokes. Vibe: Cozy, chaotic, and sentimental slice-of-life moments. Features loose sketchy digital pencil lines and painterly slice-of-life aesthetic. High-detail facial expressions with large emotive eyes. Warm muted palette with visible brush strokes and soft lighting bloom. Set in detailed, slightly messy environment that feels lived-in. Cozy, relatable, and artistically sophisticated.`,
  caricature: `Cinematic Editorial Sketch. A high-detail cinematic editorial sketch. Line Work: Loose and Scrawly—visible, overlapping sketchy lines, the charm comes from the pencil-like under-drawing being visible beneath the color. Color Palette: Warm Muted Washes—desaturated, earthy tones (peaches, sage greens, warm creams) that look like a watercolor wash or digital marker. Character Design: Exaggerated Expressions—extreme facial acting with wide eyes, heavy brows, and very emotive mouths, feels like slice-of-life moments frozen in time. Texturing: Painterly Grit—backgrounds look unfinished and painterly with visible brush strokes and light paper texture, not a solid wall of color, feels like it is on a physical canvas. Composition: Candid Snapshot—subjects feel caught in the middle of an action or emotion rather than posing. High-end digital watercolor illustration style with focus on storytelling. Lo-fi, cozy, and highly expressive.`,
  painterly: `Loose Narrative Sketchbook. A high-detail expressive editorial sketch. Linework: Organic Ink—the lines are intentionally visible, sometimes doubled or scratched, giving it a raw sketchbook feel. Coloring: Painterly Washes—colors applied like digital watercolors or markers, often with visible brushstrokes and bleeding that does not strictly follow the lines. Character Anatomy: Emotive Distortion—features are slightly exaggerated with large eyes for emotion, long limbs, or expressive postures to tell a story at a glance. Vibe: Authentic & Slice-of-Life—feels like a moment captured in an artist's personal journal. Visible, expressive brushstrokes and subtle paper texture. Atmospheric lighting with a warm, muted color palette. A slice-of-life indie comic feel that is cozy, slightly chaotic, and rich in storytelling detail. Masterpiece quality, hand-drawn look, sophisticated digital art.`,
};

const TEXT_OVERLAY_STYLES = ["minimalist", "doodle", "stick"];

// ============= HELPER FUNCTIONS =============
function getStylePrompt(style: string, customStyle?: string): string {
  if (style === "custom" && customStyle) return customStyle;
  return STYLE_PROMPTS[style.toLowerCase()] || style;
}

function getImageDimensions(format: string): { width: number; height: number } {
  // z-image-turbo requires dimensions to be multiples of 16
  switch (format) {
    case "portrait":
      return { width: 816, height: 1440 }; // 9:16
    case "square":
      return { width: 1024, height: 1024 }; // 1:1
    default:
      return { width: 1440, height: 816 }; // 16:9 landscape
  }
}

// Paralinguistic tags to preserve for natural TTS expression
const ALLOWED_PARALINGUISTIC_TAGS = [
  "clear throat",
  "sigh",
  "sush",
  "cough",
  "groan",
  "sniff",
  "gasp",
  "chuckle",
  "laugh",
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
        .replace(/^\s*\[[^\]]+\]\s*/g, ""),
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
    "mwen",
    "ou",
    "li",
    "nou",
    "yo",
    "sa",
    "ki",
    "nan",
    "pou",
    "ak",
    "pa",
    "se",
    "te",
    "ap",
    "gen",
    "fè",
    "di",
    "ale",
    "vin",
    "bay",
    "konnen",
    "wè",
    "pran",
    "mete",
    "vle",
    "kapab",
    "dwe",
    "bezwen",
    "tankou",
    "paske",
    "men",
    "lè",
    "si",
    "kote",
    "kouman",
    "poukisa",
    "anpil",
    "tout",
    "chak",
    "yon",
    "de",
    "twa",
    "kat",
    "senk",
    // Haitian specific
    "ayiti",
    "kreyòl",
    "kreyol",
    "bondye",
    "mèsi",
    "bonjou",
    "bonswa",
    "kijan",
    "eske",
    "kounye",
    "toujou",
    "jamè",
    "anvan",
    "apre",
    // Verb markers
    "t ap",
    "te",
    "pral",
    "ta",
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
function pcmToWav(
  pcmData: Uint8Array,
  sampleRate: number = 24000,
  numChannels: number = 1,
  bitsPerSample: number = 16,
): Uint8Array {
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
  view.setUint8(8, 0x57); // W
  view.setUint8(9, 0x41); // A
  view.setUint8(10, 0x56); // V
  view.setUint8(11, 0x45); // E

  // fmt subchunk
  view.setUint8(12, 0x66); // f
  view.setUint8(13, 0x6d); // m
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
  sanitized = sanitized.replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF.,!?;:'-]/g, " ");

  // Restore paralinguistic tags
  tagPlaceholders.forEach((tag, i) => {
    sanitized = sanitized.replace(`__PTAG${i}__`, tag);
  });

  // Collapse multiple spaces
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  // Ensure it ends with proper punctuation for natural speech
  if (sanitized && !/[.!?]$/.test(sanitized)) {
    sanitized += ".";
  }

  return sanitized;
}

// ============= GEMINI TTS MODELS (with fallback chain) =============
// Model priority: Flash Preview TTS -> Pro Preview TTS -> Flash TTS
const GEMINI_TTS_MODELS = [
  { name: "gemini-2.5-flash-preview-tts", label: "Flash Preview TTS" },
  { name: "gemini-2.5-pro-preview-tts", label: "Pro Preview TTS" },
  { name: "gemini-2.5-flash-tts", label: "Flash TTS" },
];

async function generateSceneAudioGeminiWithModel(
  scene: Scene,
  sceneIndex: number,
  googleApiKey: string,
  supabase: any,
  userId: string,
  projectId: string,
  modelName: string,
  modelLabel: string,
  retryAttempt: number = 0,
  isRegeneration: boolean = false,
): Promise<{ url: string | null; error?: string; durationSeconds?: number }> {
  let voiceoverText = sanitizeForGeminiTTS(scene.voiceover);

  if (!voiceoverText || voiceoverText.length < 2) {
    return { url: null, error: "No voiceover text" };
  }

  // On retries, add slight text variation to bypass content filtering
  if (retryAttempt > 0) {
    // Add a soft breathing pause at the start to slightly vary the input
    const variations = ["... " + voiceoverText, voiceoverText + " ...", ". " + voiceoverText];
    voiceoverText = variations[retryAttempt % variations.length];
  }

  try {
    console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} - Using ${modelLabel} for Haitian Creole`);
    console.log(`[TTS-Gemini] Text length: ${voiceoverText.length} chars, retry: ${retryAttempt}`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${googleApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `[Speak with natural enthusiasm, warmth and energy like sharing exciting news with a friend] ${voiceoverText}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Enceladus",
                },
              },
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[TTS-Gemini] ${modelLabel} API error response:`, errText);
      throw new Error(`${modelLabel} failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    console.log(`[TTS-Gemini] ${modelLabel} response structure:`, JSON.stringify(Object.keys(data)));

    // Check for candidates
    if (!data.candidates || data.candidates.length === 0) {
      console.error(`[TTS-Gemini] ${modelLabel} no candidates in response:`, JSON.stringify(data));
      throw new Error(`No candidates in ${modelLabel} response`);
    }

    const candidate = data.candidates[0];
    
    // Check for finishReason: OTHER which indicates content filtering
    if (candidate.finishReason === "OTHER") {
      console.warn(`[TTS-Gemini] ${modelLabel} returned finishReason: OTHER (content filter)`);
      throw new Error(`${modelLabel} content filter triggered (finishReason: OTHER)`);
    }
    
    const content = candidate?.content;
    const parts = content?.parts;

    if (!parts || parts.length === 0) {
      console.error(`[TTS-Gemini] ${modelLabel} no parts in candidate:`, JSON.stringify(candidate));
      throw new Error(`No parts in ${modelLabel} response`);
    }

    const inlineData = parts[0]?.inlineData;
    if (!inlineData || !inlineData.data) {
      console.error(`[TTS-Gemini] ${modelLabel} no inlineData:`, JSON.stringify(parts[0]));
      throw new Error(`No audio data in ${modelLabel} response`);
    }

    const audioData = inlineData.data;
    const mimeType = inlineData.mimeType || "audio/L16";
    console.log(`[TTS-Gemini] ${modelLabel} got audio data, mimeType: ${mimeType}, base64 length: ${audioData.length}`);

    // Decode base64 audio (raw PCM data)
    let pcmBytes = base64Decode(audioData);
    console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} raw PCM bytes: ${pcmBytes.length}`);

    // Trim trailing silence from PCM (16-bit samples, little-endian)
    const SILENCE_THRESHOLD = 300;
    let trimEnd = pcmBytes.length;

    for (let i = pcmBytes.length - 2; i >= 0; i -= 2) {
      const sample = Math.abs(((pcmBytes[i] | (pcmBytes[i + 1] << 8)) << 16) >> 16);
      if (sample > SILENCE_THRESHOLD) {
        trimEnd = Math.min(pcmBytes.length, i + 14400);
        break;
      }
    }

    if (trimEnd < pcmBytes.length) {
      console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} trimmed ${pcmBytes.length - trimEnd} bytes of trailing silence`);
      pcmBytes = pcmBytes.slice(0, trimEnd);
    }

    // Convert PCM to WAV (Gemini returns 24kHz, 16-bit mono PCM)
    const wavBytes = pcmToWav(pcmBytes, 24000, 1, 16);
    console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} WAV bytes: ${wavBytes.length}`);

    // Calculate accurate duration
    const durationSeconds = Math.max(1, pcmBytes.length / (24000 * 2));

    const audioPath = isRegeneration 
      ? `${userId}/${projectId}/scene-${sceneIndex + 1}-${Date.now()}.wav`
      : `${userId}/${projectId}/scene-${sceneIndex + 1}.wav`;
    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(audioPath, wavBytes, { contentType: "audio/wav", upsert: true });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const {
      data: { publicUrl },
    } = supabase.storage.from("audio").getPublicUrl(audioPath);
    console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} audio uploaded OK using ${modelLabel}`);
    return { url: publicUrl, durationSeconds };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown Gemini TTS error";
    console.error(`[TTS-Gemini] Scene ${sceneIndex + 1} ${modelLabel} error:`, errorMsg);
    return { url: null, error: errorMsg };
  }
}

// Main Gemini TTS function with model fallback chain
async function generateSceneAudioGemini(
  scene: Scene,
  sceneIndex: number,
  googleApiKey: string,
  supabase: any,
  userId: string,
  projectId: string,
  retryAttempt: number = 0,
  isRegeneration: boolean = false,
): Promise<{ url: string | null; error?: string; durationSeconds?: number }> {
  // Try each Gemini TTS model in order
  for (const model of GEMINI_TTS_MODELS) {
    console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} - Trying ${model.label}...`);
    
    const result = await generateSceneAudioGeminiWithModel(
      scene,
      sceneIndex,
      googleApiKey,
      supabase,
      userId,
      projectId,
      model.name,
      model.label,
      retryAttempt,
      isRegeneration,
    );
    
    if (result.url) {
      console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} - SUCCESS with ${model.label}`);
      return result;
    }
    
    console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} - ${model.label} failed: ${result.error}, trying next model...`);
  }
  
  // All models failed
  return { url: null, error: "All Gemini TTS models failed" };
}

// ============= TTS GENERATION (Replicate Chatterbox) =============
async function generateSceneAudioReplicate(
  scene: Scene,
  sceneIndex: number,
  replicateApiKey: string,
  supabase: any,
  userId: string,
  projectId: string,
  isRegeneration: boolean = false,
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
      const createResponse = await fetch(
        "https://api.replicate.com/v1/models/resemble-ai/chatterbox-turbo/predictions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${replicateApiKey}`,
            "Content-Type": "application/json",
            Prefer: "wait",
          },
          body: JSON.stringify({
            input: {
              text: voiceoverText,
              voice: "Marisol",
              temperature: 1,
              top_p: 0.9,
              top_k: 1800,
              repetition_penalty: 1.5,
            },
          }),
        },
      );

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
          headers: { Authorization: `Bearer ${replicateApiKey}` },
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

      const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());
      console.log(`[TTS] Scene ${sceneIndex + 1} audio OK - ${audioBytes.length} bytes`);

      // Estimate duration (~44100 samples/sec, 16-bit = 2 bytes/sample)
      durationSeconds = Math.max(1, audioBytes.length / (44100 * 2));

      const audioPath = isRegeneration
        ? `${userId}/${projectId}/scene-${sceneIndex + 1}-${Date.now()}.wav`
        : `${userId}/${projectId}/scene-${sceneIndex + 1}.wav`;
      const { error: uploadError } = await supabase.storage
        .from("audio")
        .upload(audioPath, audioBytes, { contentType: "audio/wav", upsert: true });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const {
        data: { publicUrl },
      } = supabase.storage.from("audio").getPublicUrl(audioPath);
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
  projectId: string,
  isRegeneration: boolean = false,
): Promise<{ url: string | null; error?: string; durationSeconds?: number }> {
  const voiceoverText = sanitizeVoiceover(scene.voiceover);

  // Haitian Creole: prefer Gemini TTS, but fall back to Replicate if Gemini refuses (finishReason: OTHER)
  if (googleApiKey && isHaitianCreole(voiceoverText)) {
    console.log(`[TTS] Scene ${sceneIndex + 1} - Detected Haitian Creole, trying Gemini 2.5 Flash TTS first`);

    // Haitian Creole: use Gemini ONLY with 10 retries (Replicate doesn't speak Creole)
    const MAX_RETRIES = 10;
    let lastError = "";

    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      if (retry > 0) {
        console.log(`[TTS] Scene ${sceneIndex + 1} - Gemini retry ${retry + 1}/${MAX_RETRIES}`);
        await sleep(1500 * Math.min(retry, 4)); // Cap backoff at 6 seconds
      }

      const geminiResult = await generateSceneAudioGemini(
        scene,
        sceneIndex,
        googleApiKey,
        supabase,
        userId,
        projectId,
        retry,
        isRegeneration,
      );

      if (geminiResult.url) return geminiResult;

      lastError = geminiResult.error || "Unknown error";
      console.log(`[TTS] Scene ${sceneIndex + 1} - Gemini attempt ${retry + 1} failed: ${lastError}`);
    }

    // No Replicate fallback for Creole - it doesn't speak Creole
    console.error(`[TTS] Scene ${sceneIndex + 1} - Gemini TTS failed after ${MAX_RETRIES} attempts for Haitian Creole`);
    return {
      url: null,
      error: `Gemini TTS failed after ${MAX_RETRIES} retries for Haitian Creole: ${lastError}`,
    };
  }

  // Default: Replicate Chatterbox
  return generateSceneAudioReplicate(scene, sceneIndex, replicateApiKey, supabase, userId, projectId, isRegeneration);
}

// ============= IMAGE GENERATION =============
async function generateImageWithReplicate(
  prompt: string,
  replicateApiKey: string,
  format: string,
): Promise<
  { ok: true; bytes: Uint8Array } | { ok: false; error: string; status?: number; retryAfterSeconds?: number }
> {
  // Get explicit dimensions for z-image-turbo (must be multiples of 16)
  const dimensions = getImageDimensions(format);

  /* ============= OLD SEEDREAM-4.5 SETTINGS (COMMENTED FOR LATER USE) =============
  const aspectRatio = format === "portrait" ? "9:16" : format === "square" ? "1:1" : "16:9";
  
  // Seedream model endpoint and input:
  // URL: "https://api.replicate.com/v1/models/bytedance/seedream-4.5/predictions"
  // Input: {
  //   prompt,
  //   size: "4K",
  //   aspect_ratio: aspectRatio,
  //   sequential_image_generation: "disabled",
  //   max_images: 1,
  // }
  ============================================================================= */

  try {
    // Using prunaai/z-image-turbo model
    // Docs: https://replicate.com/prunaai/z-image-turbo/api
    const createResponse = await fetch("https://api.replicate.com/v1/models/prunaai/z-image-turbo/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateApiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: {
          prompt,
          width: dimensions.width,
          height: dimensions.height,
          num_inference_steps: 50,
          guidance_scale: 0,
          output_format: "png",
          output_quality: 100,
        },
      }),
    });

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
        headers: { Authorization: `Bearer ${replicateApiKey}` },
      });
      prediction = await pollResponse.json();
    }

    if (prediction.status === "failed") {
      return { ok: false, error: prediction.error || "Image generation failed" };
    }

    // z-image-turbo returns output as a FileOutput object with .url() method
    // When accessed via REST API, it's typically a direct URL string or object with url property
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
  customStyle?: string,
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

${
  includeTextOverlay
    ? `
=== TEXT OVERLAY ===
- Provide title (2-5 words) and subtitle for each scene
`
    : ""
}

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
      "duration": 18${
        includeTextOverlay
          ? `,
      "title": "Headline",
      "subtitle": "Takeaway"`
          : ""
      }
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
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://audiomax.lovable.app",
      "X-Title": "AudioMax Video Generator",
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
        },
      })),
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (genError) throw new Error("Failed to create generation");

  console.log(
    `Phase: SCRIPT complete in ${phaseTime}ms - ${parsedScript.scenes.length} scenes, ${totalImages} images planned`,
  );

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
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function handleAudioPhase(
  supabase: any,
  user: any,
  generationId: string,
  projectId: string,
  replicateApiKey: string,
  googleApiKey?: string,
  startIndex: number = 0,
): Promise<Response> {
  const requestStart = Date.now();

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
  let costTracking: CostTracking = meta.costTracking || {
    scriptTokens: 0,
    audioSeconds: 0,
    imagesGenerated: 0,
    estimatedCostUsd: 0,
  };
  const phaseTimings = meta.phaseTimings || {};

  // Keep any audio already generated (chunked calls)
  const audioUrls: (string | null)[] = scenes.map((s) => (s as any).audioUrl ?? null);
  let totalAudioSeconds = typeof costTracking.audioSeconds === "number" ? costTracking.audioSeconds : 0;

  const BATCH_SIZE = 2;
  const batchStart = Math.max(0, startIndex);
  const batchEnd = Math.min(batchStart + BATCH_SIZE, scenes.length);

  const statusMsg = `Generating voiceover... (scenes ${batchStart + 1}-${batchEnd} of ${scenes.length})`;
  const progress = Math.min(39, 10 + Math.floor((batchEnd / scenes.length) * 30));

  console.log(`Phase: AUDIO - Chunk ${batchStart}-${batchEnd - 1} of ${scenes.length}`);

  // Update progress before doing work
  await supabase
    .from("generations")
    .update({
      progress,
      scenes: scenes.map((s, idx) => ({
        ...s,
        audioUrl: audioUrls[idx],
        _meta: { ...s._meta, statusMessage: statusMsg },
      })),
    })
    .eq("id", generationId);

  const batchPromises: Promise<{ index: number; result: { url: string | null; durationSeconds?: number } }>[] = [];

  for (let i = batchStart; i < batchEnd; i++) {
    // Skip scenes that already have audio
    if (audioUrls[i]) continue;

    batchPromises.push(
      generateSceneAudio(scenes[i], i, replicateApiKey, googleApiKey, supabase, user.id, projectId).then((result) => ({
        index: i,
        result,
      })),
    );
  }

  const results = await Promise.all(batchPromises);
  for (const { index, result } of results) {
    audioUrls[index] = result.url;
    if (result.durationSeconds) {
      totalAudioSeconds += result.durationSeconds;
      // Update scene duration with actual audio length + small buffer
      scenes[index].duration = Math.ceil(result.durationSeconds + 0.5);
    }
  }

  const successfulAudio = audioUrls.filter(Boolean).length;
  const hasMore = batchEnd < scenes.length;

  // Track cumulative phase time across chunked calls
  const requestTimeMs = Date.now() - requestStart;
  phaseTimings.audio = (typeof phaseTimings.audio === "number" ? phaseTimings.audio : 0) + requestTimeMs;

  costTracking.audioSeconds = totalAudioSeconds;
  costTracking.estimatedCostUsd =
    (typeof costTracking.estimatedCostUsd === "number" ? costTracking.estimatedCostUsd : 0) +
    (totalAudioSeconds - (meta.costTracking?.audioSeconds || 0)) * PRICING.audioPerSecond;

  if (hasMore) {
    await supabase
      .from("generations")
      .update({
        progress,
        scenes: scenes.map((s, idx) => ({
          ...s,
          audioUrl: audioUrls[idx],
          _meta: { ...s._meta, statusMessage: statusMsg, costTracking, phaseTimings },
        })),
      })
      .eq("id", generationId);

    return new Response(
      JSON.stringify({
        success: true,
        phase: "audio",
        progress,
        hasMore: true,
        nextStartIndex: batchEnd,
        audioGenerated: successfulAudio,
        audioSeconds: totalAudioSeconds,
        costTracking,
        phaseTime: phaseTimings.audio,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Final chunk: validate + finalize audio phase
  if (successfulAudio === 0) {
    throw new Error("Audio generation failed for all scenes");
  }

  await supabase
    .from("generations")
    .update({
      progress: 40,
      scenes: scenes.map((s, idx) => ({
        ...s,
        audioUrl: audioUrls[idx],
        _meta: {
          ...s._meta,
          statusMessage: "Audio complete. Ready for image generation.",
          costTracking,
          phaseTimings,
        },
      })),
    })
    .eq("id", generationId);

  console.log(
    `Phase: AUDIO complete (chunked) in ${phaseTimings.audio}ms - ${successfulAudio}/${scenes.length} scenes, ${totalAudioSeconds.toFixed(1)}s total`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      phase: "audio",
      progress: 40,
      hasMore: false,
      audioGenerated: successfulAudio,
      audioSeconds: totalAudioSeconds,
      costTracking,
      phaseTime: phaseTimings.audio,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
  startIndex: number = 0,
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
  let costTracking: CostTracking = meta.costTracking || {
    scriptTokens: 0,
    audioSeconds: 0,
    imagesGenerated: 0,
    estimatedCostUsd: 0,
  };
  const phaseTimings = meta.phaseTimings || {};

  // Get already completed images count from meta
  let completedImagesSoFar = meta.completedImages || 0;

  // Build image tasks
  interface ImageTask {
    sceneIndex: number;
    subIndex: number;
    prompt: string;
    taskIndex: number;
  }
  const allImageTasks: ImageTask[] = [];

  const buildImagePrompt = (visualPrompt: string, scene: Scene, subIndex: number): string => {
    let textInstructions = "";
    if (includeTextOverlay && scene.title && subIndex === 0) {
      textInstructions = `
TEXT OVERLAY: Render "${scene.title}" as headline, "${scene.subtitle || ""}" as subtitle.
Text must be LEGIBLE, correctly spelled, and integrated into the composition.`;
    }

    return `${visualPrompt}

STYLE: ${styleDescription}
${textInstructions}

Professional illustration with dynamic composition and clear visual hierarchy.`;
  };

  let taskIndex = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    allImageTasks.push({
      sceneIndex: i,
      subIndex: 0,
      prompt: buildImagePrompt(scene.visualPrompt, scene, 0),
      taskIndex: taskIndex++,
    });

    if (scene.subVisuals && scene.duration >= 12) {
      const maxSub = scene.duration >= 19 ? 2 : 1;
      for (let j = 0; j < Math.min(scene.subVisuals.length, maxSub); j++) {
        allImageTasks.push({
          sceneIndex: i,
          subIndex: j + 1,
          prompt: buildImagePrompt(scene.subVisuals[j], scene, j + 1),
          taskIndex: taskIndex++,
        });
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
    await supabase
      .from("generations")
      .update({
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
            },
          };
        }),
      })
      .eq("id", generationId);

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

              const {
                data: { publicUrl },
              } = supabase.storage.from("audio").getPublicUrl(path);
              return { task, url: publicUrl };
            }

            console.warn(`[IMG] Generation failed (attempt ${attempt}) for task ${task.taskIndex}: ${result.error}`);

            if (attempt < 3) {
              const delay = result.retryAfterSeconds ? result.retryAfterSeconds * 1000 : 5000;
              await sleep(delay + Math.random() * 1000);
            }
          }
          return { task, url: null };
        })(),
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
    await supabase
      .from("generations")
      .update({
        status: "error",
        error_message: "Image generation failed for all images",
      })
      .eq("id", generationId);

    await supabase.from("projects").update({ status: "error" }).eq("id", projectId);

    throw new Error("Image generation failed for all images");
  }

  // Update cost tracking
  costTracking.imagesGenerated = newCompletedTotal;
  costTracking.estimatedCostUsd =
    costTracking.scriptTokens * PRICING.scriptPerToken +
    costTracking.audioSeconds * PRICING.audioPerSecond +
    newCompletedTotal * PRICING.imagePerImage;

  if (!hasMore) {
    phaseTimings.images = (phaseTimings.images || 0) + (Date.now() - phaseStart);
  }

  const finalProgress = hasMore ? 40 + Math.floor((newCompletedTotal / totalImages) * 50) : 90;

  // Update generation
  await supabase
    .from("generations")
    .update({
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
          },
        };
      }),
    })
    .eq("id", generationId);

  console.log(
    `Phase: IMAGES chunk complete - ${completedThisChunk} this chunk, ${newCompletedTotal}/${totalImages} total, hasMore: ${hasMore}`,
  );

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
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function handleFinalizePhase(
  supabase: any,
  user: any,
  generationId: string,
  projectId: string,
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
  const costTracking: CostTracking = meta.costTracking || {
    scriptTokens: 0,
    audioSeconds: 0,
    imagesGenerated: 0,
    estimatedCostUsd: 0,
  };
  const phaseTimings = meta.phaseTimings || {};
  phaseTimings.finalize = Date.now() - phaseStart;

  const totalTime =
    (phaseTimings.script || 0) + (phaseTimings.audio || 0) + (phaseTimings.images || 0) + phaseTimings.finalize;

  // Clean scenes (remove _meta from final output)
  const finalScenes = scenes.map((s: any) => {
    const { _meta, ...rest } = s;
    return rest;
  });

  // Mark complete
  await supabase
    .from("generations")
    .update({
      status: "complete",
      progress: 100,
      scenes: finalScenes.map((s: Scene, idx: number) => ({
        ...s,
        _meta: {
          statusMessage: "Generation complete!",
          costTracking,
          phaseTimings,
          totalTimeMs: totalTime,
        },
      })),
      completed_at: new Date().toISOString(),
    })
    .eq("id", generationId);

  await supabase.from("projects").update({ status: "complete" }).eq("id", projectId);

  console.log(
    `Phase: FINALIZE complete - Total time: ${totalTime}ms, Cost: $${costTracking.estimatedCostUsd.toFixed(4)}`,
  );

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
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// ============= REGENERATE AUDIO PHASE =============
async function handleRegenerateAudio(
  supabase: any,
  user: any,
  generationId: string,
  projectId: string,
  sceneIndex: number,
  newVoiceover: string,
  replicateApiKey: string,
  googleApiKey: string | undefined,
): Promise<Response> {
  console.log(`[regenerate-audio] Scene ${sceneIndex + 1} - Starting audio regeneration...`);

  // Fetch generation
  const { data: generation } = await supabase
    .from("generations")
    .select("scenes")
    .eq("id", generationId)
    .eq("user_id", user.id)
    .single();

  if (!generation) throw new Error("Generation not found");

  const scenes = generation.scenes as Scene[];
  if (sceneIndex < 0 || sceneIndex >= scenes.length) {
    throw new Error("Invalid scene index");
  }

  // Update the scene with new voiceover
  scenes[sceneIndex].voiceover = newVoiceover;

  // Generate new audio (with isRegeneration=true to create unique filename and bypass cache)
  const audioResult = await generateSceneAudio(
    scenes[sceneIndex],
    sceneIndex,
    replicateApiKey,
    googleApiKey,
    supabase,
    user.id,
    projectId,
    true, // isRegeneration - creates unique filename to bypass browser cache
  );

  if (!audioResult.url) {
    throw new Error(audioResult.error || "Audio regeneration failed");
  }

  // Update scene with new audio
  scenes[sceneIndex].audioUrl = audioResult.url;
  if (audioResult.durationSeconds) {
    scenes[sceneIndex].duration = Math.round(audioResult.durationSeconds + 0.5);
  }

  // Save to database
  await supabase
    .from("generations")
    .update({ scenes })
    .eq("id", generationId);

  console.log(`[regenerate-audio] Scene ${sceneIndex + 1} - Audio regenerated successfully with voiceover: "${newVoiceover.substring(0, 50)}..."`);

  return new Response(
    JSON.stringify({
      success: true,
      phase: "regenerate-audio",
      sceneIndex,
      audioUrl: audioResult.url,
      duration: scenes[sceneIndex].duration,
      voiceover: scenes[sceneIndex].voiceover, // Return the updated voiceover for confirmation
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// ============= REGENERATE IMAGE PHASE =============
async function handleRegenerateImage(
  supabase: any,
  user: any,
  generationId: string,
  projectId: string,
  sceneIndex: number,
  imageModification: string,
  replicateApiKey: string,
): Promise<Response> {
  console.log(`[regenerate-image] Scene ${sceneIndex + 1} - Starting image regeneration...`);

  // Fetch generation with project format and style
  const { data: generation } = await supabase
    .from("generations")
    .select("scenes, projects!inner(format, style)")
    .eq("id", generationId)
    .eq("user_id", user.id)
    .single();

  if (!generation) throw new Error("Generation not found");

  const scenes = generation.scenes as Scene[];
  if (sceneIndex < 0 || sceneIndex >= scenes.length) {
    throw new Error("Invalid scene index");
  }

  const format = generation.projects.format;
  const style = generation.projects.style;
  const styleDescription = getStylePrompt(style);
  const scene = scenes[sceneIndex];

  // Build modified prompt incorporating user's modification request
  const modifiedPrompt = `${scene.visualPrompt}

USER MODIFICATION REQUEST: ${imageModification}

STYLE: ${styleDescription}

Professional illustration with dynamic composition and clear visual hierarchy. Apply the user's modification to enhance the image.`;

  // Generate new image
  const imageResult = await generateImageWithReplicate(modifiedPrompt, replicateApiKey, format);

  if (!imageResult.ok) {
    throw new Error(imageResult.error || "Image regeneration failed");
  }

  // Upload to storage (use "audio" bucket which is already configured for media storage)
  const imagePath = `${user.id}/${projectId}/scene-${sceneIndex + 1}-regenerated-${Date.now()}.png`;
  const { error: uploadError } = await supabase.storage
    .from("audio")
    .upload(imagePath, imageResult.bytes, { contentType: "image/png", upsert: true });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: { publicUrl } } = supabase.storage.from("audio").getPublicUrl(imagePath);

  // Update scene with new image
  scenes[sceneIndex].imageUrl = publicUrl;
  scenes[sceneIndex].imageUrls = [publicUrl];

  // Save to database
  await supabase
    .from("generations")
    .update({ scenes })
    .eq("id", generationId);

  console.log(`[regenerate-image] Scene ${sceneIndex + 1} - Image regenerated successfully`);

  return new Response(
    JSON.stringify({
      success: true,
      phase: "regenerate-image",
      sceneIndex,
      imageUrl: publicUrl,
      imageUrls: [publicUrl],
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for all DB operations (bypasses RLS, handles long-running tasks)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const token = authHeader.replace("Bearer ", "");
    let user: { id: string; email?: string };
    
    try {
      const { data, error: claimsError } = await supabase.auth.getClaims(token);
      
      if (claimsError) {
        // Check if it's an expiration error - provide helpful message
        if (claimsError.message?.includes("expired")) {
          return new Response(JSON.stringify({ 
            error: "Session expired. Please refresh the page and try again." 
          }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw claimsError;
      }
      
      if (!data?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      user = { id: data.claims.sub, email: data.claims.email as string | undefined };
    } catch (authError) {
      console.error("Auth validation error:", authError);
      return new Response(JSON.stringify({ 
        error: "Authentication failed. Please refresh and try again." 
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_TTS_API_KEY");
    if (!REPLICATE_API_KEY) {
      return new Response(JSON.stringify({ error: "Replicate not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_TTS_API_KEY = Deno.env.get("GOOGLE_TTS_API_KEY");

    const body: GenerationRequest & { imageStartIndex?: number; audioStartIndex?: number } = await req.json();
    const {
      phase,
      generationId,
      projectId,
      content,
      format,
      length,
      style,
      customStyle,
      imageStartIndex,
      audioStartIndex,
      sceneIndex,
      newVoiceover,
      imageModification,
    } = body;

    console.log(`[generate-video] Phase: ${phase || "script"}, GenerationId: ${generationId || "new"}`);

    // Route to appropriate phase handler
    if (!phase || phase === "script") {
      if (!content || !format || !length || !style) {
        return new Response(JSON.stringify({ error: "Missing required fields for script phase" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return await handleScriptPhase(supabase, user, content, format, length, style, customStyle);
    }

    if (!generationId || !projectId) {
      return new Response(JSON.stringify({ error: "Missing generationId/projectId for continuation" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (phase) {
      case "audio":
        return await handleAudioPhase(
          supabase,
          user,
          generationId,
          projectId,
          REPLICATE_API_KEY,
          GOOGLE_TTS_API_KEY,
          audioStartIndex || 0,
        );
      case "images":
        return await handleImagesPhase(
          supabase,
          user,
          generationId,
          projectId,
          REPLICATE_API_KEY,
          imageStartIndex || 0,
        );
      case "finalize":
        return await handleFinalizePhase(supabase, user, generationId, projectId);
      case "regenerate-audio":
        if (typeof sceneIndex !== "number" || !newVoiceover) {
          return new Response(JSON.stringify({ error: "Missing sceneIndex or newVoiceover" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return await handleRegenerateAudio(
          supabase,
          user,
          generationId,
          projectId,
          sceneIndex,
          newVoiceover,
          REPLICATE_API_KEY,
          GOOGLE_TTS_API_KEY,
        );
      case "regenerate-image":
        if (typeof sceneIndex !== "number" || !imageModification) {
          return new Response(JSON.stringify({ error: "Missing sceneIndex or imageModification" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return await handleRegenerateImage(
          supabase,
          user,
          generationId,
          projectId,
          sceneIndex,
          imageModification,
          REPLICATE_API_KEY,
        );
      default:
        return new Response(JSON.stringify({ error: `Unknown phase: ${phase}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Generation error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Generation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
