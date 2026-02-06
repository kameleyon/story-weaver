import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // Keep this list broad so browser preflight never fails as client headers evolve.
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

// ============= INPUT VALIDATION =============
const INPUT_LIMITS = {
  content: 500000, // Max 500K characters for content (Smart Flow data sources)
  format: 20,
  length: 20,
  style: 50,
  customStyle: 2000,
  brandMark: 500,
  presenterFocus: 2000,
  characterDescription: 2000,
  voiceId: 200,
  voiceName: 200,
  inspirationStyle: 100,
  storyTone: 100,
  storyGenre: 100,
  voiceInclination: 100,
  brandName: 200,
  newVoiceover: 5000,
  imageModification: 1000,
  generationId: 50,
  projectId: 50,
};

const ALLOWED_FORMATS = ["landscape", "portrait", "square"];
const ALLOWED_LENGTHS = ["short", "brief", "presentation"];
const ALLOWED_PHASES = ["script", "audio", "images", "finalize", "regenerate-audio", "regenerate-image"];
const ALLOWED_PROJECT_TYPES = ["doc2video", "storytelling", "smartflow"];
const ALLOWED_VOICE_TYPES = ["standard", "custom"] as const;

// Validate and sanitize string input
function validateString(value: unknown, fieldName: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
  }
  return trimmed || null;
}

// Validate enum value
function validateEnum<T extends string>(value: unknown, fieldName: string, allowed: readonly T[]): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  const lower = value.toLowerCase().trim();
  if (!allowed.includes(lower as T)) {
    throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}`);
  }
  return lower as T;
}

// Validate UUID format
function validateUUID(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value.trim())) {
    throw new Error(`${fieldName} must be a valid UUID`);
  }
  return value.trim();
}

// Validate non-negative integer
function validateNonNegativeInt(value: unknown, fieldName: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return value;
}

// Sanitize content to remove potential injection patterns
function sanitizeContent(content: string): string {
  // Remove potential script injection patterns
  let sanitized = content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "");

  // Remove excessive whitespace while preserving structure
  sanitized = sanitized.replace(/\s{10,}/g, "    ");

  return sanitized.trim();
}

// ============= CONTENT MODERATION (Basic Level) =============
// Basic blocklist for obviously inappropriate content - keeps it minimal to avoid over-restriction
const BLOCKED_TERMS = [
  // Violence/Gore
  "murder",
  "kill children",
  "child abuse",
  "torture scene",
  "graphic violence",
  // Explicit adult content
  "pornographic",
  "explicit sex",
  "naked children",
  "child porn",
  // Hate speech
  "racial slur",
  "nazi propaganda",
  "ethnic cleansing",
  "genocide tutorial",
  // Illegal activities
  "how to make bomb",
  "terrorism instructions",
  "drug manufacturing",
];

interface ModerationResult {
  passed: boolean;
  reason?: string;
  flagType?: "warning" | "flagged" | "suspended" | "banned";
}

function moderateContent(content: string): ModerationResult {
  const contentLower = content.toLowerCase();

  for (const term of BLOCKED_TERMS) {
    if (contentLower.includes(term.toLowerCase())) {
      console.log(`[MODERATION] Blocked term detected: "${term}"`);
      return {
        passed: false,
        reason: `Content contains prohibited material. Please revise your input.`,
        flagType: "warning",
      };
    }
  }

  return { passed: true };
}

// Add compliance instructions to AI prompts
const CONTENT_COMPLIANCE_INSTRUCTION = `
CONTENT POLICY (MANDATORY):
- Generate only family-friendly, appropriate content
- No explicit violence, gore, or disturbing imagery
- No sexual or adult content
- No hate speech, discrimination, or offensive stereotypes
- No content promoting illegal activities
- Keep all content suitable for general audiences
`;

async function flagUserForViolation(
  supabase: any,
  userId: string,
  reason: string,
  details: string,
  adminUserId?: string,
): Promise<void> {
  try {
    await supabase.from("user_flags").insert({
      user_id: userId,
      flag_type: "warning",
      reason: reason,
      details: details,
      flagged_by: adminUserId || userId, // System-flagged uses the user's own ID
    });
    console.log(`[MODERATION] User ${userId} flagged for: ${reason}`);
  } catch (err) {
    console.error(`[MODERATION] Failed to create flag:`, err);
  }
}

// Validate entire request body
function validateGenerationRequest(body: unknown): GenerationRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object");
  }

  const raw = body as Record<string, unknown>;

  const validated: GenerationRequest = {};

  // Validate phase
  if (raw.phase !== undefined) {
    validated.phase = validateEnum(raw.phase, "phase", ALLOWED_PHASES) as GenerationRequest["phase"];
  }

  // Validate content with sanitization
  const content = validateString(raw.content, "content", INPUT_LIMITS.content);
  if (content) {
    validated.content = sanitizeContent(content);
  }

  // Validate format
  validated.format = validateEnum(raw.format, "format", ALLOWED_FORMATS) ?? undefined;

  // Validate length
  validated.length = validateEnum(raw.length, "length", ALLOWED_LENGTHS) ?? undefined;

  // Validate style
  validated.style = validateString(raw.style, "style", INPUT_LIMITS.style) ?? undefined;

  // Validate optional string fields
  validated.customStyle = validateString(raw.customStyle, "customStyle", INPUT_LIMITS.customStyle) ?? undefined;
  validated.brandMark = validateString(raw.brandMark, "brandMark", INPUT_LIMITS.brandMark) ?? undefined;
  validated.presenterFocus =
    validateString(raw.presenterFocus, "presenterFocus", INPUT_LIMITS.presenterFocus) ?? undefined;
  validated.characterDescription =
    validateString(raw.characterDescription, "characterDescription", INPUT_LIMITS.characterDescription) ?? undefined;
  validated.inspirationStyle =
    validateString(raw.inspirationStyle, "inspirationStyle", INPUT_LIMITS.inspirationStyle) ?? undefined;
  validated.storyTone = validateString(raw.storyTone, "storyTone", INPUT_LIMITS.storyTone) ?? undefined;
  validated.storyGenre = validateString(raw.storyGenre, "storyGenre", INPUT_LIMITS.storyGenre) ?? undefined;
  validated.voiceInclination =
    validateString(raw.voiceInclination, "voiceInclination", INPUT_LIMITS.voiceInclination) ?? undefined;
  validated.brandName = validateString(raw.brandName, "brandName", INPUT_LIMITS.brandName) ?? undefined;
  validated.newVoiceover = validateString(raw.newVoiceover, "newVoiceover", INPUT_LIMITS.newVoiceover) ?? undefined;
  validated.imageModification =
    validateString(raw.imageModification, "imageModification", INPUT_LIMITS.imageModification) ?? undefined;

  // Validate project type
  validated.projectType =
    (validateEnum(raw.projectType, "projectType", ALLOWED_PROJECT_TYPES) as GenerationRequest["projectType"]) ??
    undefined;

  // Validate UUIDs
  validated.generationId = validateUUID(raw.generationId, "generationId") ?? undefined;
  validated.projectId = validateUUID(raw.projectId, "projectId") ?? undefined;

  // Validate boolean
  if (raw.disableExpressions !== undefined) {
    if (typeof raw.disableExpressions !== "boolean") {
      throw new Error("disableExpressions must be a boolean");
    }
    validated.disableExpressions = raw.disableExpressions;
  }

  // Validate characterConsistencyEnabled (Pro feature)
  if (raw.characterConsistencyEnabled !== undefined) {
    if (typeof raw.characterConsistencyEnabled !== "boolean") {
      throw new Error("characterConsistencyEnabled must be a boolean");
    }
    validated.characterConsistencyEnabled = raw.characterConsistencyEnabled;
  }

  // Validate voice selection
  validated.voiceType =
    (validateEnum(raw.voiceType, "voiceType", ALLOWED_VOICE_TYPES) as GenerationRequest["voiceType"]) ?? undefined;
  validated.voiceId = validateString(raw.voiceId, "voiceId", INPUT_LIMITS.voiceId) ?? undefined;
  validated.voiceName = validateString(raw.voiceName, "voiceName", INPUT_LIMITS.voiceName) ?? undefined;

  // Validate numeric fields
  validated.sceneIndex = validateNonNegativeInt(raw.sceneIndex, "sceneIndex") ?? undefined;

  return validated;
}

// ============= TYPES =============
interface GenerationRequest {
  // For starting new generation
  content?: string;
  format?: string;
  length?: string;
  style?: string;
  customStyle?: string;
  brandMark?: string;
  presenterFocus?: string;
  characterDescription?: string;
  disableExpressions?: boolean;
  characterConsistencyEnabled?: boolean; // Enable Hypereal character reference generation (Pro only)
  // Voice selection
  voiceType?: "standard" | "custom";
  voiceId?: string;
  voiceName?: string;
  // Storytelling-specific fields
  projectType?: "doc2video" | "storytelling" | "smartflow";
  inspirationStyle?: string;
  storyTone?: string;
  storyGenre?: string;
  voiceInclination?: string;
  brandName?: string;
  skipAudio?: boolean; // For Smart Flow without voice
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
    characterBible?: Record<string, string>; // Character descriptions for visual consistency
  };
}

interface ScriptResponse {
  title: string;
  scenes: Scene[];
  characters?: Record<string, string>; // Character bible for visual consistency
}

interface CostTracking {
  scriptTokens: number;
  audioSeconds: number;
  imagesGenerated: number;
  estimatedCostUsd: number;
  // Track actual providers used for accurate logging
  audioProvider?: string;
  audioModel?: string;
  imageProvider?: string;
  imageModel?: string;
  // Track actual image generation provider usage (to detect fallbacks)
  hyperealSuccessCount?: number;
  replicateFallbackCount?: number;
}

// ============= CONSTANTS =============
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Pricing based on ACTUAL provider costs (updated to match billing)
const PRICING = {
  // OpenRouter (Primary for script generation) - google/gemini-3-pro-preview
  scriptPerToken: 0.000003, // ~$3.00 per 1M tokens (Gemini 3 Pro via OpenRouter - higher quality)
  scriptPerCall: 0.01, // Flat estimate per script generation call
  // Audio - Chatterbox TTS on Replicate
  audioPerCall: 0.01, // ~$0.01 per audio generation call (Replicate chatterbox)
  audioPerSecond: 0.002, // fallback estimate
  // Images - Replicate nano-banana pricing (verified from Replicate dashboard)
  imageNanoBanana: 0.04, // $0.04 per image (google/nano-banana on Replicate)
  imageNanoBananaPro: 0.05, // $0.05 per image (nano-banana-pro higher res)
  imageHypereal: 0.03, // $0.03 per image (Hypereal nano-banana-pro-t2i estimate)
};

// ============= LLM CALL HELPER (OpenRouter Primary, Lovable AI Fallback) =============
interface LLMCallResult {
  content: string;
  tokensUsed: number;
  provider: "openrouter" | "lovable_ai";
  durationMs: number;
}

async function callLLMWithFallback(
  prompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  } = {},
): Promise<LLMCallResult> {
  const model = options.model || "google/gemini-3-pro-preview";
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 8192;

  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  // Try OpenRouter first (primary)
  if (OPENROUTER_API_KEY) {
    const startTime = Date.now();
    try {
      console.log(`[LLM] Calling OpenRouter with ${model}...`);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://audiomax.lovable.app",
          "X-Title": "AudioMax",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature,
          max_tokens: maxTokens,
        }),
      });

      const durationMs = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          console.log(`[LLM] OpenRouter success: ${data.usage?.total_tokens || 0} tokens, ${durationMs}ms`);
          return {
            content,
            tokensUsed: data.usage?.total_tokens || 0,
            provider: "openrouter",
            durationMs,
          };
        }
      }

      const errText = await response.text().catch(() => "");
      console.warn(`[LLM] OpenRouter failed (${response.status}): ${errText.substring(0, 200)}`);
    } catch (err) {
      console.warn(`[LLM] OpenRouter error:`, err);
    }
  } else {
    console.warn(`[LLM] OPENROUTER_API_KEY not configured, using Lovable AI directly`);
  }

  // Fallback to Lovable AI Gateway
  if (!LOVABLE_API_KEY) {
    throw new Error("Neither OPENROUTER_API_KEY nor LOVABLE_API_KEY is configured");
  }

  console.log(`[LLM] Falling back to Lovable AI Gateway with ${model}...`);
  const startTime = Date.now();

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  const durationMs = Date.now() - startTime;

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Lovable AI failed (${response.status}): ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content received from Lovable AI");
  }

  console.log(`[LLM] Lovable AI fallback success: ${data.usage?.total_tokens || 0} tokens, ${durationMs}ms`);
  return {
    content,
    tokensUsed: data.usage?.total_tokens || 0,
    provider: "lovable_ai",
    durationMs,
  };
}

// ============= API CALL LOGGING =============
// OpenRouter is used for script generation with google/gemini-3-pro-preview
// Lovable AI Gateway is used for image generation (nano-banana)
interface ApiCallLogParams {
  supabase: any;
  userId: string;
  generationId?: string;
  provider: "openrouter" | "lovable_ai" | "replicate" | "hypereal" | "google_tts" | "elevenlabs";
  model: string;
  status: "success" | "error" | "started";
  queueTimeMs?: number;
  runningTimeMs?: number;
  totalDurationMs: number;
  cost?: number;
  errorMessage?: string;
}

async function logApiCall(params: ApiCallLogParams): Promise<void> {
  try {
    const {
      supabase,
      userId,
      generationId,
      provider,
      model,
      status,
      queueTimeMs,
      runningTimeMs,
      totalDurationMs,
      cost,
      errorMessage,
    } = params;

    const { error } = await supabase.from("api_call_logs").insert({
      user_id: userId,
      generation_id: generationId || null,
      provider,
      model,
      status,
      queue_time_ms: queueTimeMs || null,
      running_time_ms: runningTimeMs || null,
      total_duration_ms: totalDurationMs,
      cost: cost || 0,
      error_message: errorMessage || null,
    });

    if (error) {
      console.error(`[API_LOG] Failed to log API call: ${error.message}`);
    } else {
      console.log(
        `[API_LOG] Logged ${provider}/${model} call: ${status}, ${totalDurationMs}ms, $${(cost || 0).toFixed(4)}`,
      );
    }
  } catch (err) {
    console.error(`[API_LOG] Error logging API call:`, err);
  }
}

// ============= SYSTEM EVENT LOGGING =============
interface SystemLogParams {
  supabase: any;
  userId?: string;
  eventType: string;
  category: "user_activity" | "system_error" | "system_warning" | "system_info";
  message: string;
  details?: Record<string, unknown>;
  generationId?: string;
  projectId?: string;
}

async function logSystemEvent(params: SystemLogParams): Promise<void> {
  try {
    const { supabase, userId, eventType, category, message, details, generationId, projectId } = params;

    const { error } = await supabase.from("system_logs").insert({
      user_id: userId || null,
      event_type: eventType,
      category,
      message,
      details: details || null,
      generation_id: generationId || null,
      project_id: projectId || null,
    });

    if (error) {
      console.error(`[SYSTEM_LOG] Failed to log event: ${error.message}`);
    }
    // Always output to console as well for edge function logs
    console.log(`[${category.toUpperCase()}] ${eventType}: ${message}`);
  } catch (err) {
    console.error(`[SYSTEM_LOG] Error logging event:`, err);
  }
}

// Helper to log API calls to system_logs for visibility
async function logApiCallToSystem(
  supabase: any,
  userId: string,
  provider: string,
  model: string,
  status: "started" | "success" | "error",
  details: Record<string, unknown>,
  generationId?: string,
  projectId?: string,
): Promise<void> {
  const category = status === "error" ? "system_error" : status === "started" ? "system_info" : "system_info";
  const eventType = `api_${provider}_${status}`;
  const message =
    status === "started"
      ? `${provider}/${model} API call started`
      : status === "success"
        ? `${provider}/${model} API call succeeded`
        : `${provider}/${model} API call failed`;

  await logSystemEvent({
    supabase,
    userId,
    eventType,
    category,
    message,
    details: { provider, model, status, ...details },
    generationId,
    projectId,
  });
}

const STYLE_PROMPTS: Record<string, string> = {
  minimalist: `Minimalist illustration using thin monoline black line art. Clean Scandinavian / modern icon vibe. Large areas of white negative space. Muted pastel palette (sage green, dusty teal, soft gray-blue, warm mustard) with flat fills only (no gradients). Centered composition, crisp edges, airy spacing, high resolution.`,
  doodle: `Urban Minimalist Doodle style. Creative, Dynamic, and Catchy Flat 2D vector illustration with indie comic aesthetic. Make the artwork detailed, highly dynamic, catchy and captivating, and filling up the entire page. Add Words to illustrate the artwork. LINE WORK: Bold, consistent-weight black outlines (monoline) that feel hand-drawn but clean, with slightly rounded terminals for a friendly, approachable feel. COLOR PALETTE: Muted Primary tones—desaturated dusty reds, sage greens, mustard yellows, and slate blues—set against a warm, textured background. CHARACTER DESIGN: Object-Head surrealism with symbolic objects creating an instant iconographic look that is relatable yet stylized. TEXTURING: Subtle Lo-Fi distressing with light paper grain, tiny ink flecks, and occasional print misalignments where color doesn't perfectly hit the line. COMPOSITION: Centralized and Floating—main subject grounded surrounded by a halo of smaller floating icons representing the theme without cluttering. Technical style: Flat 2D Vector Illustration, Indie Comic Aesthetic. Vibe: Lo-fi, Chill, Entrepreneurial, Whimsical. Influences: Modern editorial illustration, 90s streetwear graphics, and Lofi Girl aesthetics.`,
  stick: `Hand-drawn stick figure comic style. Crude, expressive black marker lines on a pure white. Extremely simple character designs (circles for heads, single lines for limbs). No fill colors—strictly black and white line art. Focus on humor and clarity. Rough, sketchy aesthetic similar to 'XKCD' or 'Wait But Why'. Imperfect circles and wobbly lines to emphasize the handmade, napkin-sketch quality. The background MUST be solid pure white (#FFFFFF)—just clean solid white.`,
  realistic: `Photorealistic cinematic photography. 4K UHD, HDR, 8k resolution. Shot on 35mm lens with shallow depth of field (bokeh) to isolate subjects. Hyper-realistic textures, dramatic studio lighting with rim lights. Natural skin tones and accurate material physics. Look of high-end stock photography or a Netflix documentary. Sharp focus, rich contrast, and true-to-life color grading. Unreal Engine 5 render quality.`,
  anime: `Expressive Modern Manga-Style Sketchbook. An expressive modern manga-style sketchbook illustration. Anatomy: Large-eye expressive anime/manga influence focusing on high emotional impact and kawaii but relatable proportions. Line Work: Very loose, visible rough sketch lines—looks like a final drawing made over a messy pencil draft. Coloring: Natural tones with focus on skin-glow, painterly approach with visible thick brush strokes. Vibe: Cozy, chaotic, and sentimental slice-of-life moments. Features loose sketchy digital pencil lines and painterly slice-of-life aesthetic. High-detail facial expressions with large emotive eyes. Visible brush strokes. Set in detailed, slightly messy environment that feels lived-in. Cozy, relatable, and artistically sophisticated.`,
  "3D Pix": `Cinematic 3D Animation. A stunning 3D cinematic animation-style render in the aesthetic of modern Disney-Pixar films. Surface Geometry: Squash and Stretch—appealing rounded shapes with soft exaggerated features, avoiding sharp angles unless part of mechanical design. Material Science: Subsurface Scattering—that Disney glow where light slightly penetrates the surface like real skin or wax, textures are stylized realism with soft fur, knit fabrics, or polished plastic. Lighting Design: Three-Point Cinematic—strong key light, soft fill light to eliminate harsh shadows, bright rim light (backlight) creating glowing silhouette separating from background. Eyes: The Soul Focal Point—large, highly detailed eyes with realistic specular highlights and deep iris colors making character feel sentient and emotive. Atmosphere: Volumetric Depth—light fog, dust motes, or god rays creating sense of physical space, background has soft bokeh blur keeping focus on subject. High-detail textures, expressive large eyes, soft rounded features. Vibrant saturated colors with high-end subsurface scattering on all surfaces. Rendered in 8k using Octane, shallow depth of field, whimsical softly blurred background. Masterpiece quality, charming, tactile, and highly emotive.`,
  claymation: `Handcrafted Digital Clay. A high-detail 3D claymation-style render. Material Texture: Matte & Tactile—surfaces must show subtle, realistic imperfections like tiny thumbprints, slight molding creases, and a soft matte finish that mimics polymer clay (like Sculpey or Fimo). Lighting: Miniature Macro Lighting—soft, high-contrast studio lighting that makes the subject look like a small physical object, includes Rim Lighting to make the edges glow and deep, soft-edge shadows. Proportions: Chunky & Appealing—thick, rounded limbs and exaggerated squashy features, avoid any sharp digital edges, everything should look like it was rolled between two palms. Atmosphere: Depth of Field—heavy background blur (bokeh) essential to sell the small toy scale, making the subject pop as the central focus. Color Palette: Saturated & Playful—bold, solid primary colors that look like they came straight out of a clay pack, avoiding complex gradients. 8k resolution, Octane Render, masterpiece quality.`,
  sketch: `Emphasize on the papercut out effect with the trough shadow... MANDATORY: apply papercut out effect, with strong dark 3D backdrop shadow. Hand-Drawn Stick figure Paper Cutout 3D Drop Shadows. Hand-drawn stick figure comic style. Crude, expressive black marker lines on a pure white. Extremely simple character designs (circles for heads, single lines for limbs). Rough, sketchy aesthetic similar to 'XKCD' or 'Wait But Why'. strictly black and white line art. High contrast black and white ONLY no other color. Focus on humor and clarity. Imperfect circles and wobbly lines to emphasize the handmade, napkin-sketch quality. Crucial Effect: Apply strong "paper cutout" 3D drop shadows behind the characters and objects to make them pop off the page like a diorama. Imperfect, hand-drawn monoline strokes. natural. Make sure you pay attention to orientation. and number or arms and legs. Make it detailed, highly creative, extremely expressive, and dynamic, while keeping character consistency. Include environment or setting of the scene so user can see what where the scene is happening. Make on a plain solid white background.`,
  caricature: `Humorous caricature illustration. Highly exaggerated facial features and distorted body proportions (oversized heads, tiny bodies) designed to emphasize personality quirks or famous traits. Stylized digital painting with expressive, thick brushwork and vibrant, slightly saturated colors. Playful, satirical, and expressive rendering. The look of high-quality political cartoons or MAD magazine cover art.`,
  moody: `Moody monochrome indie comic illustration in black, white, and grays. Thick clean outlines with hand-inked crosshatching and scratchy pen texture for shading. Slightly uneven line quality like traditional ink on paper. Cute-but-unsettling character design: oversized head, huge simple eyes empty, tiny mouth, minimal nose; small body with simplified hands. Cinematic centered framing, quiet tension, lots of flat mid-gray tones. Subtle paper grain and faint smudges. Background is minimal but grounded with simple interior props drawn in the same inked style. Overall vibe: moody, not happy, melancholic, eerie, storybook graphic novel panel, high contrast, no color. 2D ink drawing.`,
  storybook: `Whimsical storybook hand-drawn ink style. Hand-drawn black ink outlines with visible rough sketch construction lines, slightly uneven strokes, and occasional line overlap (imperfect but intentional). Bold vivid natural color palette. Crosshatching and scribbly pen shading for depth and texture, especially in shadows and on fabric folds. Watercolor + gouache-like washes: layered, semi-opaque paint with soft gradients. Edges slightly loose (not crisp), with gentle paint bleed and dry-brush texture in places. Cartoon-proportioned character design: slightly exaggerated features (large eyes, long limbs, expressive faces), but grounded in believable anatomy and posture. Background detailed but painterly: textured walls, props with sketchy detail, and atmospheric depth. Subtle grain + ink flecks for a handmade print feel. Cinematic framing, shallow depth cues, soft focus in far background. Editorial illustration / indie animation concept art aesthetic. Charming, cozy, slightly messy, richly textured, high detail, UHD. No 3D render, no clean vector, no flat icon style, no anime/manga linework, no glossy neon gradients, no photorealism.`,
  crayon: `Cute childlike crayon illustration on clean white paper background. Waxy crayon / oil pastel scribble texture with visible stroke marks and uneven fill (messy on purpose). Simple rounded shapes, thick hand-drawn outlines, minimal details, playful proportions (big head, small body). Bright limited palette like orange + blue + yellow, rough shading and light smudges like real crayons on paper. Simple cheerful scene, lots of white space, friendly smiley faces. Looks like kindergarten drawing scanned into computer. High resolution. No vector, no clean digital painting, no 3D, no realism, no gradients, no sharp edges.`,
  chalkboard: `A hand-drawn chalkboard illustration style characterized by voluntarily imperfect, organic lines that capture the authentic vibe of human handwriting. Unlike rigid digital art, the strokes feature subtle wobbles, varying pressure, and natural endpoints, mimicking the tactile feel of chalk held by a steady hand. The background is a deep, dark slate grey, almost black, with a very subtle, fine-grain slate texture that suggests a fresh, clean surface rather than a dusty one. The line work features crisp, monoline chalk outlines that possess the dry, slightly grainy texture of real chalk and are drawn with authentic vibe of hand-drawing, yet ensuring a confident and legible look. The color palette utilizes high-contrast stark white. The rendering is flat and illustrative, with solid chalk fills textured via diagonal hatching or stippling to let the dark background show through slightly, creating a vibe that is smart, academic, and hand-crafted yet thoroughly professional. No other colors than white.`,
};

const TEXT_OVERLAY_STYLES = ["minimalist", "doodle", "stick"];

// Styles that ALWAYS use premium image generation (Hypereal → Replicate Pro fallback)
// These styles require higher quality rendering regardless of subscription tier
const PREMIUM_REQUIRED_STYLES = ["sketch"]; // Papercut 3D style

// Pro/Enterprise tiers that get Hypereal access
const PRO_TIER_PLANS = ["professional", "enterprise"];

// ============= SUBSCRIPTION TIER CHECK =============
async function isProOrEnterpriseTier(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("plan_name, status")
      .eq("user_id", userId)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.log(`[SUBSCRIPTION] Error checking tier for user ${userId}: ${error.message}`);
      return false;
    }

    if (!subscription) {
      console.log(`[SUBSCRIPTION] No active subscription found for user ${userId}`);
      return false;
    }

    const isPro = PRO_TIER_PLANS.includes(subscription.plan_name?.toLowerCase());
    console.log(`[SUBSCRIPTION] User ${userId} plan: ${subscription.plan_name}, isPro: ${isPro}`);
    return isPro;
  } catch (err) {
    console.error(`[SUBSCRIPTION] Error checking tier: ${err}`);
    return false;
  }
}

// ============= HYPEREAL AI CHARACTER GENERATION (Pro Feature) =============
interface CharacterReference {
  name: string;
  description: string;
  referenceImageUrl: string;
}

async function generateCharacterReferenceWithHypereal(
  characterName: string,
  description: string,
  hyperealApiKey: string,
  supabase: any,
  userId: string,
  projectId: string,
): Promise<{ url: string | null; error?: string }> {
  try {
    console.log(`[HYPEREAL] Generating character reference for: ${characterName}`);

    // Build portrait prompt for character reference sheet
    const prompt = `Character reference portrait of ${characterName}:
${description}

REQUIREMENTS:
- Clean, neutral background (white or light gray)
- Upper body portrait showing head and shoulders
- Face clearly visible, neutral/slight smile expression
- High detail on facial features for recognition
- Professional character reference sheet quality
- Ultra high resolution`;

    const response = await fetch("https://api.hypereal.tech/v1/images/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hyperealApiKey}`,
      },
      body: JSON.stringify({
        prompt,
        model: "nano-banana-pro-t2i",
        resolution: "1k",
        aspect_ratio: "1:1", // Square for portraits
        output_format: "png",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[HYPEREAL] API error: ${response.status} - ${errText}`);
      return { url: null, error: `Hypereal API failed: ${response.status}` };
    }

    const data = await response.json();

    // Hypereal returns the image URL or base64
    let imageBytes: Uint8Array;
    if (data.image_url) {
      // Download the image
      const imgResponse = await fetch(data.image_url);
      if (!imgResponse.ok) {
        return { url: null, error: "Failed to download generated image" };
      }
      imageBytes = new Uint8Array(await imgResponse.arrayBuffer());
    } else if (data.image) {
      // Base64 encoded image
      imageBytes = base64Decode(data.image);
    } else {
      return { url: null, error: "No image data in Hypereal response" };
    }

    // Upload to Supabase storage
    const safeName = characterName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const path = `${userId}/${projectId}/characters/${safeName}-ref-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(path, imageBytes, { contentType: "image/png", upsert: true });

    if (uploadError) {
      console.error(`[HYPEREAL] Upload failed: ${uploadError.message}`);
      return { url: null, error: `Upload failed: ${uploadError.message}` };
    }

    // Get signed URL
    const { data: signedData, error: signError } = await supabase.storage.from("audio").createSignedUrl(path, 604800); // 7 days

    if (signError || !signedData?.signedUrl) {
      return { url: null, error: "Failed to create signed URL" };
    }

    console.log(`[HYPEREAL] Character reference generated successfully for: ${characterName}`);
    return { url: signedData.signedUrl };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown Hypereal error";
    console.error(`[HYPEREAL] Error generating character reference:`, errorMsg);
    return { url: null, error: errorMsg };
  }
}

// ============= IMAGE GENERATION WITH HYPEREAL (Tiered: Pro uses nano-banana-pro-t2i, Standard uses nano-banana-t2i) =============
async function generateImageWithHypereal(
  prompt: string,
  hyperealApiKey: string,
  format: string,
  useProModel: boolean = true, // Pro/Enterprise users get nano-banana-pro-t2i, others get nano-banana-t2i
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  // Map format to Hypereal aspect ratios
  const aspectRatio = format === "portrait" ? "9:16" : format === "square" ? "1:1" : "16:9";
  // Use 1K resolution for cost efficiency
  const resolution = "1k";
  
  // Select model based on subscription tier
  const model = useProModel ? "nano-banana-pro-t2i" : "nano-banana-t2i";
  const modelLabel = useProModel ? "Hypereal Pro" : "Hypereal Standard";

  try {
    console.log(
      `[HYPEREAL] Generating scene image with ${model}, format: ${format}, aspect_ratio: ${aspectRatio}`,
    );

    const response = await fetch("https://api.hypereal.tech/v1/images/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hyperealApiKey}`,
      },
      body: JSON.stringify({
        prompt,
        model,
        resolution,
        aspect_ratio: aspectRatio,
        output_format: "png",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[HYPEREAL] ${modelLabel} API error: ${response.status} - ${errText}`);
      return { ok: false, error: `Hypereal API failed: ${response.status}` };
    }

    const data = await response.json();

    // Hypereal can return image URL in different formats:
    // 1. data.data[0].url (standard format)
    // 2. data.image_url (direct URL)
    // 3. data.image (base64)
    let imageBytes: Uint8Array;
    const imageUrl = data.data?.[0]?.url || data.image_url;

    if (imageUrl) {
      console.log(`[HYPEREAL] ${modelLabel} downloading image from URL: ${imageUrl.substring(0, 80)}...`);
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) {
        return { ok: false, error: "Failed to download Hypereal image" };
      }
      imageBytes = new Uint8Array(await imgResponse.arrayBuffer());
    } else if (data.image) {
      imageBytes = base64Decode(data.image);
    } else {
      console.error(`[HYPEREAL] ${modelLabel} no image data in response:`, JSON.stringify(data).substring(0, 200));
      return { ok: false, error: "No image data in Hypereal response" };
    }

    console.log(`[HYPEREAL] ${modelLabel} image generated successfully: ${imageBytes.length} bytes`);
    return { ok: true, bytes: imageBytes };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown Hypereal error";
    console.error(`[HYPEREAL] ${modelLabel} error:`, errorMsg);
    return { ok: false, error: errorMsg };
  }
}

// ============= HELPER FUNCTIONS =============
function getStylePrompt(style: string, customStyle?: string): string {
  if (style === "custom" && customStyle) return customStyle;
  return STYLE_PROMPTS[style.toLowerCase()] || style;
}

function getImageDimensions(format: string): { width: number; height: number; aspectRatio: string } {
  // p-image supports aspect_ratio or custom dimensions (multiples of 16, max 1440)
  switch (format) {
    case "portrait":
      return { width: 816, height: 1440, aspectRatio: "9:16" };
    case "square":
      return { width: 1024, height: 1024, aspectRatio: "1:1" };
    default:
      return { width: 1440, height: 816, aspectRatio: "16:9" }; // landscape
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
  // 32-bit audio from Replicate is IEEE float (format 3), not integer PCM (format 1)
  const audioFormat = bitsPerSample === 32 ? 3 : 1;

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
  view.setUint16(20, audioFormat, true); // AudioFormat (1 = PCM integer, 3 = IEEE float)
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

// ============= CHUNK & STITCH ENGINE (Bypass ~30s TTS limit) =============

// Split text into safe chunks at sentence boundaries (~400 chars each)
function splitTextIntoChunks(text: string, maxChars: number = 400): string[] {
  // Split by sentence terminators
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    // If adding this sentence would exceed max, save current and start new
    if ((currentChunk + " " + trimmedSentence).trim().length > maxChars && currentChunk.trim()) {
      chunks.push(currentChunk.trim());
      currentChunk = trimmedSentence;
    } else {
      currentChunk = (currentChunk + " " + trimmedSentence).trim();
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // If no chunks, return original text as single chunk
  return chunks.length > 0 ? chunks : [text.trim()];
}

// Extract raw PCM data from a WAV file (strip header)
function extractPcmFromWav(wavBytes: Uint8Array): {
  pcm: Uint8Array;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
} {
  // CRITICAL: Create a fresh ArrayBuffer copy to avoid byteOffset issues
  const freshBuffer = new Uint8Array(wavBytes).buffer;
  const view = new DataView(freshBuffer);

  // Read header info (standard WAV has 44-byte header)
  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);

  console.log(`[WAV-Parse] Header: ${sampleRate}Hz, ${numChannels}ch, ${bitsPerSample}bit`);

  // Find 'data' chunk - standard position is at offset 36
  // But some WAVs have extra chunks, so we search for it
  let dataOffset = 36;
  let dataSize = 0;

  // Search for 'data' chunk ID (0x64617461)
  for (let offset = 12; offset < Math.min(wavBytes.length - 8, 200); offset++) {
    if (
      wavBytes[offset] === 0x64 &&
      wavBytes[offset + 1] === 0x61 &&
      wavBytes[offset + 2] === 0x74 &&
      wavBytes[offset + 3] === 0x61
    ) {
      dataOffset = offset + 8; // Skip 'data' + size (4 + 4 bytes)
      dataSize = view.getUint32(offset + 4, true);
      console.log(`[WAV-Parse] Found data chunk at offset ${offset}, size ${dataSize}`);
      break;
    }
  }

  // If no 'data' chunk found, assume standard 44-byte header
  if (dataSize === 0) {
    dataOffset = 44;
    dataSize = wavBytes.length - 44;
    console.log(`[WAV-Parse] Using default 44-byte header, data size ${dataSize}`);
  }

  const pcm = wavBytes.slice(dataOffset, dataOffset + dataSize);
  return { pcm, sampleRate, numChannels, bitsPerSample };
}

// Merge multiple WAV buffers into one seamless audio file
function stitchWavBuffers(buffers: Uint8Array[]): Uint8Array {
  if (buffers.length === 0) return new Uint8Array(0);
  if (buffers.length === 1) return buffers[0];

  console.log(`[WAV-Stitch] Stitching ${buffers.length} audio buffers...`);

  // Extract params and PCM from all buffers
  const parsedBuffers = buffers.map((b, idx) => {
    const parsed = extractPcmFromWav(b);
    console.log(`[WAV-Stitch] Buffer ${idx + 1}: ${parsed.pcm.length} bytes, ${parsed.sampleRate}Hz`);
    return parsed;
  });

  // Use first buffer's params as reference
  const { sampleRate, numChannels, bitsPerSample } = parsedBuffers[0];

  // Validate all buffers have matching params
  for (let i = 1; i < parsedBuffers.length; i++) {
    const p = parsedBuffers[i];
    if (p.sampleRate !== sampleRate || p.numChannels !== numChannels || p.bitsPerSample !== bitsPerSample) {
      console.warn(
        `[WAV-Stitch] Buffer ${i + 1} mismatch: ${p.sampleRate}Hz vs ${sampleRate}Hz - may cause audio artifacts`,
      );
    }
  }

  // Extract PCM parts
  const pcmParts = parsedBuffers.map((p) => p.pcm);

  // Calculate total PCM length
  const totalLength = pcmParts.reduce((acc, part) => acc + part.length, 0);
  const mergedPcm = new Uint8Array(totalLength);
  console.log(`[WAV-Stitch] Total PCM size: ${totalLength} bytes`);

  // Concatenate all PCM data
  let offset = 0;
  for (const part of pcmParts) {
    mergedPcm.set(part, offset);
    offset += part.length;
  }

  // Build final WAV with merged PCM
  const finalWav = pcmToWav(mergedPcm, sampleRate, numChannels, bitsPerSample);
  console.log(`[WAV-Stitch] Final WAV: ${finalWav.length} bytes at ${sampleRate}Hz`);
  return finalWav;
}

// Call Replicate Chatterbox TTS for a single chunk
async function callReplicateTTSChunk(
  text: string,
  replicateApiKey: string,
  chunkIndex: number,
  voiceGender: string = "female", // "male" or "female"
): Promise<Uint8Array> {
  console.log(`[TTS-Chunk] Chunk ${chunkIndex + 1}: ${text.substring(0, 60)}... (${text.length} chars)`);

  // Map gender to Replicate voice names: male = Ethan, female = Marisol
  const voiceName = voiceGender === "male" ? "Ethan" : "Marisol";
  console.log(`[TTS-Chunk] Using voice: ${voiceName} (gender: ${voiceGender})`);

  const createResponse = await fetch("https://api.replicate.com/v1/models/resemble-ai/chatterbox-turbo/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${replicateApiKey}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      input: {
        text: text,
        voice: voiceName,
        temperature: 0.9,
        top_p: 1,
        top_k: 1800,
        repetition_penalty: 2,
      },
    }),
  });

  if (!createResponse.ok) {
    const errText = await createResponse.text();
    throw new Error(`Replicate TTS chunk ${chunkIndex + 1} failed: ${createResponse.status} - ${errText}`);
  }

  let prediction = await createResponse.json();

  // Poll if not completed
  while (prediction.status !== "succeeded" && prediction.status !== "failed") {
    await sleep(1000);
    const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${replicateApiKey}` },
    });
    prediction = await pollResponse.json();
  }

  if (prediction.status === "failed") {
    throw new Error(`TTS chunk ${chunkIndex + 1} prediction failed: ${prediction.error || "Unknown error"}`);
  }

  const outputUrl = prediction.output;
  if (!outputUrl) throw new Error(`No output URL from TTS chunk ${chunkIndex + 1}`);

  // Download audio
  const audioResponse = await fetch(outputUrl);
  if (!audioResponse.ok) throw new Error(`Failed to download audio for chunk ${chunkIndex + 1}`);

  return new Uint8Array(await audioResponse.arrayBuffer());
}

// Generate audio with chunking for long scripts
async function generateSceneAudioReplicateChunked(
  scene: Scene,
  sceneIndex: number,
  replicateApiKey: string,
  supabase: any,
  userId: string,
  projectId: string,
  isRegeneration: boolean = false,
  voiceGender: string = "female", // "male" or "female"
): Promise<{ url: string | null; error?: string; durationSeconds?: number }> {
  const voiceoverText = sanitizeVoiceover(scene.voiceover);

  if (!voiceoverText || voiceoverText.length < 2) {
    return { url: null, error: "No voiceover text" };
  }

  try {
    // Split text into chunks to bypass ~30s limit
    const chunks = splitTextIntoChunks(voiceoverText, 400);
    console.log(
      `[TTS-Chunked] Scene ${sceneIndex + 1}: Splitting into ${chunks.length} chunks (${voiceoverText.length} total chars)`,
    );

    if (chunks.length === 1) {
      // Short text - use regular single-call TTS
      console.log(`[TTS-Chunked] Scene ${sceneIndex + 1}: Single chunk, using direct call`);
      const audioBuffer = await callReplicateTTSChunk(chunks[0], replicateApiKey, 0, voiceGender);

      const durationSeconds = Math.max(1, audioBuffer.length / (44100 * 2));

      const audioPath = isRegeneration
        ? `${userId}/${projectId}/scene-${sceneIndex + 1}-${Date.now()}.wav`
        : `${userId}/${projectId}/scene-${sceneIndex + 1}.wav`;

      const { error: uploadError } = await supabase.storage
        .from("audio")
        .upload(audioPath, audioBuffer, { contentType: "audio/wav", upsert: true });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: signedData, error: signError } = await supabase.storage
        .from("audio")
        .createSignedUrl(audioPath, 604800);

      if (signError || !signedData?.signedUrl) {
        throw new Error(`Failed to create signed URL: ${signError?.message || "Unknown error"}`);
      }

      return { url: signedData.signedUrl, durationSeconds };
    }

    // Multiple chunks - generate in parallel and stitch
    console.log(`[TTS-Chunked] Scene ${sceneIndex + 1}: Generating ${chunks.length} chunks in parallel...`);

    const chunkPromises = chunks.map((chunk, idx) =>
      callReplicateTTSChunk(chunk, replicateApiKey, idx, voiceGender).catch((err) => {
        console.error(`[TTS-Chunked] Chunk ${idx + 1} failed:`, err.message);
        throw err;
      }),
    );

    const audioBuffers = await Promise.all(chunkPromises);
    console.log(`[TTS-Chunked] Scene ${sceneIndex + 1}: All ${audioBuffers.length} chunks generated. Stitching...`);

    // Stitch all chunks together
    const finalWavBytes = stitchWavBuffers(audioBuffers);

    // Parse the final WAV to get actual sample rate for duration calculation
    const finalParsed = extractPcmFromWav(finalWavBytes);
    const bytesPerSample = finalParsed.bitsPerSample / 8;
    const bytesPerSecond = finalParsed.sampleRate * finalParsed.numChannels * bytesPerSample;
    const durationSeconds = Math.max(1, finalParsed.pcm.length / bytesPerSecond);

    console.log(
      `[TTS-Chunked] Scene ${sceneIndex + 1}: Final stitched audio: ${finalWavBytes.length} bytes, ${durationSeconds.toFixed(1)}s at ${finalParsed.sampleRate}Hz`,
    );

    const audioPath = isRegeneration
      ? `${userId}/${projectId}/scene-${sceneIndex + 1}-${Date.now()}.wav`
      : `${userId}/${projectId}/scene-${sceneIndex + 1}.wav`;

    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(audioPath, finalWavBytes, { contentType: "audio/wav", upsert: true });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: signedData, error: signError } = await supabase.storage
      .from("audio")
      .createSignedUrl(audioPath, 604800);

    if (signError || !signedData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${signError?.message || "Unknown error"}`);
    }

    console.log(`[TTS-Chunked] Scene ${sceneIndex + 1}: ✅ Stitched audio uploaded (${durationSeconds.toFixed(1)}s)`);
    return { url: signedData.signedUrl, durationSeconds };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown TTS chunking error";
    console.error(`[TTS-Chunked] Scene ${sceneIndex + 1} error:`, errorMsg);
    return { url: null, error: errorMsg };
  }
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

// ============= GEMINI TTS MODELS (Haitian Creole only) =============
// Primary: 2.5 Pro Preview TTS (best quality for HC)
// Fallback: 2.5 Flash Preview TTS → Lovable AI Gateway (2.5 Flash → 2.5 Pro)
const GEMINI_TTS_MODELS = [
  { name: "gemini-2.5-pro-preview-tts", label: "2.5 Pro Preview TTS" },
  { name: "gemini-2.5-flash-preview-tts", label: "2.5 Flash Preview TTS" },
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

  // Remove promotional/call-to-action phrases that trigger content filters
  // These patterns are commonly flagged: "like", "subscribe", "follow", "comment", etc.
  const promotionalPatterns = [
    /\b(swiv|follow|like|subscribe|kòmante|comment|pataje|share|abòneman)\b[^.]*\./gi,
    /\b(swiv kont|follow the|like and|share this)\b[^.]*$/gi,
    /\.\s*(swiv|like|pataje|share|follow)[^.]*$/gi,
  ];
  for (const pattern of promotionalPatterns) {
    voiceoverText = voiceoverText.replace(pattern, ".");
  }
  voiceoverText = voiceoverText.replace(/\.+/g, ".").replace(/\s+/g, " ").trim();

  // On retries, add text variations to bypass content filtering
  // The content filter seems triggered by certain text patterns, so we vary the input
  if (retryAttempt > 0) {
    // Strip any remaining promotional content on retries
    voiceoverText = voiceoverText.replace(/[Ss]wiv[^.]*\./g, "").trim();

    const variations = [
      voiceoverText, // Try clean text first
      "Please narrate the following: " + voiceoverText,
      "Read this story aloud: " + voiceoverText,
      voiceoverText + " End of narration.",
      "Educational content: " + voiceoverText,
      "Documentary narration: " + voiceoverText,
      "Story segment: " + voiceoverText,
      voiceoverText.replace(/\./g, ";").replace(/;([^;]*)$/, ".$1"), // Replace periods with semicolons except last
      voiceoverText.split(".").slice(0, -1).join(".") + ".", // Remove last sentence
      "In this segment: " + voiceoverText,
    ];
    voiceoverText = variations[retryAttempt % variations.length];
    console.log(`[TTS-Gemini] Retry ${retryAttempt} using variation: ${voiceoverText.substring(0, 80)}...`);
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
      console.log(
        `[TTS-Gemini] Scene ${sceneIndex + 1} trimmed ${pcmBytes.length - trimEnd} bytes of trailing silence`,
      );
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

    // Use signed URL for secure access (7 days expiration)
    const { data: signedData, error: signError } = await supabase.storage
      .from("audio")
      .createSignedUrl(audioPath, 604800); // 7 days in seconds

    if (signError || !signedData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${signError?.message || "Unknown error"}`);
    }
    console.log(`[TTS-Gemini] Scene ${sceneIndex + 1} audio uploaded OK using ${modelLabel}`);
    return { url: signedData.signedUrl, durationSeconds };
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

// ============= LOVABLE AI GATEWAY TTS (Fallback for Haitian Creole) =============
// Uses Lovable AI Gateway with Gemini models for TTS fallback when direct Google API fails
async function generateSceneAudioLovableAI(
  scene: Scene,
  sceneIndex: number,
  lovableApiKey: string,
  supabase: any,
  userId: string,
  projectId: string,
  isRegeneration: boolean = false,
): Promise<{ url: string | null; error?: string; durationSeconds?: number; provider?: string }> {
  let voiceoverText = sanitizeForGeminiTTS(scene.voiceover);

  if (!voiceoverText || voiceoverText.length < 2) {
    return { url: null, error: "No voiceover text" };
  }

  // Remove promotional/call-to-action phrases that trigger content filters
  const promotionalPatterns = [
    /\b(swiv|follow|like|subscribe|kòmante|comment|pataje|share|abòneman)\b[^.]*\./gi,
    /\b(swiv kont|follow the|like and|share this)\b[^.]*$/gi,
    /\.\s*(swiv|like|pataje|share|follow)[^.]*$/gi,
  ];
  for (const pattern of promotionalPatterns) {
    voiceoverText = voiceoverText.replace(pattern, ".");
  }
  voiceoverText = voiceoverText.replace(/\.+/g, ".").replace(/\s+/g, " ").trim();

  // Lovable AI models to try for TTS
  const LOVABLE_TTS_MODELS = [
    { model: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { model: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ];

  for (const { model, label } of LOVABLE_TTS_MODELS) {
    try {
      console.log(`[TTS-LovableAI] Scene ${sceneIndex + 1} - Trying ${label} via Lovable AI Gateway`);
      console.log(`[TTS-LovableAI] Text length: ${voiceoverText.length} chars`);

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          modalities: ["audio", "text"],
          audio: {
            voice: "Enceladus",
            format: "wav",
          },
          messages: [
            {
              role: "user",
              content: `[Speak with natural enthusiasm, warmth and energy like sharing exciting news with a friend] ${voiceoverText}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`[TTS-LovableAI] ${label} API error: ${response.status} - ${errText}`);
        continue; // Try next model
      }

      const data = await response.json();
      console.log(`[TTS-LovableAI] ${label} response received`);

      // Extract audio from response
      const message = data.choices?.[0]?.message;
      const audioData = message?.audio?.data;

      if (!audioData) {
        console.error(`[TTS-LovableAI] ${label} no audio data in response:`, JSON.stringify(data).substring(0, 300));
        continue; // Try next model
      }

      const audioBytes = base64Decode(audioData);
      console.log(`[TTS-LovableAI] Scene ${sceneIndex + 1} audio bytes: ${audioBytes.length}`);

      // Estimate duration (WAV format: 16-bit, 24kHz)
      const durationSeconds = Math.max(1, audioBytes.length / (24000 * 2));

      const audioPath = isRegeneration
        ? `${userId}/${projectId}/scene-${sceneIndex + 1}-${Date.now()}.wav`
        : `${userId}/${projectId}/scene-${sceneIndex + 1}.wav`;
      const { error: uploadError } = await supabase.storage
        .from("audio")
        .upload(audioPath, audioBytes, { contentType: "audio/wav", upsert: true });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: signedData, error: signError } = await supabase.storage
        .from("audio")
        .createSignedUrl(audioPath, 604800);

      if (signError || !signedData?.signedUrl) {
        throw new Error(`Failed to create signed URL: ${signError?.message || "Unknown error"}`);
      }

      console.log(`[TTS-LovableAI] Scene ${sceneIndex + 1} ✅ SUCCESS with ${label}`);
      return {
        url: signedData.signedUrl,
        durationSeconds,
        provider: `Lovable AI ${label} TTS`,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown Lovable AI TTS error";
      console.error(`[TTS-LovableAI] Scene ${sceneIndex + 1} ${label} error:`, errorMsg);
    }
  }

  return { url: null, error: "All Lovable AI TTS models failed" };
}

// ============= OPENROUTER TTS (gpt-audio and gpt-4o-mini-tts) =============
async function generateSceneAudioOpenRouter(
  scene: Scene,
  sceneIndex: number,
  openRouterApiKey: string,
  supabase: any,
  userId: string,
  projectId: string,
  modelName: string,
  modelLabel: string,
  isRegeneration: boolean = false,
): Promise<{ url: string | null; error?: string; durationSeconds?: number; provider?: string }> {
  let voiceoverText = sanitizeForGeminiTTS(scene.voiceover);

  if (!voiceoverText || voiceoverText.length < 2) {
    return { url: null, error: "No voiceover text" };
  }

  try {
    console.log(`[TTS-OpenRouter] Scene ${sceneIndex + 1} - Using ${modelLabel}`);
    console.log(`[TTS-OpenRouter] Text length: ${voiceoverText.length} chars`);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://motionmax.io",
        "X-Title": "MotionMax",
      },
      body: JSON.stringify({
        model: modelName,
        modalities: ["text", "audio"],
        audio: { voice: "alloy", format: "wav" },
        messages: [
          {
            role: "user",
            content: `Please read the following text aloud with natural enthusiasm and warmth, like sharing exciting news with a friend:\n\n${voiceoverText}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[TTS-OpenRouter] ${modelLabel} API error:`, response.status, errText);
      throw new Error(`${modelLabel} failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    console.log(`[TTS-OpenRouter] ${modelLabel} response received`);

    // Extract audio from response
    const message = data.choices?.[0]?.message;
    if (!message?.audio?.data) {
      console.error(
        `[TTS-OpenRouter] ${modelLabel} no audio data in response:`,
        JSON.stringify(data).substring(0, 500),
      );
      throw new Error(`No audio data in ${modelLabel} response`);
    }

    const audioBase64 = message.audio.data;
    const audioBytes = base64Decode(audioBase64);
    console.log(`[TTS-OpenRouter] Scene ${sceneIndex + 1} audio bytes: ${audioBytes.length}`);

    // Estimate duration (WAV format: 16-bit, typically 24kHz or 44.1kHz)
    const durationSeconds = Math.max(1, audioBytes.length / (24000 * 2));

    const audioPath = isRegeneration
      ? `${userId}/${projectId}/scene-${sceneIndex + 1}-${Date.now()}.wav`
      : `${userId}/${projectId}/scene-${sceneIndex + 1}.wav`;
    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(audioPath, audioBytes, { contentType: "audio/wav", upsert: true });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: signedData, error: signError } = await supabase.storage
      .from("audio")
      .createSignedUrl(audioPath, 604800);

    if (signError || !signedData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${signError?.message || "Unknown error"}`);
    }

    console.log(`[TTS-OpenRouter] Scene ${sceneIndex + 1} ✅ SUCCESS with ${modelLabel}`);
    return { url: signedData.signedUrl, durationSeconds, provider: `OpenRouter ${modelLabel}` };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown OpenRouter TTS error";
    console.error(`[TTS-OpenRouter] Scene ${sceneIndex + 1} ${modelLabel} error:`, errorMsg);
    return { url: null, error: errorMsg };
  }
}

// ============= ELEVENLABS TTS =============
async function generateSceneAudioElevenLabs(
  scene: Scene,
  sceneIndex: number,
  elevenLabsApiKey: string,
  supabase: any,
  userId: string,
  projectId: string,
  voiceId?: string,
  isRegeneration: boolean = false,
): Promise<{ url: string | null; error?: string; durationSeconds?: number; provider?: string }> {
  let voiceoverText = sanitizeVoiceover(scene.voiceover);

  if (!voiceoverText || voiceoverText.length < 2) {
    return { url: null, error: "No voiceover text" };
  }

  // Default to George voice if no custom voice specified
  const selectedVoiceId = voiceId || "JBFqnCBsd6RMkjVDRZzb";
  const voiceLabel = voiceId ? `Custom Voice (${voiceId.substring(0, 8)}...)` : "George (default)";

  try {
    console.log(`[TTS-ElevenLabs] Scene ${sceneIndex + 1} - Using ${voiceLabel}`);
    console.log(`[TTS-ElevenLabs] Text length: ${voiceoverText.length} chars`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: voiceoverText,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[TTS-ElevenLabs] API error:`, response.status, errText);
      throw new Error(`ElevenLabs failed: ${response.status} - ${errText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);
    console.log(`[TTS-ElevenLabs] Scene ${sceneIndex + 1} audio bytes: ${audioBytes.length}`);

    // Estimate duration (MP3 at 128kbps ≈ 16KB/sec)
    const durationSeconds = Math.max(1, audioBytes.length / 16000);

    const audioPath = isRegeneration
      ? `${userId}/${projectId}/scene-${sceneIndex + 1}-${Date.now()}.mp3`
      : `${userId}/${projectId}/scene-${sceneIndex + 1}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(audioPath, audioBytes, { contentType: "audio/mpeg", upsert: true });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: signedData, error: signError } = await supabase.storage
      .from("audio")
      .createSignedUrl(audioPath, 604800);

    if (signError || !signedData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${signError?.message || "Unknown error"}`);
    }

    console.log(`[TTS-ElevenLabs] Scene ${sceneIndex + 1} ✅ SUCCESS with ${voiceLabel}`);
    return { url: signedData.signedUrl, durationSeconds, provider: `ElevenLabs ${voiceLabel}` };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown ElevenLabs TTS error";
    console.error(`[TTS-ElevenLabs] Scene ${sceneIndex + 1} error:`, errorMsg);
    return { url: null, error: errorMsg };
  }
}

// ============= ELEVENLABS SPEECH-TO-SPEECH (Voice Changer) =============
// Transforms source audio to match a target voice while preserving timing and emotion
async function transformAudioWithElevenLabsSTS(
  sourceAudioUrl: string,
  targetVoiceId: string,
  sceneIndex: number,
  elevenLabsApiKey: string,
  supabase: any,
  userId: string,
  projectId: string,
  isRegeneration: boolean = false,
): Promise<{ url: string | null; error?: string; durationSeconds?: number; provider?: string }> {
  try {
    console.log(`[STS-ElevenLabs] Scene ${sceneIndex + 1} - Downloading source audio for voice transformation...`);

    // Download the source audio
    const sourceResponse = await fetch(sourceAudioUrl);
    if (!sourceResponse.ok) {
      throw new Error(`Failed to download source audio: ${sourceResponse.status}`);
    }
    const sourceAudioBytes = new Uint8Array(await sourceResponse.arrayBuffer());
    console.log(`[STS-ElevenLabs] Scene ${sceneIndex + 1} - Source audio downloaded: ${sourceAudioBytes.length} bytes`);

    // Prepare multipart form data for Speech-to-Speech API
    const boundary = `----ElevenLabsSTS${Date.now()}`;

    // Build multipart body
    const parts: Uint8Array[] = [];
    const encoder = new TextEncoder();

    // Add audio file part
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="audio"; filename="source.wav"\r\n`));
    parts.push(encoder.encode(`Content-Type: audio/wav\r\n\r\n`));
    parts.push(sourceAudioBytes);
    parts.push(encoder.encode(`\r\n`));

    // Add model_id part
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="model_id"\r\n\r\n`));
    parts.push(encoder.encode(`eleven_multilingual_sts_v2\r\n`));

    // Add voice_settings part (optional but recommended for consistency)
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="voice_settings"\r\n\r\n`));
    parts.push(
      encoder.encode(`{"stability": 0.5, "similarity_boost": 0.8, "style": 0.5, "use_speaker_boost": true}\r\n`),
    );

    // End boundary
    parts.push(encoder.encode(`--${boundary}--\r\n`));

    // Combine all parts
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.length;
    }

    console.log(`[STS-ElevenLabs] Scene ${sceneIndex + 1} - Calling Speech-to-Speech API with voice: ${targetVoiceId}`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/speech-to-speech/${targetVoiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsApiKey,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: body,
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[STS-ElevenLabs] API error:`, response.status, errText);
      throw new Error(`ElevenLabs STS failed: ${response.status} - ${errText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);
    console.log(`[STS-ElevenLabs] Scene ${sceneIndex + 1} - Transformed audio bytes: ${audioBytes.length}`);

    // Estimate duration (MP3 at 128kbps ≈ 16KB/sec)
    const durationSeconds = Math.max(1, audioBytes.length / 16000);

    const audioPath = isRegeneration
      ? `${userId}/${projectId}/scene-${sceneIndex + 1}-sts-${Date.now()}.mp3`
      : `${userId}/${projectId}/scene-${sceneIndex + 1}-sts.mp3`;
    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload(audioPath, audioBytes, { contentType: "audio/mpeg", upsert: true });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: signedData, error: signError } = await supabase.storage
      .from("audio")
      .createSignedUrl(audioPath, 604800);

    if (signError || !signedData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${signError?.message || "Unknown error"}`);
    }

    console.log(`[STS-ElevenLabs] Scene ${sceneIndex + 1} ✅ Voice transformation SUCCESS`);
    return { url: signedData.signedUrl, durationSeconds, provider: `ElevenLabs STS (Voice Cloned)` };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown ElevenLabs STS error";
    console.error(`[STS-ElevenLabs] Scene ${sceneIndex + 1} error:`, errorMsg);
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

      // Use signed URL for secure access (7 days expiration)
      const { data: signedData, error: signError } = await supabase.storage
        .from("audio")
        .createSignedUrl(audioPath, 604800); // 7 days in seconds

      if (signError || !signedData?.signedUrl) {
        throw new Error(`Failed to create signed URL: ${signError?.message || "Unknown error"}`);
      }
      finalAudioUrl = signedData.signedUrl;
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
// For Haitian Creole + cloned voice: Gemini TTS → ElevenLabs Speech-to-Speech (voice changer)
// For Haitian Creole (standard voice): Gemini TTS only (2 models)
// For custom/cloned voices (non-HC): ElevenLabs directly
// For English/other: Replicate Chatterbox
async function generateSceneAudio(
  scene: Scene,
  sceneIndex: number,
  replicateApiKey: string,
  googleApiKey: string | undefined,
  supabase: any,
  userId: string,
  projectId: string,
  isRegeneration: boolean = false,
  customVoiceId?: string,
  voiceGender: string = "female", // "male" or "female" - used for standard Replicate voices
  forceHaitianCreole: boolean = false, // Force HC routing from presenter_focus language setting
): Promise<{ url: string | null; error?: string; durationSeconds?: number; provider?: string }> {
  const voiceoverText = sanitizeVoiceover(scene.voiceover);
  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
  // HC detection: either from voiceover text OR from presenter_focus language setting
  const isHC = forceHaitianCreole || isHaitianCreole(voiceoverText);

  if (forceHaitianCreole && !isHaitianCreole(voiceoverText)) {
    console.log(
      `[TTS] Scene ${sceneIndex + 1} - Forcing Haitian Creole from presenter_focus (text detection was false)`,
    );
  }

  // ========== CASE 1: Haitian Creole + Cloned Voice ==========
  // Generate with Gemini TTS → Transform with ElevenLabs Speech-to-Speech
  // Fallback: Lovable AI Gateway TTS if direct Gemini fails
  if (isHC && customVoiceId && ELEVENLABS_API_KEY) {
    console.log(`[TTS] Scene ${sceneIndex + 1} - Haitian Creole + Cloned Voice workflow`);
    console.log(`[TTS] Scene ${sceneIndex + 1} - Step 1: Generate base audio with Gemini TTS`);

    const MAX_GEMINI_RETRIES = 5;
    let geminiAudioUrl: string | null = null;

    // Try direct Google API first
    if (googleApiKey) {
      for (let retry = 0; retry < MAX_GEMINI_RETRIES; retry++) {
        if (retry > 0) {
          console.log(`[TTS] Scene ${sceneIndex + 1} - Gemini retry ${retry + 1}/${MAX_GEMINI_RETRIES}`);
          await sleep(2000 * retry);
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

        if (geminiResult.url) {
          geminiAudioUrl = geminiResult.url;
          console.log(`[TTS] Scene ${sceneIndex + 1} - Gemini TTS base audio ready`);
          break;
        }
        console.log(`[TTS] Scene ${sceneIndex + 1} - Gemini attempt ${retry + 1} failed: ${geminiResult.error}`);
      }
    }

    // Fallback to Lovable AI if direct Gemini failed
    if (!geminiAudioUrl) {
      console.log(`[TTS] Scene ${sceneIndex + 1} - Direct Gemini TTS failed, trying Lovable AI Gateway fallback...`);
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY) {
        const lovableResult = await generateSceneAudioLovableAI(
          scene,
          sceneIndex,
          LOVABLE_API_KEY,
          supabase,
          userId,
          projectId,
          isRegeneration,
        );

        if (lovableResult.url) {
          geminiAudioUrl = lovableResult.url;
          console.log(`[TTS] Scene ${sceneIndex + 1} - Lovable AI TTS base audio ready (fallback)`);
        }
      }
    }

    if (!geminiAudioUrl) {
      console.error(
        `[TTS] Scene ${sceneIndex + 1} - Failed to generate base audio for voice transformation (tried Gemini + Lovable AI)`,
      );
      return { url: null, error: "All TTS options failed - cannot proceed with voice transformation" };
    }

    // Step 2: Transform the audio with ElevenLabs Speech-to-Speech
    console.log(`[TTS] Scene ${sceneIndex + 1} - Step 2: Transform voice with ElevenLabs STS`);
    const stsResult = await transformAudioWithElevenLabsSTS(
      geminiAudioUrl,
      customVoiceId,
      sceneIndex,
      ELEVENLABS_API_KEY,
      supabase,
      userId,
      projectId,
      isRegeneration,
    );

    if (stsResult.url) {
      console.log(`✅ Scene ${sceneIndex + 1} SUCCEEDED with: Gemini TTS → ElevenLabs STS (Voice Cloned)`);
      return stsResult;
    }

    console.error(`[TTS] Scene ${sceneIndex + 1} - Voice transformation failed: ${stsResult.error}`);
    return stsResult;
  }

  // ========== CASE 2: Non-HC + Cloned Voice ==========
  // Use ElevenLabs TTS directly (it supports the language natively)
  if (customVoiceId && ELEVENLABS_API_KEY && !isHC) {
    console.log(`[TTS] Scene ${sceneIndex + 1} - Using custom voice via ElevenLabs TTS: ${customVoiceId}`);
    const result = await generateSceneAudioElevenLabs(
      scene,
      sceneIndex,
      ELEVENLABS_API_KEY,
      supabase,
      userId,
      projectId,
      customVoiceId,
      isRegeneration,
    );
    if (result.url) {
      console.log(`✅ Scene ${sceneIndex + 1} SUCCEEDED with: ${result.provider}`);
      return result;
    }
    console.error(`[TTS] Scene ${sceneIndex + 1} - Custom voice failed: ${result.error}`);
    return result;
  }

  // ========== CASE 3: Haitian Creole (Standard Voice) ==========
  // Use Gemini TTS with extended fallback (3 models × 5 retries = up to 15 attempts)
  // Fallback: Lovable AI Gateway as last resort
  if (isHC) {
    console.log(
      `[TTS] Scene ${sceneIndex + 1} - Detected Haitian Creole, using Gemini TTS with extended fallback chain`,
    );

    if (googleApiKey) {
      const MAX_GEMINI_RETRIES = 5; // More retries with text variations

      for (let retry = 0; retry < MAX_GEMINI_RETRIES; retry++) {
        if (retry > 0) {
          console.log(`[TTS] Scene ${sceneIndex + 1} - Gemini retry ${retry + 1}/${MAX_GEMINI_RETRIES}`);
          await sleep(2000 * retry); // Longer backoff
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

        if (geminiResult.url) {
          console.log(`✅ Scene ${sceneIndex + 1} SUCCEEDED with: Gemini TTS`);
          return { ...geminiResult, provider: "Gemini TTS" };
        }
        console.log(`[TTS] Scene ${sceneIndex + 1} - Gemini attempt ${retry + 1} failed: ${geminiResult.error}`);
      }
    } else {
      console.warn(`[TTS] Scene ${sceneIndex + 1} - No Google TTS API key configured`);
    }

    // Fallback: Try Lovable AI Gateway with Gemini TTS
    console.log(`[TTS] Scene ${sceneIndex + 1} - Gemini TTS failed, trying Lovable AI Gateway fallback...`);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      const lovableResult = await generateSceneAudioLovableAI(
        scene,
        sceneIndex,
        LOVABLE_API_KEY,
        supabase,
        userId,
        projectId,
        isRegeneration,
      );

      if (lovableResult.url) {
        console.log(`✅ Scene ${sceneIndex + 1} SUCCEEDED with: Lovable AI Gateway TTS (fallback)`);
        return lovableResult;
      }
      console.log(`[TTS] Scene ${sceneIndex + 1} - Lovable AI fallback also failed: ${lovableResult.error}`);
    }

    // All TTS options failed for Haitian Creole
    console.error(`[TTS] Scene ${sceneIndex + 1} - All Gemini TTS options failed for Haitian Creole`);
    return {
      url: null,
      error: "All Gemini TTS models failed for Haitian Creole (tried 3 models × 5 retries + Lovable AI fallback)",
    };
  }

  // ========== CASE 4: Default (English/other languages) ==========
  // Use Replicate Chatterbox with Chunk & Stitch for long scripts
  const result = await generateSceneAudioReplicateChunked(
    scene,
    sceneIndex,
    replicateApiKey,
    supabase,
    userId,
    projectId,
    isRegeneration,
    voiceGender,
  );
  if (result.url) {
    console.log(`✅ Scene ${sceneIndex + 1} SUCCEEDED with: Replicate Chatterbox (Chunked)`);
    return { ...result, provider: "Replicate Chatterbox" };
  }
  return result;
}

// ============= IMAGE GENERATION WITH NANO BANANA (Pro uses nano-banana-pro at 1K) =============
async function generateImageWithReplicate(
  prompt: string,
  replicateApiKey: string,
  format: string,
  useProModel: boolean = false, // Pro/Enterprise users get nano-banana-pro with 1K resolution
): Promise<
  { ok: true; bytes: Uint8Array } | { ok: false; error: string; status?: number; retryAfterSeconds?: number }
> {
  // Map format to nano-banana supported aspect ratios
  const aspectRatio = format === "portrait" ? "9:16" : format === "square" ? "1:1" : "16:9";

  // Pro users get nano-banana-pro at 1K resolution for higher quality
  const modelPath = useProModel ? "google/nano-banana-pro" : "google/nano-banana";
  const modelName = useProModel ? "Nano Banana Pro (1K)" : "Nano Banana";

  try {
    console.log(`[IMG] Generating image with ${modelName}, format: ${format}, aspect_ratio: ${aspectRatio}`);

    // Build input - nano-banana-pro supports resolution parameter
    const input: Record<string, unknown> = {
      prompt,
      aspect_ratio: aspectRatio,
      output_format: "png",
    };

    // Add resolution for Pro model (1K = 1024px on the long side)
    if (useProModel) {
      input.resolution = "1K";
    }

    const createResponse = await fetch(`https://api.replicate.com/v1/models/${modelPath}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateApiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({ input }),
    });

    if (!createResponse.ok) {
      const status = createResponse.status;
      const retryAfter = createResponse.headers.get("retry-after");
      const errText = await createResponse.text().catch(() => "");
      console.error(`[IMG] ${modelName} create failed: ${status} - ${errText}`);
      return {
        ok: false,
        error: `Replicate ${modelName} failed: ${status}${errText ? ` - ${errText}` : ""}`,
        status,
        retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : undefined,
      };
    }

    let prediction = await createResponse.json();
    console.log(`[IMG] ${modelName} prediction started: ${prediction.id}, status: ${prediction.status}`);

    // Poll for completion if not finished
    while (prediction.status !== "succeeded" && prediction.status !== "failed") {
      await sleep(2000);
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { Authorization: `Bearer ${replicateApiKey}` },
      });
      prediction = await pollResponse.json();
    }

    if (prediction.status === "failed") {
      console.error(`[IMG] ${modelName} prediction failed: ${prediction.error}`);
      return { ok: false, error: prediction.error || "Image generation failed" };
    }

    // Nano Banana returns output as URL string or array of URLs
    const first = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    const imageUrl =
      typeof first === "string"
        ? first
        : first && typeof first === "object" && typeof first.url === "string"
          ? first.url
          : null;

    if (!imageUrl) {
      console.error(
        `[IMG] ${modelName} no image URL in response:`,
        JSON.stringify(prediction.output).substring(0, 200),
      );
      return { ok: false, error: `No image URL returned from ${modelName}` };
    }

    console.log(`[IMG] ${modelName} success, downloading from: ${imageUrl.substring(0, 80)}...`);

    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) return { ok: false, error: "Failed to download image" };

    const bytes = new Uint8Array(await imgResponse.arrayBuffer());
    console.log(`[IMG] ${modelName} image downloaded: ${bytes.length} bytes`);
    return { ok: true, bytes };
  } catch (err) {
    console.error(`[IMG] ${modelName} error:`, err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ============= TRUE IMAGE EDITING WITH NANO BANANA =============
async function editImageWithNanoBanana(
  sourceImageUrl: string,
  editPrompt: string,
  styleDescription: string,
  overlayText?: { title?: string; subtitle?: string },
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { ok: false, error: "LOVABLE_API_KEY not configured" };
  }

  try {
    console.log(`[editImage] Starting image edit with Nano Banana...`);
    console.log(`[editImage] Source URL: ${sourceImageUrl.substring(0, 80)}...`);
    console.log(`[editImage] Edit prompt: ${editPrompt}`);

    // Build the modification prompt with overlay text consideration
    let fullPrompt = `Analyze this image and apply the following modification: ${editPrompt}

IMPORTANT REQUIREMENTS:
- Preserve the overall composition, lighting, and style of the original image
- Apply ONLY the requested modification while keeping everything else intact
- Maintain the same artistic style and color palette`;

    // Add overlay text preservation if present
    if (overlayText?.title || overlayText?.subtitle) {
      fullPrompt += `
      
TEXT OVERLAY TO PRESERVE:
${overlayText.title ? `- Title: "${overlayText.title}"` : ""}
${overlayText.subtitle ? `- Subtitle: "${overlayText.subtitle}"` : ""}
Ensure these text elements remain visible and properly positioned in the modified image.`;
    }

    // Add style context
    if (styleDescription) {
      fullPrompt += `

STYLE CONTEXT: ${styleDescription}`;
    }

    // Call Nano Banana via Lovable AI Gateway for image editing
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: fullPrompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: sourceImageUrl,
                },
              },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const errText = await response.text().catch(() => "");
      console.error(`[editImage] Nano Banana API error: ${status} - ${errText}`);

      if (status === 429) {
        return { ok: false, error: "Rate limit exceeded. Please try again later." };
      }
      if (status === 402) {
        return { ok: false, error: "Payment required. Please add credits to your workspace." };
      }

      return {
        ok: false,
        error: `Nano Banana edit failed: ${status}${errText ? ` - ${errText}` : ""}`,
      };
    }

    const data = await response.json();
    console.log(`[editImage] Nano Banana response received`);

    // Extract the generated image from the response
    const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      console.error(`[editImage] No image in response:`, JSON.stringify(data).substring(0, 500));
      return { ok: false, error: "No image returned from Nano Banana" };
    }

    // Check if it's a base64 data URL
    if (imageData.startsWith("data:image/")) {
      // Extract base64 data after the comma
      const base64Data = imageData.split(",")[1];
      if (!base64Data) {
        return { ok: false, error: "Invalid base64 image data" };
      }

      const bytes = base64Decode(base64Data);
      console.log(`[editImage] Success! Decoded ${bytes.length} bytes from base64`);
      return { ok: true, bytes };
    } else if (imageData.startsWith("http")) {
      // It's a URL, download it
      console.log(`[editImage] Downloading edited image from URL...`);
      const imgResponse = await fetch(imageData);
      if (!imgResponse.ok) {
        return { ok: false, error: "Failed to download edited image" };
      }

      const bytes = new Uint8Array(await imgResponse.arrayBuffer());
      console.log(`[editImage] Success! Downloaded ${bytes.length} bytes`);
      return { ok: true, bytes };
    }

    return { ok: false, error: "Unknown image format in response" };
  } catch (err) {
    console.error(`[editImage] Error:`, err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ============= PHASE HANDLERS =============

// ============= SMART FLOW SCRIPT PHASE (SINGLE SCENE INFOGRAPHIC) =============
async function handleSmartFlowScriptPhase(
  supabase: any,
  user: any,
  content: string,
  format: string,
  style: string,
  brandMark?: string,
  extractionPrompt?: string,
  voiceType?: string,
  voiceId?: string,
  voiceName?: string,
  skipAudio: boolean = false,
): Promise<Response> {
  const phaseStart = Date.now();
  console.log(`[generate-video] Starting SMART FLOW pipeline - text-rich infographic`);

  const styleDescription = getStylePrompt(style, undefined);
  const dimensions = getImageDimensions(format);
  const DEFAULT_DURATION = 15;

  // Smart Flow prompt: Editorial-Style Text-Rich Infographics (NotebookLM style)
  // These work STANDALONE without audio - self-explanatory with headlines + descriptions
  const scriptPrompt = `You are a Top tier Elite Editorial Infographic Designer and Content Creator. You excell in making content that caugth the attention regardless of the topic discussed. You have an in deepth knowledge about visual content and how to reach the target population for the topic discussed. You are highly creative, with a touch of boldness, elegant and wow-factor. Your style is dynamic, detailed with catchy, smart choices of illustration and presentation. You are modern and a lavantgarde when it comes to content presentation. You set the tone, turn head, and keep the eyes on your art generated. 
${CONTENT_COMPLIANCE_INSTRUCTION}
Your goal is to create a modern, detailed SINGLE, MAGAZINE-QUALITY INFOGRAPHIC with rich, self-explanatory text that works as a standalone meaning WITHOUT audio narration.

=== DATA SOURCE ===
${content}

=== EXTRACTION GOAL ===
${extractionPrompt || "Assess the request thoroughly, take the time to understand what exactly it is requested of you. Extract the main key insights that fit the topic, analyze the best way to present the topic based on targeted population, identified key points and visual elements that should be included in the visual content, come up with the full design concept/idea and present the topic based on the requested task in an educational, visually rich format."}

=== VISUAL STYLE ===
- Art Style: ${styleDescription}
- Format: ${format} (${dimensions.width}x${dimensions.height})
- BRANDING: ${brandMark ? `Include the text "${brandMark}" as a small footer.` : "None"}

=== REFERENCE: NOTEBOOKLM INFOGRAPHIC STYLE ===
Study this structure used by professional infographics:
- **Main Headline**: Bold, catchy title at top DIRECTLY BASED ON THE USER'S EXTRACTION GOAL
- **Central Visual**: A character, object, or symbol as the focal anchor
- **2-4 Content Sections** each containing:
  - Section Title: Bold label for the insight
  - Subtitle/Label: Short context or category
  - Description: 2-3 sentence explanation paragraph
  - Supporting Icons: Small illustrations around the text
- **Optional Stats/Metrics**: Numbers with labels (e.g., "2x Growth", "Top 5%")
- **Thematic Border Icons**: Small floating elements around edges (gears, lightbulbs, coins, etc.)

CRITICAL: BASE YOUR OUTPUT ENTIRELY ON THE USER'S "EXTRACTION GOAL" ABOVE.
- If they ask for "top 3 combinations", show exactly the TOP 3 combinations from the data.
- If they ask for "key insights about X", focus ONLY on X.
- Do NOT invent your own topic - STRICTLY follow the user's extraction request.

=== YOUR TASK ===
1. **Analyze**: Identify 2-4 KEY INSIGHTS that tell a complete story.

2. **Script (Optional Narration)**: Write a 180-word narration script. This is secondary to the visual - the infographic must be self-explanatory without it.

3. **Design the Text-Rich Visual**:
   - The image generator CAN render paragraphs of text. EXPLOIT THIS CAPABILITY FULLY.
   - **DO NOT** limit yourself to short labels.
   - Each section should have:
     * A bold TITLE (2-4 words)
     * A DESCRIPTION paragraph (15-25 words explaining the concept)
     * Optional: A stat, metric, or key takeaway

4. **Write the Image Prompt**:
   - Start with: "You are an expert marketing and content creator, you know your targeted population and know how to catch their attention. So, Be extremely creative and using your expert marketing skills to create a catchy, detailed, elegant yet captivating editorial infographic illustration using elements, images and typography that suit best the topic presented."
   - **SPECIFY ALL TEXT VERBATIM** using the format: 'text "YOUR EXACT TEXT HERE"'
   - **BE EXPLICIT** about paragraph text, not just titles
   
   Example format for a section:
   'Section 1: Bold title text "THE POWER BROKER" with subtitle text "+ 8 of Diamonds". Below it, description paragraph text "Add Executive energy to command respect, negotiate from strength, and turn your craft into a high-value enterprise." with a briefcase icon to the left.'
   
   - **SPECIFY LAYOUT**: "Magazine editorial layout...", "Multi-panel composition with central focus...", "Grid of content blocks..."
   - **SPECIFY ICONS**: Describe thematic icons around each section (handshake, crown, coins, lightbulb, etc.)
   - **DO NOT describe the art style** - the style will be appended automatically. NEVER mention style names like "stick figure", "anime", etc. in your descriptions.

=== OUTPUT FORMAT (STRICT JSON) ===
Return ONLY valid JSON:
{
  "title": "Catchy, engaging headline",
  "scenes": [{
    "number": 1,
    "voiceover": "Optional narration script - but the visual is the star here...",
    "visualPrompt": "You are an expert marketing and content creator, you know your targeted population and know how to catch their attention. So, Be extremely creative and using your expert marketing skills to create a catchy, detailed, elegant yet captivating editorial infographic illustration using elements, images and typography that suit best the topic presented. LAYOUT: [Magazine/Panel layout]. MAIN TITLE: Bold text '[YOUR TITLE]' at top center. CENTRAL VISUAL: [Describe the anchor image - a character, object, or symbol]. SECTION 1: Title text '[TITLE 1]' with subtitle '[SUBTITLE]' and description paragraph text '[Full 15-25 word explanation]'. Accompanied by [icon description]. SECTION 2: Title text '[TITLE 2]' with description paragraph text '[explanation]'. [Continue for all sections]. FLOATING ICONS: [List thematic icons around edges]. COLOR PALETTE: [Specify colors matching content theme].",
    "duration": ${DEFAULT_DURATION}
  }]
}

IMPORTANT: Do NOT include any style description in visualPrompt - the system will append the full art style specification automatically.

=== CRITICAL REQUIREMENTS ===
- ONLY produce 1 scene (single infographic)
- The infographic MUST be SELF-EXPLANATORY without audio
- Include 2-4 content sections, each with TITLE + DESCRIPTION PARAGRAPH
- Text can be 15-25 words per description - the generator handles this well
- Include supporting icons and visual elements around text
- Create magazine-editorial quality that looks professional
- Focus on CONTENT and LAYOUT only - do NOT write style descriptions`;

  // Call LLM for script generation via OpenRouter (primary) with Lovable AI fallback
  console.log("Phase: SMART FLOW SCRIPT - Generating via OpenRouter with google/gemini-3-pro-preview...");

  const llmResult = await callLLMWithFallback(scriptPrompt, {
    temperature: 0.7,
    maxTokens: 4000,
    model: "google/gemini-3-pro-preview",
  });

  // Log API call
  const scriptCost = Math.max(llmResult.tokensUsed * PRICING.scriptPerToken, PRICING.scriptPerCall);
  await logApiCall({
    supabase,
    userId: user.id,
    provider: llmResult.provider,
    model: "google/gemini-3-pro-preview",
    status: "success",
    totalDurationMs: llmResult.durationMs,
    cost: scriptCost,
  });
  console.log(
    `[API_LOG] ${llmResult.provider} Smart Flow script: ${llmResult.tokensUsed} tokens, $${scriptCost.toFixed(4)} cost`,
  );

  const scriptContent = llmResult.content;
  const tokensUsed = llmResult.tokensUsed;

  // Parse the script
  let parsedScript: {
    title: string;
    scenes: Array<{ number: number; voiceover: string; visualPrompt: string; duration: number }>;
  };
  try {
    // Strip markdown code blocks if present
    let cleanedContent = scriptContent.trim();
    if (cleanedContent.startsWith("```")) {
      cleanedContent = cleanedContent
        .replace(/^```[a-z]*\n?/i, "")
        .replace(/\n?```$/i, "")
        .trim();
    }
    // Extract JSON between first { and last }
    const firstBrace = cleanedContent.indexOf("{");
    const lastBrace = cleanedContent.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleanedContent = cleanedContent.slice(firstBrace, lastBrace + 1);
    }
    parsedScript = JSON.parse(cleanedContent);
  } catch (parseError) {
    console.error("[generate-video] Smart Flow script parsing failed:", parseError);
    throw new Error("Failed to parse Smart Flow script - invalid JSON response");
  }

  // Force exactly 1 scene
  if (!parsedScript.scenes || parsedScript.scenes.length === 0) {
    throw new Error("Smart Flow script must contain at least 1 scene");
  }
  parsedScript.scenes = [parsedScript.scenes[0]]; // Take only first scene
  parsedScript.scenes[0].number = 1;
  parsedScript.scenes[0].duration = parsedScript.scenes[0].duration || 15;

  // CRITICAL: Append the full STYLE_PROMPTS specification to the visualPrompt
  // This ensures consistent style application without AI reinterpretation
  const currentVisualPrompt = parsedScript.scenes[0].visualPrompt || "";
  parsedScript.scenes[0].visualPrompt = `${currentVisualPrompt}\n\nART STYLE: ${styleDescription}`;

  // Total images = 1 (single infographic)
  const totalImages = 1;

  // Create project with smartflow type
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: parsedScript.title || "Smart Flow Infographic",
      content,
      format,
      length: "short",
      style,
      brand_mark: brandMark || null,
      presenter_focus: extractionPrompt || null,
      project_type: "smartflow",
      voice_type: voiceType || "standard",
      voice_id: voiceId || null,
      voice_name: voiceName || null,
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
          statusMessage: skipAudio
            ? "Script complete. Ready for image generation (no audio)."
            : "Script complete. Ready for audio/image generation.",
          totalImages,
          completedImages: 0,
          sceneIndex: idx,
          costTracking,
          phaseTimings: { script: phaseTime },
          skipAudio, // Store skipAudio flag for images phase
          projectType: "smartflow",
        },
      })),
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (genError) throw new Error("Failed to create generation");

  console.log(`[generate-video] SMART FLOW script complete in ${phaseTime}ms - 1 scene, 1 image planned`);

  return new Response(
    JSON.stringify({
      success: true,
      phase: "script",
      projectId: project.id,
      generationId: generation.id,
      title: parsedScript.title,
      sceneCount: 1,
      totalImages: 1,
      progress: 10,
      costTracking,
      phaseTime,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function handleScriptPhase(
  supabase: any,
  user: any,
  content: string,
  format: string,
  length: string,
  style: string,
  customStyle?: string,
  brandMark?: string,
  presenterFocus?: string,
  characterDescription?: string,
  disableExpressions?: boolean,
  voiceType?: string,
  voiceId?: string,
  voiceName?: string,
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

  // Build optional guidance sections
  const presenterGuidance = presenterFocus
    ? `
=== PRESENTER GUIDANCE ===
${presenterFocus}
`
    : "";

  const characterGuidance = characterDescription
    ? `
=== CHARACTER APPEARANCE ===
All human characters in visual prompts MUST match this description:
${characterDescription}
Include these character details in EVERY visualPrompt that features people.
`
    : "";

  const scriptPrompt = `You are a DYNAMIC video script writer creating engaging, narrative-driven content.
${CONTENT_COMPLIANCE_INSTRUCTION}
=== LANGUAGE REQUIREMENT (CRITICAL) ===
ALWAYS generate ALL content (voiceovers, titles, subtitles) in ENGLISH, regardless of the input language.
The ONLY exception: If the user EXPLICITLY requests Haitian Creole (Kreyòl Ayisyen), then generate in Haitian Creole.
If the input content is in another language (French, Spanish, Portuguese, etc.), TRANSLATE it to English for the output.
We do NOT support other languages at this time.

=== CONTENT ANALYSIS (CRITICAL - DO THIS FIRST) ===
Before writing the script, carefully analyze the content to identify:
1. KEY CHARACTERS: Who are the people/entities mentioned?
2. GENDER: Determine gender from context (names, pronouns, roles, topics)
   - Names like "Leo", "John", "Mike" → male
   - Names like "Sarah", "Maria", "Emma" → female
   - Topics like "motherhood", "pregnancy" → female protagonist
   - Topics like "fatherhood", "brotherhood" → male protagonist
3. ROLES & RELATIONSHIPS: Who does what?
4. VISUAL CONSISTENCY: The SAME character must look IDENTICAL across ALL scenes
5. TEMPORAL CONTEXT: Childhood → show AS A CHILD, Adult → show AS ADULT, etc.
   - The SAME person at different ages must share key visual traits (eye color, facial structure, ethnicity) but reflect the correct AGE
6. HISTORICAL/CULTURAL CONTEXT: Match clothing, hairstyles, technology to time period

Content: ${content}
${presenterGuidance}${characterGuidance}

=== VISUAL STYLE & ART DIRECTION ===
All image prompts must adhere to this style:
- ART STYLE: ${styleDescription}
- ASPECT RATIO: ${format} (${dimensions.width}x${dimensions.height})
- QUALITY: Ultra-detailed, 8K resolution, dramatic lighting
- CAMERA WORK: Use varied angles (Close-up, Wide shot, Low angle, Over-shoulder) to keep the video dynamic

=== TIMING REQUIREMENTS ===
- Target duration: ${config.targetDuration} seconds
- Create exactly ${sceneCount} scenes
- MAXIMUM 25 seconds per scene - MINIMUM 3 seconds per scene (to avoid glitchy flashes)
- Each voiceover: ~${targetWords} words

=== NARRATIVE ARC ===
1. HOOK (Scenes 1-2): Create intrigue (High energy, fast cuts)
2. CONFLICT (Early-middle): Show tension
3. CHOICE (Middle): Fork in the road
4. SOLUTION (Later): Show method/progress
5. FORMULA (Final): Summary visual

=== VOICEOVER STYLE ===
- ENERGETIC, conversational tone
- Start each scene with a hook
- NO labels, NO stage directions, NO markdown
- Just raw spoken text
${
  disableExpressions
    ? `- Do NOT include any paralinguistic tags or expressions like [chuckle], [sigh], [laugh], etc.
- Write clean, natural speech without bracketed expressions`
    : `- Include paralinguistic tags where appropriate for natural expression: [clear throat], [sigh], [sush], [cough], [groan], [sniff], [gasp], [chuckle], [laugh]
- Example: "Oh, that's interesting! [chuckle] Let me explain why..."`
}

=== SUB-VISUALS (REQUIRED FOR DYNAMIC PACING) ===
- EVERY scene MUST include 2-3 subVisuals (additional visual moments)
- subVisuals create variety and dynamic visual pacing within each scene
- Each subVisual should show a different angle, moment, or detail of the scene
- These create smooth transitions and keep viewers engaged

${
  includeTextOverlay
    ? `=== TEXT OVERLAY ===
- Provide title (2-5 words) and subtitle for each scene`
    : ""
}

=== CHARACTER BIBLE (REQUIRED) ===
You MUST create a "characters" object defining EVERY person/entity in the video.
This ensures visual CONSISTENCY - the same person looks identical across all scenes.

For each character specify using "CharacterName_age" format if showing same person at different ages:
- GENDER (male/female) - MUST match the content context
- AGE: The SPECIFIC age for this version of the character
- Ethnicity/skin tone if mentioned or implied
- Hair (color, style, length)
- Body type
- Clothing (period-appropriate, age-appropriate, culture-appropriate)
- Distinguishing features that remain CONSTANT across ages (eye color, facial structure, birthmarks)
- Distinguishing features that CHANGE with age (wrinkles, hair color/loss)

Example:
"Protagonist_child": "A 7-year-old Argentine boy with dark hair, brown eyes, small and thin build, wearing modest 1990s clothing, playful expression"
"Protagonist_adult": "A 35-year-old man with the SAME dark hair and brown eyes, athletic build, wearing Inter Miami jersey, determined expression"

=== PROMPT ENGINEERING RULES (FOR IMAGE PROMPTS) ===
When generating the 'visualPrompt' for each scene, you MUST:
1. COPY-PASTE the full physical description from the CHARACTER BIBLE into the prompt (do not just use the name)
2. Describe the ACTION clearly (e.g., "running", "sitting", "celebrating")
3. Define the SETTING (background, lighting, weather, environment)
4. Include CAMERA ANGLE (close-up, wide shot, low angle, etc.)
5. NO TEXT in images unless specifically requested
6. **DO NOT** describe the art style, visual style, or aesthetic in your visualPrompt - the system will automatically append the exact user-selected style. Only focus on CONTENT (who, what, where, action, camera). NEVER mention style names like "stick figure", "anime", "realistic", etc. in your descriptions - just describe the subject as "a person", "a man", "a woman", etc.

=== OUTPUT FORMAT ===
Return ONLY valid JSON (no markdown, no \`\`\`json blocks):
{
  "title": "Video Title",
  "characters": {
    "Protagonist_child": "A 7-year-old boy with dark hair, brown eyes...",
    "Protagonist_adult": "A 35-year-old man with the SAME dark hair and brown eyes..."
  },
  "scenes": [
    {
      "number": 1,
      "narrativeBeat": "hook",
      "voiceover": "Script text here...",
      "visualPrompt": "Full prompt including CHARACTER BIBLE description + action + setting + camera angle...",
      "subVisuals": ["Second visual moment for variety...", "Third visual moment for dynamic pacing..."],
      "duration": 15${
        includeTextOverlay
          ? `,
      "title": "Headline",
      "subtitle": "Takeaway"`
          : ""
      }
    }
  ]
}`;

  console.log("Phase: DOC2VIDEO SCRIPT - Generating via OpenRouter with google/gemini-3-pro-preview...");

  const llmResult = await callLLMWithFallback(scriptPrompt, {
    temperature: 0.7,
    maxTokens: 8192,
    model: "google/gemini-3-pro-preview",
  });

  // Log API call
  const scriptCost = Math.max(llmResult.tokensUsed * PRICING.scriptPerToken, PRICING.scriptPerCall);
  await logApiCall({
    supabase,
    userId: user.id,
    provider: llmResult.provider,
    model: "google/gemini-3-pro-preview",
    status: "success",
    totalDurationMs: llmResult.durationMs,
    cost: scriptCost,
  });
  console.log(
    `[API_LOG] ${llmResult.provider} Doc2Video script: ${llmResult.tokensUsed} tokens, $${scriptCost.toFixed(4)} cost`,
  );

  const scriptContent = llmResult.content;
  const tokensUsed = llmResult.tokensUsed;

  if (!scriptContent) throw new Error("No script content received");

  let parsedScript: ScriptResponse;
  try {
    const jsonMatch = scriptContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    parsedScript = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Failed to parse script");
  }

  // Sanitize voiceovers and append style to visualPrompts for visibility
  parsedScript.scenes = parsedScript.scenes.map((s) => ({
    ...s,
    voiceover: sanitizeVoiceover(s.voiceover),
    visualPrompt: `${s.visualPrompt || ""}\n\nSTYLE: ${styleDescription}`,
    subVisuals: s.subVisuals?.map((sv: string) => `${sv}\n\nSTYLE: ${styleDescription}`) || [],
  }));

  // Calculate total images needed (2-3 images per scene for dynamic visuals)
  let totalImages = 0;
  for (const scene of parsedScript.scenes) {
    totalImages += 1; // Primary
    if (scene.subVisuals && scene.subVisuals.length > 0) {
      // Generate up to 2 sub-visuals for variety (total 3 images per scene max)
      const maxSub = Math.min(scene.subVisuals.length, 2);
      totalImages += maxSub;
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
      brand_mark: brandMark || null,
      presenter_focus: presenterFocus || null,
      character_description: characterDescription || null,
      voice_type: voiceType || "standard",
      voice_id: voiceId || null,
      voice_name: voiceName || null,
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
          characterBible: parsedScript.characters || null, // Store character bible for image generation
        },
      })),
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (genError) throw new Error("Failed to create generation");

  // Log generation started event
  await logSystemEvent({
    supabase,
    userId: user.id,
    eventType: "generation_started",
    category: "user_activity",
    message: `User started a new Doc2Video generation: "${parsedScript.title}"`,
    details: {
      projectType: "doc2video",
      sceneCount: parsedScript.scenes.length,
      format,
      length,
      style,
    },
    generationId: generation.id,
    projectId: project.id,
  });

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

// ============= STORYTELLING SCRIPT PHASE =============
async function handleStorytellingScriptPhase(
  supabase: any,
  user: any,
  content: string,
  format: string,
  length: string,
  style: string,
  customStyle?: string,
  brandMark?: string,
  inspirationStyle?: string,
  storyTone?: string,
  storyGenre?: string,
  disableExpressions?: boolean,
  brandName?: string,
  characterDescription?: string,
  voiceType?: string,
  voiceId?: string,
  voiceName?: string,
  characterConsistencyEnabled?: boolean, // Pro feature: Hypereal character reference generation
): Promise<Response> {
  const phaseStart = Date.now();

  // Map storytelling lengths to scene counts
  const lengthConfig: Record<string, { count: number; targetDuration: number; avgSceneDuration: number }> = {
    short: { count: 4, targetDuration: 90, avgSceneDuration: 22 }, // <3 min
    brief: { count: 8, targetDuration: 210, avgSceneDuration: 26 }, // <7 min
    extended: { count: 16, targetDuration: 480, avgSceneDuration: 30 }, // <15 min
    presentation: { count: 16, targetDuration: 480, avgSceneDuration: 30 }, // alias
  };
  const config = lengthConfig[length] || lengthConfig.brief;
  const sceneCount = config.count;
  const targetWords = Math.floor(config.avgSceneDuration * 2.5);

  const styleDescription = getStylePrompt(style, customStyle);
  const includeTextOverlay = TEXT_OVERLAY_STYLES.includes(style.toLowerCase());
  const dimensions = getImageDimensions(format);

  // Build inspiration guidance
  const inspirationGuide: Record<string, string> = {
    "aaron-sorkin":
      "Write with sharp, rapid-fire dialogue. Use walk-and-talk energy, overlapping ideas, and intellectual sparring. Build momentum through rhythm and wit.",
    "quentin-tarantino":
      "Bold, unconventional narrative structure. Pop culture references, memorable monologues, and unexpected tonal shifts. Make every scene electric.",
    "nora-ephron":
      "Warm, romantic wit with observational humor. Relatable inner monologue, cozy settings, and heartfelt emotional beats.",
    "david-mamet":
      "Terse, rhythmic dialogue with staccato pacing. Subtext over text. Characters speak in fragments, interruptions, and loaded silences.",
    "agatha-christie":
      "Mystery and suspense with careful misdirection. Plant clues subtly, build tension, and deliver satisfying reveals.",
    "neil-gaiman":
      "Mythical storytelling blending the mundane with the magical. Lyrical prose, archetypal characters, and a sense of wonder.",
    "maya-angelou":
      "Poetic, uplifting prose with dignity and grace. Personal yet universal themes. The rhythm of spoken word.",
    "ernest-hemingway":
      "Sparse, powerful minimalism. Short sentences. Strong verbs. Let the emotion live in what's unsaid.",
  };

  const toneGuide: Record<string, string> = {
    casual: "Conversational and relaxed. Like talking to a friend over coffee.",
    professional: "Polished and authoritative. Clear, confident, and credible.",
    dramatic: "Heightened emotion and stakes. Build tension and release.",
    humorous: "Light, witty, with well-timed comedic beats. Don't force jokes—let humor emerge naturally.",
    inspirational: "Uplifting and motivating. Appeal to hopes and aspirations.",
    suspenseful: "Edge-of-seat tension. Strategic reveals and cliffhangers.",
    educational: "Clear explanations with engaging examples. Make complex ideas accessible.",
  };

  const genreGuide: Record<string, string> = {
    documentary: "Factual narrative with human interest. Blend information with emotional storytelling.",
    fiction: "Character-driven narrative with plot arcs. Create a world the audience can inhabit.",
    educational: "Structured learning with engaging delivery. Examples, analogies, and clear takeaways.",
    marketing: "Persuasive narrative focused on value and transformation. End with clear call-to-action.",
    "personal-story": "Intimate, first-person narrative. Vulnerability, authenticity, and universal themes.",
    "news-report": "Objective journalism style. Who, what, when, where, why. Credible and timely.",
  };

  const inspirationSection =
    inspirationStyle && inspirationStyle !== "none" && inspirationGuide[inspirationStyle]
      ? `\n=== WRITING INSPIRATION: ${inspirationStyle.toUpperCase().replace(/-/g, " ")} ===\n${inspirationGuide[inspirationStyle]}`
      : "";

  const toneSection =
    storyTone && toneGuide[storyTone] ? `\n=== TONE: ${storyTone.toUpperCase()} ===\n${toneGuide[storyTone]}` : "";

  const genreSection =
    storyGenre && genreGuide[storyGenre]
      ? `\n=== GENRE: ${storyGenre.toUpperCase().replace(/-/g, " ")} ===\n${genreGuide[storyGenre]}`
      : "";

  const characterGuidance = characterDescription
    ? `\n=== CHARACTER APPEARANCE ===\nAll human characters in visual prompts MUST match this description:\n${characterDescription}\nInclude these character details in EVERY visualPrompt that features people.`
    : "";

  const brandSection = brandName
    ? `\n=== BRAND ATTRIBUTION ===\nSubtly weave "${brandName}" into the narrative as the source or presenter of this story.`
    : "";

  const scriptPrompt = `You are a MASTER STORYTELLER creating an immersive visual narrative.
${CONTENT_COMPLIANCE_INSTRUCTION}
=== LANGUAGE REQUIREMENT (CRITICAL) ===
ALWAYS generate ALL content (voiceovers, titles, subtitles) in ENGLISH, regardless of the input language.
The ONLY exception: If the user EXPLICITLY requests Haitian Creole (Kreyòl Ayisyen), then generate in Haitian Creole.
If the input content is in another language (French, Spanish, Portuguese, etc.), TRANSLATE it to English for the output.
We do NOT support other languages at this time.

=== CONTENT ANALYSIS (CRITICAL - DO THIS FIRST) ===
Before writing the story, carefully analyze the story idea to identify:
1. KEY CHARACTERS: Who are the people/creatures/entities in this story?
2. GENDER: Determine gender from context (names, pronouns, roles, topics)
3. ROLES & RELATIONSHIPS: Who is the protagonist? Antagonist? Supporting characters?
4. VISUAL CONSISTENCY: The SAME character must look IDENTICAL across ALL scenes
5. TEMPORAL CONTEXT: Childhood → show AS A CHILD, Adult → show AS ADULT, etc.
   - The SAME person at different ages must share key visual traits (eye color, facial structure, ethnicity) but reflect the correct AGE
6. HISTORICAL/CULTURAL CONTEXT: Match clothing, hairstyles, technology, environments to time period and culture

=== STORY IDEA ===
${content}
${inspirationSection}${toneSection}${genreSection}${characterGuidance}${brandSection}

=== VISUAL STYLE & ART DIRECTION ===
All image prompts must adhere to this style:
- ART STYLE: ${styleDescription}
- ASPECT RATIO: ${format} (${dimensions.width}x${dimensions.height})
- QUALITY: Cinematic, ultra-detailed, 8K resolution, dramatic lighting
- CAMERA WORK: Use varied angles (Close-up, Wide shot, Low angle, Over-shoulder) to keep the video dynamic

=== TIMING REQUIREMENTS ===
- Target duration: ${config.targetDuration} seconds
- Create exactly ${sceneCount} scenes
- MAXIMUM 40 seconds per scene - MINIMUM 3 seconds per scene
- Each voiceover: ~${targetWords} words for natural narration pacing

=== NARRATIVE STRUCTURE ===
1. OPENING (Scene 1): Hook the audience immediately. Start in media res or with a provocative question.
2. RISING ACTION (Scenes 2-${Math.floor(sceneCount * 0.4)}): Build the world, introduce conflict or stakes.
3. CLIMAX (Scenes ${Math.floor(sceneCount * 0.4) + 1}-${Math.floor(sceneCount * 0.7)}): Peak tension, key revelation, or turning point.
4. FALLING ACTION (Scenes ${Math.floor(sceneCount * 0.7) + 1}-${sceneCount - 1}): Consequences unfold, resolution begins.
5. CONCLUSION (Scene ${sceneCount}): Satisfying ending with emotional resonance.

=== VOICEOVER STYLE ===
- Write CONTINUOUS narration—this is a story, not a presentation
- IMMERSIVE storytelling voice (not instructional)
- Show, don't tell—use sensory details and vivid imagery
- Vary sentence rhythm for musicality
- NO labels, NO stage directions, NO markdown
- **PRESERVE THE USER'S EXACT TERMINOLOGY**: If the user refers to a character as "Queen of Clubs", use "Queen of Clubs" throughout the story - do NOT replace names/titles with pronouns like "she" or "they". The user chose specific names/titles for a reason. Use pronouns sparingly and only after establishing the character name in the same scene.
${
  disableExpressions
    ? `- Do NOT include any paralinguistic tags or expressions like [chuckle], [sigh], etc.
- Write clean, flowing prose without bracketed expressions`
    : `- Include paralinguistic tags sparingly for emotional emphasis: [sigh], [chuckle], [gasp], [laugh]
- Use them only at key emotional moments, not every scene`
}

=== SUB-VISUALS (REQUIRED FOR DYNAMIC PACING) ===
- EVERY scene MUST include 2-3 subVisuals (additional visual moments)
- subVisuals create variety and dynamic visual pacing within each scene
- Each subVisual should show a different angle, moment, or detail of the scene
- These create smooth transitions and keep viewers engaged

${
  includeTextOverlay
    ? `=== TEXT OVERLAY ===
- Provide title (2-5 words) and subtitle for each scene
- Titles should be evocative, not explanatory`
    : ""
}

=== CHARACTER BIBLE (REQUIRED) ===
You MUST create a "characters" object defining EVERY character's EXACT visual appearance.
This ensures visual CONSISTENCY - the same person looks identical across all scenes.

For each character specify using "CharacterName_age" format if showing same person at different ages:
- GENDER (male/female) - inferred from story context, names, pronouns
- Species/type (human, dragon, unicorn, robot, etc.)
- AGE: The SPECIFIC age for this version of the character
- Physical appearance (color, build, features appropriate for age)
- Distinguishing features that remain CONSTANT (eye color, facial structure, scales color for creatures)
- Distinguishing features that CHANGE with age (size, wrinkles, body proportions)
- Clothing/accessories (period-appropriate, age-appropriate, consistent within time period)

Example:
"Hero_child": "A 7-year-old human boy with bright blue eyes, messy brown hair, freckles, wearing patched medieval peasant clothes, curious expression"
"Hero_adult": "A 30-year-old man with the SAME bright blue eyes and brown hair, now with slight stubble, wearing knight's armor, determined expression"

=== PROMPT ENGINEERING RULES (FOR IMAGE PROMPTS) ===
When generating the 'visualPrompt' for each scene, you MUST:
1. COPY-PASTE the full physical description from the CHARACTER BIBLE into the prompt (do not just use the name)
2. Describe the ACTION clearly (e.g., "running", "sitting", "celebrating")
3. Define the SETTING (background, lighting, weather, environment)
4. Include CAMERA ANGLE (close-up, wide shot, low angle, over-shoulder, etc.)
5. NO TEXT in images unless specifically requested
6. **DO NOT** describe the art style, visual style, or aesthetic in your visualPrompt - the system will automatically append the exact user-selected style. Only focus on CONTENT (who, what, where, action, camera). NEVER mention style names like "stick figure", "anime", "realistic", etc. in your descriptions - just describe the subject as "a person", "a man", "a woman", etc.

=== OUTPUT FORMAT ===
Return ONLY valid JSON (no markdown, no \`\`\`json blocks):
{
  "title": "Story Title",
  "characters": {
    "Dragon": "A majestic MALE crimson dragon with golden-flecked scales, amber eyes...",
    "Hero_child": "A 7-year-old human boy with bright blue eyes, messy brown hair...",
    "Hero_adult": "A 30-year-old man with the SAME bright blue eyes and brown hair..."
  },
  "scenes": [
    {
      "number": 1,
      "narrativeBeat": "opening",
      "voiceover": "Flowing narrative text...",
      "visualPrompt": "Full prompt including CHARACTER BIBLE description + action + setting + camera angle...",
      "subVisuals": ["Second visual moment for variety...", "Third visual moment for dynamic pacing..."],
      "duration": 20${
        includeTextOverlay
          ? `,
      "title": "Evocative Headline",
      "subtitle": "Emotional subtext"`
          : ""
      }
    }
  ]
}`;

  console.log("Phase: STORYTELLING SCRIPT - Generating via OpenRouter with google/gemini-3-pro-preview...");

  const llmResult = await callLLMWithFallback(scriptPrompt, {
    temperature: 0.8, // Slightly higher for creative storytelling
    maxTokens: 12000, // More tokens for longer narratives
    model: "google/gemini-3-pro-preview",
  });

  // Log API call
  const scriptCost = Math.max(llmResult.tokensUsed * PRICING.scriptPerToken, PRICING.scriptPerCall);
  await logApiCall({
    supabase,
    userId: user.id,
    provider: llmResult.provider,
    model: "google/gemini-3-pro-preview",
    status: "success",
    totalDurationMs: llmResult.durationMs,
    cost: scriptCost,
  });
  console.log(
    `[API_LOG] ${llmResult.provider} Storytelling script: ${llmResult.tokensUsed} tokens, $${scriptCost.toFixed(4)} cost`,
  );

  const scriptContent = llmResult.content;
  const tokensUsed = llmResult.tokensUsed;

  if (!scriptContent) throw new Error("No script content received");

  let parsedScript: ScriptResponse;
  try {
    const jsonMatch = scriptContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    parsedScript = JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    console.error("Script parse error:", parseError, "Raw content:", scriptContent.substring(0, 500));
    throw new Error("Failed to parse script JSON");
  }

  // ============= HYPEREAL CHARACTER REFERENCE GENERATION (Pro/Enterprise only) =============
  let characterReferences: Record<string, string> = {}; // Maps character name to reference image URL

  if (characterConsistencyEnabled && parsedScript.characters && Object.keys(parsedScript.characters).length > 0) {
    const hyperealApiKey = Deno.env.get("HYPEREAL_API_KEY");

    if (hyperealApiKey) {
      console.log(
        `[HYPEREAL] Character Consistency enabled - generating ${Object.keys(parsedScript.characters).length} character references with nano-banana-pro-t2i`,
      );

      // Generate reference images for each character in parallel (max 4 at a time)
      const characterEntries = Object.entries(parsedScript.characters);
      const BATCH_SIZE = 4;

      for (let i = 0; i < characterEntries.length; i += BATCH_SIZE) {
        const batch = characterEntries.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async ([charName, charDescription]) => {
          const result = await generateCharacterReferenceWithHypereal(
            charName,
            charDescription as string,
            hyperealApiKey,
            supabase,
            user.id,
            "temp-project", // We'll update this after project creation
          );
          return { charName, result };
        });

        const batchResults = await Promise.all(batchPromises);

        for (const { charName, result } of batchResults) {
          if (result.url) {
            characterReferences[charName] = result.url;
            console.log(`[HYPEREAL] Generated reference for ${charName}`);
          } else {
            console.warn(`[HYPEREAL] Failed to generate reference for ${charName}: ${result.error}`);
          }
        }
      }

      console.log(
        `[HYPEREAL] Successfully generated ${Object.keys(characterReferences).length}/${characterEntries.length} character references`,
      );
    } else {
      console.warn("[HYPEREAL] HYPEREAL_API_KEY not configured - skipping character reference generation");
    }
  }

  // Sanitize voiceovers and append style to visualPrompts for visibility
  // Also inject character references into prompts if available
  parsedScript.scenes = parsedScript.scenes.map((s) => {
    let visualPrompt = s.visualPrompt || "";

    // If we have character references, add them to the prompt for conditioning
    if (Object.keys(characterReferences).length > 0) {
      const refSection = Object.entries(characterReferences)
        .map(([name, url]) => `Reference image for "${name}": ${url}`)
        .join("\n");
      visualPrompt = `${visualPrompt}\n\n=== CHARACTER REFERENCES (use for visual consistency) ===\n${refSection}`;
    }

    return {
      ...s,
      voiceover: sanitizeVoiceover(s.voiceover),
      visualPrompt: `${visualPrompt}\n\nSTYLE: ${styleDescription}`,
      subVisuals: s.subVisuals?.map((sv: string) => `${sv}\n\nSTYLE: ${styleDescription}`) || [],
      _characterReferences: characterReferences, // Store for image generation phase
    };
  });

  // Calculate total images needed (3-4 images per scene for dynamic visuals)
  let totalImages = 0;
  for (const scene of parsedScript.scenes) {
    totalImages += 1; // Primary
    if (scene.subVisuals && scene.subVisuals.length > 0) {
      // Generate up to 2 sub-visuals for variety (total 3 images per scene max)
      const maxSub = Math.min(scene.subVisuals.length, 2);
      totalImages += maxSub;
    }
  }

  // Create project with storytelling metadata and voice settings
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: parsedScript.title || "Untitled Story",
      content,
      format,
      length,
      style,
      brand_mark: brandMark || null,
      character_description: characterDescription || null,
      character_consistency_enabled: characterConsistencyEnabled || false,
      project_type: "storytelling",
      inspiration_style: inspirationStyle || null,
      story_tone: storyTone || null,
      story_genre: storyGenre || null,
      voice_inclination: disableExpressions ? "disabled" : null,
      voice_type: voiceType || "standard",
      voice_id: voiceId || null,
      voice_name: voiceName || null,
      status: "generating",
    })
    .select()
    .single();

  if (projectError) {
    console.error("Project creation error:", projectError);
    throw new Error("Failed to create project");
  }

  // Store character references in project_characters table (for Pro/Enterprise users)
  if (Object.keys(characterReferences).length > 0 && parsedScript.characters) {
    console.log(
      `[HYPEREAL] Storing ${Object.keys(characterReferences).length} character references in project_characters table`,
    );

    const characterInserts = Object.entries(characterReferences).map(([charName, refUrl]) => ({
      project_id: project.id,
      user_id: user.id,
      character_name: charName,
      description: (parsedScript.characters as Record<string, string>)[charName] || charName,
      reference_image_url: refUrl,
    }));

    const { error: charError } = await supabase.from("project_characters").insert(characterInserts);

    if (charError) {
      console.warn(`[HYPEREAL] Failed to store character references: ${charError.message}`);
      // Non-fatal - continue with generation
    } else {
      console.log(`[HYPEREAL] Successfully stored character references for project ${project.id}`);
    }
  }

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
          statusMessage: "Story script complete. Ready for audio narration.",
          totalImages,
          completedImages: 0,
          sceneIndex: idx,
          costTracking,
          phaseTimings: { script: phaseTime },
          characterBible: parsedScript.characters || null, // Store character bible for image generation
        },
      })),
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (genError) {
    console.error("Generation creation error:", genError);
    throw new Error("Failed to create generation");
  }

  console.log(
    `Phase: STORYTELLING SCRIPT complete in ${phaseTime}ms - "${parsedScript.title}" with ${parsedScript.scenes.length} scenes, ${totalImages} images planned`,
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

  // Fetch generation with project voice settings
  const { data: generation, error: genFetchError } = await supabase
    .from("generations")
    .select("*, projects!inner(voice_type, voice_id, voice_name)")
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

  // Get voice settings from project
  const voiceType = generation.projects?.voice_type || "standard";
  const customVoiceId = voiceType === "custom" ? generation.projects?.voice_id : undefined;
  const voiceGender = generation.projects?.voice_name || "female"; // "male" or "female" for standard voices
  console.log(`[Audio] Voice settings: type=${voiceType}, voiceId=${customVoiceId || "none"}, gender=${voiceGender}`);

  // Keep any audio already generated (chunked calls)
  const audioUrls: (string | null)[] = scenes.map((s) => (s as any).audioUrl ?? null);
  let totalAudioSeconds = typeof costTracking.audioSeconds === "number" ? costTracking.audioSeconds : 0;

  // Keep each request small to avoid network/gateway timeouts that surface as client-side "Failed to fetch".
  const BATCH_SIZE = 1;
  const batchStart = Math.max(0, startIndex);
  const batchEnd = Math.min(batchStart + BATCH_SIZE, scenes.length);

  const statusMsg = `Generating voiceover... (scenes ${batchStart + 1}-${batchEnd} of ${scenes.length})`;
  const progress = Math.min(39, 10 + Math.floor((batchEnd / scenes.length) * 30));

  console.log(`Phase: AUDIO - Chunk ${batchStart}-${batchEnd - 1} of ${scenes.length}`);

  // Log audio phase start to system_logs
  await logSystemEvent({
    supabase,
    userId: user.id,
    eventType: "audio_phase_started",
    category: "system_info",
    message: `Audio generation started for scenes ${batchStart + 1}-${batchEnd}`,
    details: {
      batchStart,
      batchEnd,
      totalScenes: scenes.length,
      voiceType,
      voiceGender,
      hasCustomVoice: !!customVoiceId,
    },
    generationId,
    projectId,
  });

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

  const batchPromises: Promise<{
    index: number;
    result: { url: string | null; durationSeconds?: number; provider?: string };
  }>[] = [];

  for (let i = batchStart; i < batchEnd; i++) {
    // Skip scenes that already have audio
    if (audioUrls[i]) continue;

    batchPromises.push(
      (async () => {
        const startTime = Date.now();
        const result = await generateSceneAudio(
          scenes[i],
          i,
          replicateApiKey,
          googleApiKey,
          supabase,
          user.id,
          projectId,
          false,
          customVoiceId,
          voiceGender,
        );
        const durationMs = Date.now() - startTime;

        // Log each scene's audio result
        await logSystemEvent({
          supabase,
          userId: user.id,
          eventType: result.url ? "audio_scene_success" : "audio_scene_failed",
          category: result.url ? "system_info" : "system_error",
          message: result.url
            ? `Scene ${i + 1} audio generated via ${result.provider || "unknown"}`
            : `Scene ${i + 1} audio failed: ${result.error}`,
          details: {
            sceneIndex: i,
            provider: result.provider || "unknown",
            durationMs,
            audioSeconds: result.durationSeconds,
            error: result.error,
          },
          generationId,
          projectId,
        });

        return { index: i, result };
      })(),
    );
  }

  const results = await Promise.all(batchPromises);
  let audioProviderUsed = "replicate";
  let audioModelUsed = "chatterbox-turbo";

  for (const { index, result } of results) {
    audioUrls[index] = result.url;
    const audioDurationMs = result.durationSeconds ? result.durationSeconds * 1000 : 0;

    if (result.durationSeconds) {
      totalAudioSeconds += result.durationSeconds;
      // Update scene duration with actual audio length (0.1s precision, no padding)
      scenes[index].duration = Math.round(result.durationSeconds * 10) / 10;
    }
    // Track which provider was actually used
    let currentProvider: "replicate" | "google_tts" | "elevenlabs" = "replicate";
    let currentModel = "chatterbox-turbo";

    if (result.provider) {
      if (result.provider.toLowerCase().includes("gemini") || result.provider.toLowerCase().includes("google")) {
        audioProviderUsed = "google_tts";
        audioModelUsed = "gemini-tts";
        currentProvider = "google_tts";
        currentModel = "gemini-tts";
      } else if (result.provider.toLowerCase().includes("elevenlabs")) {
        audioProviderUsed = "elevenlabs";
        audioModelUsed = "elevenlabs-sts";
        currentProvider = "elevenlabs";
        currentModel = "elevenlabs-sts";
      } else {
        audioProviderUsed = "replicate";
        audioModelUsed = "chatterbox-turbo";
        currentProvider = "replicate";
        currentModel = "chatterbox-turbo";
      }
    }

    // LOG EACH INDIVIDUAL AUDIO API CALL with accurate per-call cost
    if (result.url) {
      await logApiCall({
        supabase,
        userId: user.id,
        generationId,
        provider: currentProvider,
        model: currentModel,
        status: "success",
        totalDurationMs: Math.round(audioDurationMs),
        cost: PRICING.audioPerCall, // ~$0.01 per audio call
      });
    }
  }

  const successfulAudio = audioUrls.filter(Boolean).length;
  const hasMore = batchEnd < scenes.length;

  // Track cumulative phase time across chunked calls
  const requestTimeMs = Date.now() - requestStart;
  phaseTimings.audio = (typeof phaseTimings.audio === "number" ? phaseTimings.audio : 0) + requestTimeMs;

  costTracking.audioSeconds = totalAudioSeconds;
  costTracking.audioProvider = audioProviderUsed;
  costTracking.audioModel = audioModelUsed;
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
      .eq("id", generationId)
      .eq("user_id", user.id);

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
    .eq("id", generationId)
    .eq("user_id", user.id);

  console.log(
    `Phase: AUDIO complete (chunked) in ${phaseTimings.audio}ms - ${successfulAudio}/${scenes.length} scenes, ${totalAudioSeconds.toFixed(1)}s total`,
  );

  // Log audio phase completion
  await logSystemEvent({
    supabase,
    userId: user.id,
    eventType: "audio_phase_complete",
    category: "system_info",
    message: `Audio generation complete: ${successfulAudio}/${scenes.length} scenes, ${totalAudioSeconds.toFixed(1)}s total`,
    details: {
      successfulScenes: successfulAudio,
      totalScenes: scenes.length,
      totalAudioSeconds,
      audioProvider: audioProviderUsed,
      audioModel: audioModelUsed,
      phaseTimeMs: phaseTimings.audio,
    },
    generationId,
    projectId,
  });

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

// Images phase now processes in chunks to avoid request timeouts.
// IMPORTANT: Smaller chunk size (4) prevents "failed to fetch" timeouts during image generation.
// Pro model (nano-banana-pro 1K) is slower, so we keep chunks small and manageable.
const MAX_IMAGES_PER_CALL_DEFAULT = 4;
const MAX_IMAGES_PER_CALL_HYPEREAL = 4;

async function handleImagesPhase(
  supabase: any,
  user: any,
  generationId: string,
  projectId: string,
  replicateApiKey: string,
  startIndex: number = 0,
): Promise<Response> {
  const phaseStart = Date.now();

  // Fetch generation with project format and character consistency flag
  const { data: generation } = await supabase
    .from("generations")
    .select("*, projects!inner(format, style, brand_mark, character_consistency_enabled, project_type)")
    .eq("id", generationId)
    .eq("user_id", user.id)
    .single();

  if (!generation) throw new Error("Generation not found");

  const projectStyle = generation.projects.style?.toLowerCase() || "";
  
  // Check if this style ALWAYS requires premium model (e.g., Papercut 3D)
  const isPremiumRequiredStyle = PREMIUM_REQUIRED_STYLES.includes(projectStyle);
  
  // Check if user is Pro/Enterprise tier - they get nano-banana-pro at 1K resolution
  const isProUser = await isProOrEnterpriseTier(supabase, user.id);

  // Hypereal nano-banana-pro for Pro/Enterprise users OR premium-required styles
  const hyperealApiKey = Deno.env.get("HYPEREAL_API_KEY");
  const useHypereal = (isProUser || isPremiumRequiredStyle) && !!hyperealApiKey;
  const useProModel = isProUser || isPremiumRequiredStyle; // Pro/Enterprise users OR premium styles get nano-banana-pro at 1K

  const maxImagesPerCall = useHypereal ? MAX_IMAGES_PER_CALL_HYPEREAL : MAX_IMAGES_PER_CALL_DEFAULT;

  if (isPremiumRequiredStyle && !isProUser) {
    console.log(
      `[IMAGES] Style "${projectStyle}" requires premium model - forcing Hypereal/Pro model for non-Pro user (project type: ${generation.projects.project_type})`,
    );
  }
  
  if (useHypereal) {
    console.log(
      `[IMAGES] Using Hypereal nano-banana-pro for ${isPremiumRequiredStyle ? `premium style "${projectStyle}"` : "Pro/Enterprise user"} (project type: ${generation.projects.project_type})`,
    );
  } else if (useProModel) {
    console.log(
      `[IMAGES] Using Replicate nano-banana-pro (1K) for ${isPremiumRequiredStyle ? `premium style "${projectStyle}"` : "Pro/Enterprise user"} (project type: ${generation.projects.project_type})`,
    );
  } else {
    console.log(
      `[IMAGES] Using Replicate nano-banana for non-Pro user (project type: ${generation.projects.project_type})`,
    );
  }

  const scenes = generation.scenes as Scene[];
  const format = generation.projects.format;
  const style = generation.projects.style;
  const brandMark = generation.projects.brand_mark;
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

  // Get character bible for visual consistency (storytelling projects)
  const characterBible = meta.characterBible || {};
  const hasCharacterBible = Object.keys(characterBible).length > 0;

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

  // Format description for aspect ratio clarity
  const formatDescription =
    format === "portrait"
      ? "VERTICAL 9:16 portrait orientation (tall, like a phone screen)"
      : format === "square"
        ? "SQUARE 1:1 aspect ratio (equal width and height)"
        : "HORIZONTAL 16:9 landscape orientation (wide, like a TV screen)";

  const buildImagePrompt = (visualPrompt: string, scene: Scene, subIndex: number): string => {
    let textInstructions = "";
    if (includeTextOverlay && scene.title && subIndex === 0) {
      textInstructions = `
TEXT OVERLAY: Render "${scene.title}" as headline, "${scene.subtitle || ""}" as subtitle.
Text must be LEGIBLE, correctly spelled, and integrated into the composition.`;
    }

    // Brand mark watermark is now added programmatically during video export for consistency
    // This ensures uniform font, size, and opacity across all styles and generations
    const brandMarkInstructions = "";

    // Add character consistency instructions if we have a character bible
    let characterInstructions = "";
    if (hasCharacterBible) {
      const characterDescriptions = Object.entries(characterBible)
        .map(([name, desc]) => `- ${name}: ${desc}`)
        .join("\n");
      characterInstructions = `

CHARACTER CONSISTENCY BIBLE (use EXACT descriptions for any characters that appear):
${characterDescriptions}

CRITICAL CHARACTER RULES:
1. If any of these characters appear in this scene, they MUST match their description EXACTLY
2. PAY ATTENTION TO AGE: If the scene mentions childhood/youth/past, use the corresponding age-specific character (e.g., "Messi_child" not "Messi_adult")
3. TEMPORAL CONTEXT: Match the character's age to the TIME PERIOD being depicted in this specific scene
4. VISUAL CONTINUITY: Characters at different ages must share key traits (eye color, ethnicity, facial structure) but reflect correct age
5. ENVIRONMENTAL CONTEXT: Match clothing, hairstyles, and surroundings to the time period and location described
6. Do NOT show a 35-year-old adult when depicting someone's childhood - show them as an actual child`;
    }

    // Build detailed, elaborate image generation prompt
    return `CREATE A HIGHLY DETAILED, PRECISE, AND ACCURATE ILLUSTRATION:

SCENE DESCRIPTION: ${visualPrompt}

FORMAT REQUIREMENT: ${formatDescription}. The image MUST be composed for this exact aspect ratio.

VISUAL STYLE: ${styleDescription}

GENERATION REQUIREMENTS:
- You have an in-depth knowledge about visual content and how to reach the target population for the topic discussed
- You are highly creative, with a touch of boldness, elegant and wow-factor
- Your style is dynamic, detailed with catchy, smart choices of illustration and presentation
- You are modern and an avant-garde when it comes to content presentation
- You set the tone, turn heads, and keep the eyes on your art generated
- Create a modern, ULTRA DETAILED image with rich textures, accurate lighting, and proper shadows
- Ensure ANATOMICAL ACCURACY for any humans, animals, or creatures depicted
- If depicting real public figures or celebrities, research their actual appearance to generate someone who looks similar or close to them
- Pay attention to CONTEXT and SETTING - assess the content to understand the scene's environment, mood, and location
- Establish and maintain CHARACTER CONSISTENCY - keep physical traits, clothing styles, and appearances coherent throughout
- Establish and maintain ENVIRONMENT CONSISTENCY - backgrounds, lighting, weather, and setting elements must feel cohesive
- Include PRECISE DETAILS: fabric textures, skin details, environmental elements, atmospheric effects
- Ensure COMPOSITIONAL BALANCE appropriate for the ${format} format
- Make the scene feel NATURAL and BELIEVABLE within the chosen style

SUBJECT IDENTIFICATION:
- Identify the main TOPIC and PRIMARY SUBJECT of this scene
- Ensure all IMPORTANT ELEMENTS mentioned in the description are clearly visible
- Maintain visual HIERARCHY - the main subject should be the focal point
${textInstructions}
${brandMarkInstructions}
${characterInstructions}

OUTPUT: Ultra high resolution, professional illustration with dynamic composition, clear visual hierarchy, cinematic quality, bold creativity, and meticulous attention to detail.`;
  };

  // Check if this is a Smart Flow project (single infographic = 1 image only)
  const isSmartFlow = generation.projects.project_type === "smartflow";

  let taskIndex = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];

    // Smart Flow: Only 1 image per scene (single infographic)
    // Other project types: 3 images per scene (1 primary + 2 sub-visuals)
    const IMAGES_PER_SCENE = isSmartFlow ? 1 : 3;

    // Primary image (subIndex 0)
    allImageTasks.push({
      sceneIndex: i,
      subIndex: 0,
      prompt: buildImagePrompt(scene.visualPrompt, scene, 0),
      taskIndex: taskIndex++,
    });

    // Only generate sub-visuals for non-Smart Flow projects
    if (!isSmartFlow) {
      // Generate exactly 2 sub-visuals (subIndex 1 and 2)
      for (let j = 0; j < 2; j++) {
        let subPrompt: string;

        if (scene.subVisuals && scene.subVisuals.length > j && scene.subVisuals[j]) {
          // Use provided sub-visual prompt
          subPrompt = scene.subVisuals[j];
        } else {
          // Synthesize fallback sub-visual from primary prompt with variation
          const basePrompt = scene.visualPrompt || "";
          const variations = [
            "close-up detail shot, different angle, ",
            "wide establishing shot, alternative perspective, ",
          ];
          subPrompt = variations[j] + basePrompt;
        }

        allImageTasks.push({
          sceneIndex: i,
          subIndex: j + 1,
          prompt: buildImagePrompt(subPrompt, scene, j + 1),
          taskIndex: taskIndex++,
        });
      }
    }
  }

  const totalImages = allImageTasks.length;

  // Get tasks for this chunk
  const endIndex = Math.min(startIndex + maxImagesPerCall, totalImages);
  const tasksThisChunk = allImageTasks.slice(startIndex, endIndex);

  console.log(`Phase: IMAGES - Chunk ${startIndex}-${endIndex} of ${totalImages} images...`);

  // Log images phase start to system_logs
  await logSystemEvent({
    supabase,
    userId: user.id,
    eventType: "images_phase_started",
    category: "system_info",
    message: `Image generation started: chunk ${startIndex + 1}-${endIndex} of ${totalImages} total images`,
    details: {
      startIndex,
      endIndex,
      totalImages,
      useHypereal,
      useProModel,
      isProUser,
      primaryProvider: useHypereal ? "hypereal" : "replicate",
      model: useHypereal ? "nano-banana-pro-t2i" : useProModel ? "nano-banana-pro" : "nano-banana",
      format,
      style,
    },
    generationId,
    projectId,
  });

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

  // Track actual providers used across ALL batches in this chunk (for accurate cost logging)
  let totalHyperalSuccess = costTracking.hyperealSuccessCount || 0;
  let totalReplicateFallback = costTracking.replicateFallbackCount || 0;

  // Process this chunk in batches.
  // Use smaller batch size (3) for nano-banana-pro to avoid rate limits
  const BATCH_SIZE = useProModel ? 3 : 5;
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
      // Stagger requests within batch to avoid rate limits (1.5s between each)
      const staggerDelay = (t - batchStart) * 1500;
      batchPromises.push(
        (async () => {
          // Wait for stagger delay before starting this request
          if (staggerDelay > 0) await sleep(staggerDelay);

          let actualProvider = "replicate"; // Track which provider actually succeeded
          let actualModel = useProModel ? "google/nano-banana-pro" : "google/nano-banana";
          const imageCallStart = Date.now();

          for (let attempt = 1; attempt <= 4; attempt++) {
            // Pro/Enterprise users get Hypereal nano-banana-pro, with Replicate as fallback
            let result: { ok: true; bytes: Uint8Array } | { ok: false; error: string; retryAfterSeconds?: number };

            if (useHypereal && hyperealApiKey) {
              console.log(`[IMG] Using Hypereal nano-banana-pro for task ${task.taskIndex}`);

              // LOG HYPEREAL API CALL START for accurate tracking
              const hyperealStartTime = Date.now();
              result = await generateImageWithHypereal(task.prompt, hyperealApiKey, format);
              const hyperealDuration = Date.now() - hyperealStartTime;

              // Fallback to Replicate nano-banana (not pro) if Hypereal fails
              if (!result.ok) {
                const hyperealError = result.error || "Unknown Hypereal error";
                console.log(
                  `[IMG] Hypereal failed (${hyperealError}), falling back to Replicate nano-banana for task ${task.taskIndex}`,
                );

                // LOG HYPEREAL FAILURE to api_call_logs
                await logApiCall({
                  supabase,
                  userId: user.id,
                  generationId,
                  provider: "hypereal",
                  model: "nano-banana-pro-t2i",
                  status: "error",
                  totalDurationMs: hyperealDuration,
                  cost: 0, // No cost on failure
                  errorMessage: hyperealError,
                });

                // LOG TO SYSTEM_LOGS so it shows in admin panel!
                await logSystemEvent({
                  supabase,
                  userId: user.id,
                  eventType: "hypereal_fallback",
                  category: "system_warning",
                  message: `Hypereal API failed, falling back to Replicate nano-banana`,
                  details: {
                    taskIndex: task.taskIndex,
                    sceneIndex: task.sceneIndex,
                    error: hyperealError,
                    durationMs: hyperealDuration,
                    fallbackProvider: "replicate_nano_banana",
                  },
                  generationId,
                  projectId,
                });

                result = await generateImageWithReplicate(task.prompt, replicateApiKey, format, false); // false = use regular nano-banana
                actualProvider = "replicate_fallback";
                actualModel = "google/nano-banana";
              } else {
                actualProvider = "hypereal";
                actualModel = "nano-banana-pro-t2i";
              }
            } else {
              console.log(
                `[IMG] Using Replicate ${useProModel ? "nano-banana-pro (1K)" : "nano-banana"} for task ${task.taskIndex}`,
              );
              result = await generateImageWithReplicate(task.prompt, replicateApiKey, format, useProModel);
              actualProvider = "replicate";
              actualModel = useProModel ? "google/nano-banana-pro" : "google/nano-banana";
            }

            if (result.ok) {
              const imageCallDuration = Date.now() - imageCallStart;
              const suffix = task.subIndex > 0 ? `-${task.subIndex + 1}` : "";
              const path = `${user.id}/${projectId}/scene-${task.sceneIndex + 1}${suffix}.png`;

              const { error: uploadError } = await supabase.storage
                .from("audio")
                .upload(path, result.bytes, { contentType: "image/png", upsert: true });

              if (uploadError) {
                console.error(`[IMG] Upload failed for ${path}: ${uploadError.message}`);
                return { task, url: null, provider: actualProvider, model: actualModel, durationMs: imageCallDuration };
              }

              // Use signed URL for secure access (7 days expiration)
              const { data: signedData, error: signError } = await supabase.storage
                .from("audio")
                .createSignedUrl(path, 604800); // 7 days in seconds

              if (signError || !signedData?.signedUrl) {
                console.error(`[IMG] Failed to create signed URL for ${path}: ${signError?.message}`);
                return { task, url: null, provider: actualProvider, model: actualModel, durationMs: imageCallDuration };
              }

              console.log(
                `[IMG] Task ${task.taskIndex} succeeded with provider: ${actualProvider}, ${imageCallDuration}ms`,
              );
              return {
                task,
                url: signedData.signedUrl,
                provider: actualProvider,
                model: actualModel,
                durationMs: imageCallDuration,
              };
            }

            console.warn(`[IMG] Generation failed (attempt ${attempt}) for task ${task.taskIndex}: ${result.error}`);

            if (attempt < 4) {
              // Use server's retry-after or exponential backoff (3s, 6s, 12s)
              const baseDelay =
                "retryAfterSeconds" in result && result.retryAfterSeconds
                  ? result.retryAfterSeconds * 1000
                  : 3000 * Math.pow(2, attempt - 1);
              await sleep(baseDelay + Math.random() * 2000);
            }
          }
          return { task, url: null, provider: "none", model: "none", durationMs: Date.now() - imageCallStart };
        })(),
      );
    }

    const results = await Promise.all(batchPromises);
    for (const { task, url, provider, model, durationMs } of results) {
      while (sceneImageUrls[task.sceneIndex].length <= task.subIndex) {
        sceneImageUrls[task.sceneIndex].push(null);
      }
      sceneImageUrls[task.sceneIndex][task.subIndex] = url;
      if (url) {
        completedThisChunk++;
        if (provider === "hypereal") totalHyperalSuccess++;
        if (provider === "replicate_fallback" || provider === "replicate") totalReplicateFallback++;

        // LOG EACH INDIVIDUAL IMAGE API CALL with accurate per-image cost
        const perImageCost = provider === "hypereal" ? PRICING.imageHypereal : PRICING.imageNanoBanana;
        const apiProvider = provider === "hypereal" ? "hypereal" : "replicate";
        await logApiCall({
          supabase,
          userId: user.id,
          generationId,
          provider: apiProvider as "replicate" | "hypereal",
          model: model || "google/nano-banana",
          status: "success",
          totalDurationMs: durationMs || 0,
          cost: perImageCost,
        });
      }
    }

    // Log actual provider usage for this batch
    if (totalHyperalSuccess > 0 || totalReplicateFallback > 0) {
      console.log(
        `[IMG] Chunk provider stats so far: Hypereal=${totalHyperalSuccess}, Replicate=${totalReplicateFallback}`,
      );
    }

    if (batchEnd < tasksThisChunk.length) await sleep(1000);
  }

  const newCompletedTotal = completedImagesSoFar + completedThisChunk;
  const hasMore = endIndex < totalImages;

  // If we reached the end and still have 0 images, fail loudly (avoids "successful" runs with no visuals).
  if (!hasMore && newCompletedTotal === 0) {
    // Log the failure
    await logSystemEvent({
      supabase,
      userId: user.id,
      eventType: "images_phase_failed",
      category: "system_error",
      message: "Image generation failed for ALL images - generation aborted",
      details: {
        totalAttempted: totalImages,
        hyperealAttempts: totalHyperalSuccess,
        replicateFallbacks: totalReplicateFallback,
        useHypereal,
        useProModel,
      },
      generationId,
      projectId,
    });

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

  // Update cost tracking with ACTUAL provider used (not just intent)
  costTracking.imagesGenerated = newCompletedTotal;
  costTracking.hyperealSuccessCount = totalHyperalSuccess;
  costTracking.replicateFallbackCount = totalReplicateFallback;

  // Determine actual primary provider based on what succeeded
  // If ANY images used Replicate fallback, mark it as mixed/replicate for accurate billing
  if (totalReplicateFallback > 0 && totalHyperalSuccess === 0) {
    costTracking.imageProvider = "replicate";
    costTracking.imageModel = "google/nano-banana";
  } else if (totalReplicateFallback > 0 && totalHyperalSuccess > 0) {
    costTracking.imageProvider = "mixed"; // Some Hypereal, some Replicate fallback
    costTracking.imageModel = "nano-banana-pro-t2i + google/nano-banana (fallback)";
  } else if (totalHyperalSuccess > 0) {
    costTracking.imageProvider = "hypereal";
    costTracking.imageModel = "nano-banana-pro-t2i";
  } else if (useHypereal) {
    costTracking.imageProvider = "hypereal";
    costTracking.imageModel = "nano-banana-pro-t2i";
  } else {
    costTracking.imageProvider = "replicate";
    costTracking.imageModel = useProModel ? "google/nano-banana-pro" : "google/nano-banana";
  }

  console.log(
    `[IMG] Final provider stats: Hypereal=${totalHyperalSuccess}, Replicate-fallback=${totalReplicateFallback}, Provider=${costTracking.imageProvider}`,
  );

  // Calculate costs based on actual providers used
  const hyperealCost = totalHyperalSuccess * PRICING.imageHypereal;
  const replicateCost = totalReplicateFallback * PRICING.imageNanoBanana;
  costTracking.estimatedCostUsd =
    costTracking.scriptTokens * PRICING.scriptPerToken +
    costTracking.audioSeconds * PRICING.audioPerSecond +
    hyperealCost +
    replicateCost;

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
    .eq("id", generationId)
    .eq("user_id", user.id);

  console.log(
    `Phase: IMAGES chunk complete - ${completedThisChunk} this chunk, ${newCompletedTotal}/${totalImages} total, hasMore: ${hasMore}`,
  );

  // Log images phase completion (or chunk completion)
  if (!hasMore) {
    await logSystemEvent({
      supabase,
      userId: user.id,
      eventType: "images_phase_complete",
      category: "system_info",
      message: `Image generation complete: ${newCompletedTotal}/${totalImages} images`,
      details: {
        imagesGenerated: newCompletedTotal,
        totalImages,
        hyperealSuccessCount: totalHyperalSuccess,
        replicateFallbackCount: totalReplicateFallback,
        imageProvider: costTracking.imageProvider,
        imageModel: costTracking.imageModel,
        phaseTimeMs: phaseTimings.images,
        estimatedCostUsd: costTracking.estimatedCostUsd,
      },
      generationId,
      projectId,
    });
  }

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
    .select("*, projects!inner(title, length, project_type)")
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

  // ============= CREDIT DEDUCTION =============
  // Calculate credits based on length: Short/SmartFlow=1, Brief=2, Presentation=4
  const projectLength = generation.projects.length || "short";
  const projectType = generation.projects.project_type || "doc2video";

  let creditsToDeduct = 1; // Default for short
  if (projectType === "smartflow") {
    creditsToDeduct = 1; // Smart Flow always 1 credit
  } else if (projectLength === "brief") {
    creditsToDeduct = 2;
  } else if (projectLength === "presentation") {
    creditsToDeduct = 4;
  }

  console.log(`[FINALIZE] Deducting ${creditsToDeduct} credit(s) for ${projectType}/${projectLength} video`);

  // Deduct credits from user_credits table
  const { data: currentCredits, error: creditsError } = await supabase
    .from("user_credits")
    .select("credits_balance, total_used")
    .eq("user_id", user.id)
    .single();

  if (creditsError && creditsError.code !== "PGRST116") {
    console.error("[FINALIZE] Error fetching user credits:", creditsError);
  }

  if (currentCredits) {
    const newBalance = Math.max(0, (currentCredits.credits_balance || 0) - creditsToDeduct);
    const newTotalUsed = (currentCredits.total_used || 0) + creditsToDeduct;

    const { error: updateError } = await supabase
      .from("user_credits")
      .update({
        credits_balance: newBalance,
        total_used: newTotalUsed,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[FINALIZE] Error updating credits:", updateError);
    } else {
      console.log(`[FINALIZE] Credits updated: ${currentCredits.credits_balance} -> ${newBalance}`);

      // Record transaction in credit_transactions table
      const { error: txError } = await supabase.from("credit_transactions").insert({
        user_id: user.id,
        amount: -creditsToDeduct,
        transaction_type: "generation",
        description: `Video generation: ${generation.projects.title || "Untitled"} (${projectLength})`,
      });

      if (txError) {
        console.error("[FINALIZE] Error recording credit transaction:", txError);
      }
    }
  } else {
    console.log("[FINALIZE] No user_credits record found, skipping deduction");
  }
  // ============= END CREDIT DEDUCTION =============

  // ============= RECORD GENERATION COSTS =============
  // Calculate cost breakdown by provider based on ACTUAL tracking data
  const scriptCost = costTracking.scriptTokens * PRICING.scriptPerToken; // OpenRouter (script gen)
  const audioCost = costTracking.audioSeconds * PRICING.audioPerSecond; // Replicate/Google TTS

  // Use actual Hypereal/Replicate counts for accurate cost tracking
  const hyperealCount = costTracking.hyperealSuccessCount || 0;
  const replicateCount = costTracking.replicateFallbackCount || 0;
  const hyperealImageCost = hyperealCount * PRICING.imageHypereal;
  const replicateImageCost = replicateCount * PRICING.imageNanoBanana;
  const imageCost = hyperealImageCost + replicateImageCost;

  // Record to generation_costs table for admin analytics
  // Note: total_cost is a generated column (auto-calculated), so we don't insert it
  const { error: costError } = await supabase.from("generation_costs").insert({
    generation_id: generationId,
    user_id: user.id,
    openrouter_cost: scriptCost,
    replicate_cost: replicateImageCost + audioCost, // Replicate handles both fallback images + audio
    hypereal_cost: hyperealImageCost,
    google_tts_cost: 0, // Gemini TTS is separate, track if used
    // total_cost is auto-calculated by the database
  });

  if (costError) {
    console.error("[FINALIZE] Error recording generation costs:", costError);
    console.error("[FINALIZE] Cost error details:", JSON.stringify(costError));
  } else {
    console.log(
      `[FINALIZE] Cost recorded: $${costTracking.estimatedCostUsd.toFixed(4)} (Hypereal: $${hyperealImageCost.toFixed(4)}, Replicate: $${replicateImageCost.toFixed(4)})`,
    );
  }

  // NOTE: Per-image and per-audio API calls are now logged in real-time during generation phases
  // The aggregated summary below is kept for backward compatibility but individual calls are more accurate
  // ============= END RECORD GENERATION COSTS =============

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
    .eq("id", generationId)
    .eq("user_id", user.id);

  await supabase.from("projects").update({ status: "complete" }).eq("id", projectId).eq("user_id", user.id);

  // Log generation completed event with FULL cost breakdown
  await logSystemEvent({
    supabase,
    userId: user.id,
    eventType: "generation_completed",
    category: "user_activity",
    message: `Generation completed: "${generation.projects.title}" - $${costTracking.estimatedCostUsd.toFixed(4)} total`,
    details: {
      projectType: generation.projects.project_type || "doc2video",
      projectTitle: generation.projects.title,
      totalTimeMs: totalTime,
      creditsUsed: creditsToDeduct,
      sceneCount: finalScenes.length,
      // Cost breakdown
      estimatedCostUsd: costTracking.estimatedCostUsd,
      scriptCost,
      audioCost,
      imageCost,
      // Provider details
      audioProvider: costTracking.audioProvider,
      audioModel: costTracking.audioModel,
      audioSeconds: costTracking.audioSeconds,
      imageProvider: costTracking.imageProvider,
      imageModel: costTracking.imageModel,
      imagesGenerated: costTracking.imagesGenerated,
      hyperealSuccessCount: costTracking.hyperealSuccessCount,
      replicateFallbackCount: costTracking.replicateFallbackCount,
      // Phase timings
      phaseTimings,
    },
    generationId,
    projectId,
  });

  console.log(
    `Phase: FINALIZE complete - Total time: ${totalTime}ms, Cost: $${costTracking.estimatedCostUsd.toFixed(4)}, Credits: ${creditsToDeduct}`,
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
      creditsUsed: creditsToDeduct,
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

  // Fetch generation WITH project voice settings AND presenter_focus (for language detection)
  const { data: generation } = await supabase
    .from("generations")
    .select("scenes, projects!inner(voice_type, voice_id, voice_name, presenter_focus)")
    .eq("id", generationId)
    .eq("user_id", user.id)
    .single();

  if (!generation) throw new Error("Generation not found");

  const scenes = generation.scenes as Scene[];
  if (sceneIndex < 0 || sceneIndex >= scenes.length) {
    throw new Error("Invalid scene index");
  }

  // Extract voice settings from project
  const voiceType = generation.projects?.voice_type;
  const voiceId = generation.projects?.voice_id;
  const voiceName = generation.projects?.voice_name;
  const presenterFocus = generation.projects?.presenter_focus;

  // Determine if custom voice should be used
  const customVoiceId = voiceType === "custom" && voiceId ? voiceId : undefined;

  // Determine voice gender for standard voices
  // voiceName stores "male" or "female" for standard voices, or the actual name for custom voices
  // For standard voices, use the stored gender; default to "female" if not set
  const isStandardVoice = voiceType === "standard" || !voiceType;
  const voiceGender =
    isStandardVoice && voiceName && (voiceName === "male" || voiceName === "female") ? voiceName : "female";

  // Detect Haitian Creole from presenter_focus (language setting)
  // Check if presenter_focus contains "Haitian Creole", "Kreyòl", "Creole", etc.
  const presenterFocusLower = (presenterFocus || "").toLowerCase();
  const forceHaitianCreole =
    presenterFocusLower.includes("haitian") ||
    presenterFocusLower.includes("kreyòl") ||
    presenterFocusLower.includes("kreyol") ||
    presenterFocusLower.includes("creole");

  console.log(
    `[regenerate-audio] Scene ${sceneIndex + 1} - Voice settings from project: type=${voiceType}, id=${voiceId}, name=${voiceName}`,
  );
  console.log(
    `[regenerate-audio] Scene ${sceneIndex + 1} - Resolved voice: isStandard=${isStandardVoice}, gender=${voiceGender}, customId=${customVoiceId || "none"}`,
  );
  console.log(
    `[regenerate-audio] Scene ${sceneIndex + 1} - Language: presenterFocus="${presenterFocus || "none"}", forceHaitianCreole=${forceHaitianCreole}`,
  );
  if (customVoiceId) {
    console.log(`[regenerate-audio] Scene ${sceneIndex + 1} - Using custom cloned voice: ${customVoiceId}`);
  } else {
    console.log(
      `[regenerate-audio] Scene ${sceneIndex + 1} - Using standard voice: ${voiceGender === "male" ? "Ethan" : "Marisol"}`,
    );
  }

  // Update the scene with new voiceover
  scenes[sceneIndex].voiceover = newVoiceover;

  // Generate new audio (with isRegeneration=true to create unique filename and bypass cache)
  // IMPORTANT: Pass customVoiceId and forceHaitianCreole to follow the same 4-scenario workflow as main generation:
  // - HC + Cloned Voice: Gemini TTS → ElevenLabs STS
  // - HC + Standard Voice: Gemini TTS only (3 retries)
  // - Non-HC + Cloned Voice: ElevenLabs TTS directly
  // - Non-HC + Standard Voice: Replicate Chatterbox

  const audioResult = await generateSceneAudio(
    scenes[sceneIndex],
    sceneIndex,
    replicateApiKey,
    googleApiKey,
    supabase,
    user.id,
    projectId,
    true, // isRegeneration - creates unique filename to bypass browser cache
    customVoiceId, // Pass custom voice ID for proper routing
    voiceGender, // Pass voice gender for standard Replicate voices (Ethan/Marisol)
    forceHaitianCreole, // Force HC detection from presenter_focus language setting
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
  await supabase.from("generations").update({ scenes }).eq("id", generationId).eq("user_id", user.id);

  console.log(
    `[regenerate-audio] Scene ${sceneIndex + 1} - Audio regenerated successfully with voiceover: "${newVoiceover.substring(0, 50)}..."`,
  );
  if (audioResult.provider) {
    console.log(`[regenerate-audio] Scene ${sceneIndex + 1} - Provider used: ${audioResult.provider}`);
  }

  return new Response(
    JSON.stringify({
      success: true,
      phase: "regenerate-audio",
      sceneIndex,
      audioUrl: audioResult.url,
      duration: scenes[sceneIndex].duration,
      voiceover: scenes[sceneIndex].voiceover, // Return the updated voiceover for confirmation
      provider: audioResult.provider, // Include provider info for debugging
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
  imageIndex?: number, // Optional index for multi-image scenes
): Promise<Response> {
  const targetImageIndex = imageIndex ?? 0;
  console.log(
    `[regenerate-image] Scene ${sceneIndex + 1}, Image ${targetImageIndex + 1} - Starting image regeneration...`,
  );

  // Fetch generation with project format, style, and character_consistency_enabled
  const { data: generation } = await supabase
    .from("generations")
    .select("scenes, projects!inner(format, style, character_consistency_enabled)")
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
  
  const projectStyle = style?.toLowerCase() || "";
  
  // Check if this style ALWAYS requires premium model (e.g., Papercut 3D)
  const isPremiumRequiredStyle = PREMIUM_REQUIRED_STYLES.includes(projectStyle);

  // Check if user is Pro/Enterprise tier - they get Hypereal nano-banana-pro at 2K resolution
  const isProUser = await isProOrEnterpriseTier(supabase, user.id);
  const hyperealApiKey = Deno.env.get("HYPEREAL_API_KEY");
  const useHypereal = (isProUser || isPremiumRequiredStyle) && !!hyperealApiKey;
  const useProModel = isProUser || isPremiumRequiredStyle; // Fallback: Pro/Enterprise users OR premium styles get Replicate nano-banana-pro at 1K

  if (isPremiumRequiredStyle && !isProUser) {
    console.log(
      `[regenerate-image] Style "${projectStyle}" requires premium model - forcing Hypereal/Pro model for non-Pro user`,
    );
  }

  if (useHypereal) {
    console.log(
      `[regenerate-image] ${isPremiumRequiredStyle ? `Premium style "${projectStyle}"` : "Pro/Enterprise user"} - will use Hypereal nano-banana-pro-t2i (2K) with Replicate fallback`,
    );
  } else if (useProModel) {
    console.log(`[regenerate-image] ${isPremiumRequiredStyle ? `Premium style "${projectStyle}"` : "Pro/Enterprise user"} - will use Replicate nano-banana-pro (1K) - no Hypereal key`);
  }

  // Get existing imageUrls or create from single imageUrl
  const existingImageUrls = scene.imageUrls?.length ? [...scene.imageUrls] : scene.imageUrl ? [scene.imageUrl] : [];

  // Determine the source image URL for editing
  const sourceImageUrl = existingImageUrls[targetImageIndex] || scene.imageUrl;

  let imageResult: { ok: true; bytes: Uint8Array } | { ok: false; error: string };

  // Determine the model names based on tier
  const hyperealModel = useProModel ? "nano-banana-pro-t2i" : "nano-banana-t2i";
  const replicateModel = useProModel ? "google/nano-banana-pro" : "google/nano-banana";
  const replicateModelLabel = useProModel ? "nano-banana-pro" : "nano-banana";
  const replicatePricing = useProModel ? PRICING.imageNanoBananaPro : PRICING.imageNanoBanana;

  // Check if we should do a full regeneration (empty imageModification) or edit
  if (!imageModification) {
    // Full regeneration - use the CORRECT prompt for the target image index
    // Image 0 = visualPrompt (primary)
    // Image 1 = subVisuals[0] (first sub-visual)
    // Image 2 = subVisuals[1] (second sub-visual)
    let basePrompt = scene.visualPrompt;
    
    if (targetImageIndex > 0 && scene.subVisuals && scene.subVisuals.length > 0) {
      const subVisualIndex = targetImageIndex - 1; // Image 1 -> subVisuals[0], Image 2 -> subVisuals[1]
      if (scene.subVisuals[subVisualIndex]) {
        basePrompt = scene.subVisuals[subVisualIndex];
        console.log(
          `[regenerate-image] Scene ${sceneIndex + 1}, Image ${targetImageIndex + 1} - Using subVisuals[${subVisualIndex}] prompt`,
        );
      } else {
        // Fallback: synthesize variation from primary prompt
        const variations = [
          "close-up detail shot, different angle, ",
          "wide establishing shot, alternative perspective, ",
        ];
        basePrompt = variations[subVisualIndex] + scene.visualPrompt;
        console.log(
          `[regenerate-image] Scene ${sceneIndex + 1}, Image ${targetImageIndex + 1} - No subVisual[${subVisualIndex}], synthesizing variation`,
        );
      }
    } else {
      console.log(
        `[regenerate-image] Scene ${sceneIndex + 1}, Image ${targetImageIndex + 1} - Using primary visualPrompt`,
      );
    }

    const fullPrompt = `${basePrompt}

STYLE: ${styleDescription}

Professional illustration with dynamic composition and clear visual hierarchy.`;

    // Try Hypereal first for Pro users or premium styles, fallback to Replicate
    if (useHypereal && hyperealApiKey) {
      console.log(`[regenerate-image] Using Hypereal ${hyperealModel} for regeneration (Pro: ${isProUser}, PremiumStyle: ${isPremiumRequiredStyle})`);
      const hyperealStartTime = Date.now();
      imageResult = await generateImageWithHypereal(fullPrompt, hyperealApiKey, format, useProModel);
      const hyperealDurationMs = Date.now() - hyperealStartTime;

      // Log Hypereal API call
      await logApiCall({
        supabase,
        userId: user.id,
        generationId,
        provider: "hypereal",
        model: hyperealModel,
        status: imageResult.ok ? "success" : "error",
        totalDurationMs: hyperealDurationMs,
        cost: imageResult.ok ? PRICING.imageHypereal : 0,
        errorMessage: imageResult.ok ? undefined : imageResult.error || "Unknown error",
      });

      // Fallback to Replicate if Hypereal fails
      if (!imageResult.ok) {
        const hyperealError = imageResult.error || "Unknown Hypereal error";
        console.log(`[regenerate-image] Hypereal failed (${hyperealError}), falling back to Replicate ${replicateModelLabel}`);

        // LOG TO SYSTEM_LOGS so it shows in admin panel!
        await logSystemEvent({
          supabase,
          userId: user.id,
          eventType: "hypereal_fallback",
          category: "system_warning",
          message: `Hypereal API failed during image regeneration, falling back to Replicate ${replicateModelLabel}`,
          details: {
            sceneIndex,
            targetImageIndex,
            error: hyperealError,
            fallbackProvider: `replicate_${replicateModelLabel.replace("-", "_")}`,
            hyperealModel,
            replicateModel,
            isProUser,
            phase: "regenerate-image",
            action: "regenerate_new",
          },
          generationId,
          projectId,
        });

        // Use tiered Replicate model for fallback
        const replicateStartTime = Date.now();
        imageResult = await generateImageWithReplicate(fullPrompt, replicateApiKey, format, useProModel);
        const replicateDurationMs = Date.now() - replicateStartTime;

        // Log Replicate fallback API call
        await logApiCall({
          supabase,
          userId: user.id,
          generationId,
          provider: "replicate",
          model: replicateModel,
          status: imageResult.ok ? "success" : "error",
          totalDurationMs: replicateDurationMs,
          cost: imageResult.ok ? replicatePricing : 0,
          errorMessage: imageResult.ok ? undefined : imageResult.error || "Unknown error",
        });
      }
    } else {
      // No Hypereal key - use Replicate directly with tiered model
      console.log(`[regenerate-image] Using Replicate ${replicateModelLabel} for regeneration (no Hypereal key, Pro: ${isProUser})`);
      const replicateStartTime = Date.now();
      imageResult = await generateImageWithReplicate(fullPrompt, replicateApiKey, format, useProModel);
      const replicateDurationMs = Date.now() - replicateStartTime;

      // Log Replicate API call
      await logApiCall({
        supabase,
        userId: user.id,
        generationId,
        provider: "replicate",
        model: replicateModel,
        status: imageResult.ok ? "success" : "error",
        totalDurationMs: replicateDurationMs,
        cost: imageResult.ok ? replicatePricing : 0,
        errorMessage: imageResult.ok ? undefined : imageResult.error || "Unknown error",
      });
    }
  } else {
    // Apply Edit - use TRUE IMAGE EDITING with Nano Banana (Gemini)
    // This preserves the original image and only modifies the requested section/element
    console.log(
      `[regenerate-image] Scene ${sceneIndex + 1}, Image ${targetImageIndex + 1} - TRUE IMAGE EDIT with Nano Banana`,
    );

    if (!sourceImageUrl) {
      throw new Error("No source image available for editing");
    }

    // Use the existing editImageWithNanoBanana function for true image editing
    const editStartTime = Date.now();
    imageResult = await editImageWithNanoBanana(
      sourceImageUrl,
      imageModification,
      styleDescription,
      scene.title || scene.subtitle ? { title: scene.title, subtitle: scene.subtitle } : undefined
    );
    const editDurationMs = Date.now() - editStartTime;

    // Log the Nano Banana edit API call
    await logApiCall({
      supabase,
      userId: user.id,
      generationId,
      provider: "lovable_ai",
      model: "gemini-2.5-flash-image",
      status: imageResult.ok ? "success" : "error",
      totalDurationMs: editDurationMs,
      cost: imageResult.ok ? PRICING.imageNanoBanana : 0, // Use standard Nano Banana pricing
      errorMessage: imageResult.ok ? undefined : imageResult.error || "Unknown error",
    });

    // If Nano Banana edit fails, fall back to Hypereal/Replicate text-to-image as last resort
    if (!imageResult.ok) {
      const editError = imageResult.error || "Unknown edit error";
      console.log(`[regenerate-image] Nano Banana edit failed (${editError}), falling back to text-to-image generation`);

      // LOG TO SYSTEM_LOGS so it shows in admin panel!
      await logSystemEvent({
        supabase,
        userId: user.id,
        eventType: "nano_banana_edit_fallback",
        category: "system_warning",
        message: `Nano Banana image edit failed, falling back to text-to-image generation`,
        details: {
          sceneIndex,
          targetImageIndex,
          error: editError,
          fallbackProvider: useHypereal && hyperealApiKey ? "hypereal" : "replicate",
          phase: "regenerate-image",
          action: "apply_edit",
        },
        generationId,
        projectId,
      });

      // Fallback to text-to-image generation with modified prompt
      const modifiedPrompt = `${scene.visualPrompt}

USER MODIFICATION REQUEST: ${imageModification}

STYLE: ${styleDescription}

Professional illustration with dynamic composition and clear visual hierarchy. Apply the user's modification to enhance the image while maintaining consistency with the original scene concept.`;

      // Try Hypereal first (tiered: Pro uses nano-banana-pro-t2i, Standard uses nano-banana-t2i)
      // Fallback to Replicate with tiered model (Pro uses nano-banana-pro, Standard uses nano-banana)
      if (useHypereal && hyperealApiKey) {
        console.log(`[regenerate-image] Fallback: Using Hypereal ${hyperealModel} (Pro: ${isProUser})`);
        const hyperealStartTime = Date.now();
        imageResult = await generateImageWithHypereal(modifiedPrompt, hyperealApiKey, format, useProModel);
        const hyperealDurationMs = Date.now() - hyperealStartTime;

        // Log Hypereal API call
        await logApiCall({
          supabase,
          userId: user.id,
          generationId,
          provider: "hypereal",
          model: hyperealModel,
          status: imageResult.ok ? "success" : "error",
          totalDurationMs: hyperealDurationMs,
          cost: imageResult.ok ? PRICING.imageHypereal : 0,
          errorMessage: imageResult.ok ? undefined : imageResult.error || "Unknown error",
        });

        // Fallback to Replicate with tiered model if Hypereal fails
        if (!imageResult.ok) {
          const hyperealError = imageResult.error || "Unknown Hypereal error";
          console.log(`[regenerate-image] Hypereal fallback also failed (${hyperealError}), trying Replicate ${replicateModelLabel}`);

          const replicateStartTime = Date.now();
          imageResult = await generateImageWithReplicate(modifiedPrompt, replicateApiKey, format, useProModel);
          const replicateDurationMs = Date.now() - replicateStartTime;

          await logApiCall({
            supabase,
            userId: user.id,
            generationId,
            provider: "replicate",
            model: replicateModel,
            status: imageResult.ok ? "success" : "error",
            totalDurationMs: replicateDurationMs,
            cost: imageResult.ok ? replicatePricing : 0,
            errorMessage: imageResult.ok ? undefined : imageResult.error || "Unknown error",
          });
        }
      } else {
        // No Hypereal key - use Replicate with tiered model directly
        console.log(`[regenerate-image] Fallback: Using Replicate ${replicateModelLabel} (Pro: ${isProUser})`);
        const replicateStartTime = Date.now();
        imageResult = await generateImageWithReplicate(modifiedPrompt, replicateApiKey, format, useProModel);
        const replicateDurationMs = Date.now() - replicateStartTime;

        await logApiCall({
          supabase,
          userId: user.id,
          generationId,
          provider: "replicate",
          model: replicateModel,
          status: imageResult.ok ? "success" : "error",
          totalDurationMs: replicateDurationMs,
          cost: imageResult.ok ? replicatePricing : 0,
          errorMessage: imageResult.ok ? undefined : imageResult.error || "Unknown error",
        });
      }
    }
  }

  if (!imageResult.ok) {
    throw new Error(imageResult.error || "Image regeneration failed");
  }

  // Upload to storage (use "audio" bucket which is already configured for media storage)
  const imagePath = `${user.id}/${projectId}/scene-${sceneIndex + 1}-img-${targetImageIndex + 1}-regenerated-${Date.now()}.png`;
  const { error: uploadError } = await supabase.storage
    .from("audio")
    .upload(imagePath, imageResult.bytes, { contentType: "image/png", upsert: true });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  // Use signed URL for secure access (7 days expiration)
  const { data: signedData, error: signError } = await supabase.storage
    .from("audio")
    .createSignedUrl(imagePath, 604800); // 7 days in seconds

  if (signError || !signedData?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${signError?.message || "Unknown error"}`);
  }
  const signedUrl = signedData.signedUrl;

  // Update the specific image in the imageUrls array
  if (existingImageUrls.length > 0) {
    existingImageUrls[targetImageIndex] = signedUrl;
    scenes[sceneIndex].imageUrls = existingImageUrls;
    // Also update imageUrl if we're editing the first image
    if (targetImageIndex === 0) {
      scenes[sceneIndex].imageUrl = signedUrl;
    }
  } else {
    // Single image scene - replace both
    scenes[sceneIndex].imageUrl = signedUrl;
    scenes[sceneIndex].imageUrls = [signedUrl];
  }

  // Save to database
  await supabase.from("generations").update({ scenes }).eq("id", generationId).eq("user_id", user.id);

  console.log(
    `[regenerate-image] Scene ${sceneIndex + 1}, Image ${targetImageIndex + 1} - Image regenerated successfully`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      phase: "regenerate-image",
      sceneIndex,
      imageIndex: targetImageIndex,
      imageUrl: signedUrl,
      imageUrls: scenes[sceneIndex].imageUrls,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// ============= MAIN HANDLER =============
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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

    // Use anon-key client for auth verification (matches signing-keys behavior)
    const authSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const match = authHeader.match(/Bearer\s+(.+)/i);
    const token = match?.[1]?.trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Invalid authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let user: { id: string; email?: string };

    try {
      const { data, error: claimsError } = await authSupabase.auth.getClaims(token);

      if (claimsError) {
        // Check if it's an expiration error - provide helpful message
        if (claimsError.message?.includes("expired")) {
          return new Response(
            JSON.stringify({
              error: "Session expired. Please refresh the page and try again.",
            }),
            {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        // If auth verification fails due to a transient network/runtime issue,
        // don't mislabel it as "unauthorized".
        const msg = (claimsError.message || "").toLowerCase();
        if (msg.includes("fetch") || msg.includes("network") || msg.includes("connection")) {
          console.error("Auth verification transient failure:", claimsError);
          return new Response(
            JSON.stringify({
              error: "Temporary authentication verification failure. Please retry.",
            }),
            {
              status: 503,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
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
      return new Response(
        JSON.stringify({
          error: "Authentication failed. Please refresh and try again.",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_TTS_API_KEY");
    if (!REPLICATE_API_KEY) {
      return new Response(JSON.stringify({ error: "Replicate not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_TTS_API_KEY = Deno.env.get("GOOGLE_TTS_API_KEY");

    // Parse and validate request body with comprehensive input validation
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: GenerationRequest & { imageStartIndex?: number; audioStartIndex?: number; imageIndex?: number };
    try {
      body = validateGenerationRequest(rawBody) as typeof body;
      // Validate additional numeric fields not in GenerationRequest
      const rawObj = rawBody as Record<string, unknown>;
      body.imageStartIndex = validateNonNegativeInt(rawObj.imageStartIndex, "imageStartIndex") ?? undefined;
      body.audioStartIndex = validateNonNegativeInt(rawObj.audioStartIndex, "audioStartIndex") ?? undefined;
      body.imageIndex = validateNonNegativeInt(rawObj.imageIndex, "imageIndex") ?? undefined;
    } catch (validationError) {
      console.error("[generate-video] Input validation failed:", validationError);
      return new Response(
        JSON.stringify({
          error: validationError instanceof Error ? validationError.message : "Invalid input",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

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
      imageIndex, // Index of specific image within a multi-image scene
    } = body;

    console.log(
      `[generate-video] Phase: ${phase || "script"}, GenerationId: ${generationId || "new"}, User: ${user.id}`,
    );

    // Route to appropriate phase handler
    if (!phase || phase === "script") {
      if (!content || !format || !length || !style) {
        return new Response(JSON.stringify({ error: "Missing required fields for script phase" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ============= CONTENT MODERATION CHECK =============
      const moderationResult = moderateContent(content);
      if (!moderationResult.passed) {
        console.log(`[MODERATION] Content rejected for user ${user.id}: ${moderationResult.reason}`);

        // Flag the user for policy violation (non-blocking)
        await flagUserForViolation(
          supabase,
          user.id,
          "Content policy violation",
          `Attempted to generate content that violated content policy. Auto-detected.`,
        );

        return new Response(
          JSON.stringify({
            error: moderationResult.reason,
            code: "CONTENT_POLICY_VIOLATION",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Check daily generation limit based on plan
      const PLAN_DAILY_LIMITS: Record<string, number> = {
        free: 5,
        starter: 15,
        creator: 50,
        professional: 100,
        enterprise: 999,
      };

      // Get user subscription and credits
      const { data: subscriptionData } = await supabase
        .from("subscriptions")
        .select("plan_name, status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .single();

      const userPlan = subscriptionData?.plan_name || "free";
      const subscriptionStatus = subscriptionData?.status || null;
      const dailyLimit = PLAN_DAILY_LIMITS[userPlan] || PLAN_DAILY_LIMITS.free;

      // Get user credits
      const { data: creditData } = await supabase
        .from("user_credits")
        .select("credits_balance")
        .eq("user_id", user.id)
        .single();

      const creditsBalance = creditData?.credits_balance || 0;

      // Calculate credits required based on project type and length
      const projectType = body.projectType || "doc2video";
      const CREDIT_COSTS: Record<string, number> = {
        short: 1,
        brief: 2,
        presentation: 4,
      };
      const creditsRequired = projectType === "smartflow" ? 1 : CREDIT_COSTS[length] || 1;

      // ============= PLAN RESTRICTION VALIDATION =============

      // Check subscription status - block if past_due or unpaid
      if (subscriptionStatus === "past_due" || subscriptionStatus === "unpaid") {
        console.log(`[generate-video] User ${user.id} subscription is ${subscriptionStatus}, blocking generation`);
        return new Response(
          JSON.stringify({
            error: "Your subscription payment is overdue. Please update your payment method to continue creating.",
            code: "SUBSCRIPTION_PAST_DUE",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Check credits BEFORE starting generation
      if (creditsBalance < creditsRequired) {
        console.log(`[generate-video] User ${user.id} has insufficient credits: ${creditsBalance}/${creditsRequired}`);
        return new Response(
          JSON.stringify({
            error: `Insufficient credits. You need ${creditsRequired} credit(s) but have ${creditsBalance}. Please add credits or upgrade your plan.`,
            code: "INSUFFICIENT_CREDITS",
            creditsRequired,
            creditsBalance,
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Check plan restrictions for length
      const PLAN_ALLOWED_LENGTHS: Record<string, string[]> = {
        free: ["short"],
        starter: ["short", "brief"],
        creator: ["short", "brief", "presentation"],
        professional: ["short", "brief", "presentation"],
        enterprise: ["short", "brief", "presentation"],
      };
      const allowedLengths = PLAN_ALLOWED_LENGTHS[userPlan] || PLAN_ALLOWED_LENGTHS.free;

      if (!allowedLengths.includes(length)) {
        const requiredPlan = length === "presentation" ? "Creator" : "Starter";
        console.log(`[generate-video] User ${user.id} on ${userPlan} cannot use length ${length}`);
        return new Response(
          JSON.stringify({
            error: `${length.charAt(0).toUpperCase() + length.slice(1)} videos are not available on the ${userPlan} plan. Please upgrade to ${requiredPlan} or higher.`,
            code: "PLAN_RESTRICTION",
            requiredPlan: requiredPlan.toLowerCase(),
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Check format restrictions for free plan
      if (userPlan === "free" && format !== "landscape") {
        console.log(`[generate-video] Free user ${user.id} cannot use format ${format}`);
        return new Response(
          JSON.stringify({
            error:
              "Portrait and square formats require a Starter plan or higher. Free users can only create landscape videos.",
            code: "PLAN_RESTRICTION",
            requiredPlan: "starter",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Check infographics restriction for free plan
      if (projectType === "smartflow" && userPlan === "free") {
        console.log(`[generate-video] Free user ${user.id} cannot create infographics`);
        return new Response(
          JSON.stringify({
            error: "Infographics are not available on the Free plan. Please upgrade to Starter or higher.",
            code: "PLAN_RESTRICTION",
            requiredPlan: "starter",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Check brand mark restriction
      if (body.brandMark && (userPlan === "free" || userPlan === "starter")) {
        console.log(`[generate-video] User ${user.id} on ${userPlan} cannot use brand mark`);
        return new Response(
          JSON.stringify({
            error: "Brand mark feature requires Creator plan or higher.",
            code: "PLAN_RESTRICTION",
            requiredPlan: "creator",
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Check daily limit based on plan
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { count: todayGenerations, error: countError } = await supabase
        .from("generations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", todayStart.toISOString());

      if (countError) {
        console.error("[generate-video] Error checking daily limit:", countError);
      } else if ((todayGenerations ?? 0) >= dailyLimit) {
        console.log(`[generate-video] User ${user.id} has reached daily limit: ${todayGenerations}/${dailyLimit}`);
        return new Response(
          JSON.stringify({
            error: `Daily limit reached. You can create ${dailyLimit} videos per day on your ${userPlan} plan. Please try again tomorrow or upgrade for higher limits.`,
            code: "DAILY_LIMIT_REACHED",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      console.log(
        `[generate-video] User ${user.id} (${userPlan}): Credits ${creditsBalance}/${creditsRequired}, Daily ${todayGenerations ?? 0}/${dailyLimit}`,
      );
      // ============= END PLAN RESTRICTION VALIDATION =============

      // Route based on project type
      if (body.projectType === "smartflow") {
        console.log(
          `[generate-video] Routing to SMART FLOW pipeline (single infographic, skipAudio=${body.skipAudio ?? false})`,
        );
        return await handleSmartFlowScriptPhase(
          supabase,
          user,
          content,
          format,
          style,
          body.brandMark,
          body.presenterFocus, // Used as extraction prompt
          body.voiceType,
          body.voiceId,
          body.voiceName,
          body.skipAudio ?? false, // Pass skipAudio flag
        );
      }

      if (body.projectType === "storytelling") {
        console.log(`[generate-video] Routing to STORYTELLING pipeline`);
        return await handleStorytellingScriptPhase(
          supabase,
          user,
          content,
          format,
          length,
          style,
          customStyle,
          body.brandMark,
          body.inspirationStyle,
          body.storyTone,
          body.storyGenre,
          body.disableExpressions,
          body.brandName,
          body.characterDescription,
          body.voiceType,
          body.voiceId,
          body.voiceName,
          body.characterConsistencyEnabled, // Pro feature: Hypereal character refs
        );
      }

      // Default: Doc2Video pipeline
      return await handleScriptPhase(
        supabase,
        user,
        content,
        format,
        length,
        style,
        customStyle,
        body.brandMark,
        body.presenterFocus,
        body.characterDescription,
        body.disableExpressions,
        body.voiceType,
        body.voiceId,
        body.voiceName,
      );
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
        if (typeof sceneIndex !== "number") {
          return new Response(JSON.stringify({ error: "Missing sceneIndex" }), {
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
          imageModification || "", // Empty string means full regeneration from original prompt
          REPLICATE_API_KEY,
          imageIndex, // Pass the specific image index
        );
      default:
        return new Response(JSON.stringify({ error: `Unknown phase: ${phase}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Generation error:", error);

    // Try to log the error to system_logs (best-effort)
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const errorLogSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const errorMessage = error instanceof Error ? error.message : "Generation failed";
        await logSystemEvent({
          supabase: errorLogSupabase,
          eventType: "generation_failed",
          category: "system_error",
          message: `Generation error: ${errorMessage}`,
          details: {
            errorType: error instanceof Error ? error.name : "Unknown",
            stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
          },
        });
      }
    } catch (logError) {
      console.error("Failed to log generation error:", logError);
    }

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Generation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
