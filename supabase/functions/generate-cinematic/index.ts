import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode as base64Decode, encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Phase = "script" | "audio" | "images" | "video" | "finalize" | "image-edit" | "image-regen";

interface CinematicRequest {
  phase?: Phase;

  // Script phase inputs
  content?: string;
  format?: "landscape" | "portrait" | "square";
  length?: string;
  style?: string;
  customStyle?: string;
  brandMark?: string;
  presenterFocus?: string;
  characterDescription?: string;
  disableExpressions?: boolean;
  characterConsistencyEnabled?: boolean;
  voiceType?: "standard" | "custom";
  voiceId?: string;
  voiceName?: string;

  // Subsequent phases inputs
  projectId?: string;
  generationId?: string;
  sceneIndex?: number;
  imageModification?: string;
}

interface Scene {
  number: number;
  voiceover: string;
  visualPrompt: string;
  visualStyle: string;
  duration: number;
  audioUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioPredictionId?: string;
  videoPredictionId?: string;
}

const REPLICATE_MODELS_URL = "https://api.replicate.com/v1/models";
const REPLICATE_PREDICTIONS_URL = "https://api.replicate.com/v1/predictions";

// Use chatterbox-turbo with voice parameter (Marisol/Ethan) like the main pipeline
const CHATTERBOX_TURBO_URL = "https://api.replicate.com/v1/models/resemble-ai/chatterbox-turbo/predictions";
const GROK_VIDEO_MODEL = "xai/grok-imagine-video";

// Nano Banana models for image generation (Replicate)
const NANO_BANANA_MODEL = "google/nano-banana";

// ============= STYLE PROMPTS (from generate-video/index.ts) =============
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ============= HAITIAN CREOLE DETECTION =============
function isHaitianCreole(text: string): boolean {
  const lowerText = text.toLowerCase();
  const creoleIndicators = [
    "mwen", "ou", "li", "nou", "yo", "sa", "ki", "nan", "pou", "ak",
    "pa", "se", "te", "ap", "gen", "fè", "di", "ale", "vin", "bay",
    "konnen", "wè", "pran", "mete", "vle", "kapab", "dwe", "bezwen",
    "tankou", "paske", "men", "lè", "si", "kote", "kouman", "poukisa",
    "anpil", "tout", "chak", "yon", "de", "twa", "kat", "senk",
    "ayiti", "kreyòl", "kreyol", "bondye", "mèsi", "bonjou", "bonswa",
    "kijan", "eske", "kounye", "toujou", "jamè", "anvan", "apre",
    "t ap", "pral", "ta",
  ];

  let matchCount = 0;
  for (const indicator of creoleIndicators) {
    const regex = new RegExp(`\\b${indicator}\\b`, "gi");
    if (regex.test(lowerText)) matchCount++;
  }

  return matchCount >= 3;
}

// ============= PCM TO WAV CONVERSION =============
function pcmToWav(
  pcmData: Uint8Array,
  sampleRate: number = 24000,
  numChannels: number = 1,
  bitsPerSample: number = 16,
): Uint8Array {
  const audioFormat = bitsPerSample === 32 ? 3 : 1;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // RIFF header
  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  view.setUint32(4, totalSize - 8, true);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);

  // fmt subchunk
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);
  view.setUint16(20, audioFormat, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data subchunk
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  view.setUint32(40, dataSize, true);

  const result = new Uint8Array(buffer);
  result.set(pcmData, headerSize);
  return result;
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function sanitizeBearer(authHeader: string) {
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

async function getLatestModelVersion(model: string, replicateToken: string): Promise<string> {
  const response = await fetch(`${REPLICATE_MODELS_URL}/${model}`, {
    headers: { Authorization: `Bearer ${replicateToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Failed to fetch model info:", error);
    throw new Error(`Failed to fetch model info for ${model}`);
  }

  const modelInfo = await response.json();
  const latestVersion = modelInfo.latest_version?.id;
  if (!latestVersion) {
    throw new Error(`No latest version found for model ${model}`);
  }

  console.log(`Model ${model} latest version: ${latestVersion}`);
  return latestVersion;
}

async function createReplicatePrediction(
  version: string,
  input: Record<string, unknown>,
  replicateToken: string,
) {
  // Use the standard predictions endpoint with a version ID
  const response = await fetch(REPLICATE_PREDICTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${replicateToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version, input }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Replicate create prediction error:", errorText);
    // Include status + body so the client/logs show the real validation issue (e.g. missing required fields)
    throw new Error(`Replicate prediction start failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

async function getReplicatePrediction(predictionId: string, replicateToken: string) {
  const response = await fetch(`${REPLICATE_PREDICTIONS_URL}/${predictionId}`, {
    headers: { Authorization: `Bearer ${replicateToken}` },
  });
  if (!response.ok) {
    const error = await response.text();
    console.error("Replicate get prediction error:", error);
    throw new Error("Failed to fetch Replicate prediction status");
  }
  return response.json();
}

// ============================================
// STEP 1: Script Generation with Gemini 3 Preview
// ============================================
// Content compliance instruction (from generate-video)
const CONTENT_COMPLIANCE_INSTRUCTION = `
CONTENT POLICY (MANDATORY):
- Generate only family-friendly, appropriate content
- No explicit violence, gore, or disturbing imagery
- No sexual or adult content
- No hate speech, discrimination, or offensive stereotypes
- No content promoting illegal activities
- Keep all content suitable for general audiences
`;

// Get style prompt from STYLE_PROMPTS dictionary
function getStylePrompt(style: string, customStyle?: string): string {
  const key = style.toLowerCase();
  return STYLE_PROMPTS[key] || customStyle || style;
}

async function generateScriptWithGemini(
  content: string,
  params: Required<Pick<CinematicRequest, "format" | "length" | "style">> &
    Partial<Pick<
      CinematicRequest,
      | "customStyle"
      | "brandMark"
      | "presenterFocus"
      | "characterDescription"
      | "disableExpressions"
      | "characterConsistencyEnabled"
      | "voiceType"
      | "voiceId"
      | "voiceName"
    >>,
  lovableApiKey: string,
): Promise<{ title: string; scenes: Scene[]; characters?: Record<string, string> }> {
  console.log("Step 1: Generating script with Gemini 3 Preview...");

  // Get dimensions based on format
  const dimensions = params.format === "portrait" 
    ? { width: 1080, height: 1920 }
    : params.format === "square" 
      ? { width: 1080, height: 1080 }
      : { width: 1920, height: 1080 };

  // Length configuration - dynamic scene count ranges
  const lengthConfig: Record<string, { minScenes: number; maxScenes: number; targetDuration: number; maxSceneDuration: number }> = {
    short: { minScenes: 5, maxScenes: 8, targetDuration: 90, maxSceneDuration: 10 },
    brief: { minScenes: 6, maxScenes: 10, targetDuration: 150, maxSceneDuration: 10 },
    presentation: { minScenes: 8, maxScenes: 12, targetDuration: 180, maxSceneDuration: 10 },
  };
  const config = lengthConfig[params.length] || lengthConfig.brief;

  const styleDescription = getStylePrompt(params.style, params.customStyle);

  // Build optional guidance sections
  const presenterGuidance = params.presenterFocus
    ? `\n**Presenter/Focus Guidance:** ${params.presenterFocus}`
    : "";

  const characterGuidance = params.characterDescription
    ? `\n**Character Appearance:** All human characters MUST match: ${params.characterDescription}`
    : "";

  const systemPrompt = `You are a world-class Cinematic Director and Screenwriter for AI-to-VIDEO generation.
Your goal is to turn a user's request into a compelling, production-ready video script with detailed visual direction.

${CONTENT_COMPLIANCE_INSTRUCTION}

### PHASE 1: ASSESS & STRATEGIZE (Do this FIRST)
Before writing, analyze the User's Request to determine the best approach:

1. **Core Message:** What is the single most important idea to convey?
2. **Audience:** Who is watching? (investors, social media, students, general public)
3. **Narrative Structure:** Choose the best arc for this content:
   - *Explainer/Problem-Solution:* Hook → Problem → Solution → Proof → CTA
   - *Cinematic Journey:* Atmosphere → Character Intro → Conflict → Resolution
   - *Montage:* Rhythmic sequence of high-impact visuals
   - *Documentary:* Context → Deep Dive → Insight → Conclusion

### PHASE 2: SCENE CREATION
Create a script that flows NATURALLY based on your assessment.

**SCENE COUNT:** Do NOT force a fixed number. Use between ${config.minScenes} and ${config.maxScenes} scenes—whatever is BEST for the story. Let the narrative breathe.

**TARGET DURATION:** ~${config.targetDuration} seconds total (under 3 minutes)
**MAX PER SCENE:** ${config.maxSceneDuration} seconds each

### INPUT CONTEXT
- **Visual Style:** ${styleDescription}
- **Aspect Ratio:** ${params.format} (${dimensions.width}x${dimensions.height})${presenterGuidance}${characterGuidance}

**User's Content:**
${content}

### LANGUAGE REQUIREMENT
ALWAYS generate in ENGLISH unless the user EXPLICITLY requests Haitian Creole (Kreyòl Ayisyen).
If input is in another language, TRANSLATE to English.

### VIDEO-FIRST VISUAL PROMPTS (CRITICAL)
Your visualPrompt must be optimized for AI VIDEO generation, NOT static images. Focus on:

1. **MOTION & DYNAMICS:** Describe movement, action, flow
   - ✓ "Camera slowly pushes in as the protagonist walks forward through fog"
   - ✗ "A person standing in fog"

2. **CAMERA MOVEMENT:** Specify how the camera behaves
   - Tracking shot, Dolly in/out, Crane up, Handheld, Steady glide, Orbit around subject
   - "Low angle drone shot tracking fast across urban rooftops at golden hour"

3. **CINEMATIC LIGHTING:** Be specific about light quality
   - "Cyberpunk neon reflections on wet pavement", "Soft rim light separating subject from background"
   - "Dramatic Rembrandt lighting with deep shadows"

4. **COMPOSITION:** Describe framing and depth
   - "Subject in left third of frame, shallow depth of field blurring city lights behind"
   - "Extreme close-up on eyes, rack focus to hands in foreground"

5. **ATMOSPHERE & MOOD:** Set the emotional tone visually
   - "Tense, claustrophobic framing", "Expansive, hopeful wide shot"

### CHARACTER BIBLE (REQUIRED)
Create a "characters" object defining EVERY person/entity for VISUAL CONSISTENCY across all scenes.

For each character specify:
- GENDER, AGE, Ethnicity/skin tone
- Hair (color, style, length)
- Body type, Clothing (period/age-appropriate)
- Distinguishing features that remain CONSTANT

When writing visualPrompt, COPY the full character description from your bible—don't just reference the name.

### VOICEOVER STYLE
- ENERGETIC, conversational, cinematic tone
- Start each scene with a hook that grabs attention
- NO labels, NO stage directions, NO markdown—just raw spoken text
${params.disableExpressions ? "- Do NOT include paralinguistic tags like [chuckle], [sigh], etc." : "- Include natural expressions where appropriate: [sigh], [chuckle], [gasp], [laugh]"}

### OUTPUT FORMAT
Return ONLY valid JSON (no markdown, no \`\`\`json blocks):
{
  "title": "A Creative, Compelling Title",
  "characters": {
    "Protagonist": "A 32-year-old woman with shoulder-length black hair, warm brown skin, athletic build, wearing a tailored navy blazer..."
  },
  "scenes": [
    {
      "number": 1,
      "voiceover": "Engaging narration that hooks the viewer immediately...",
      "visualPrompt": "Slow dolly push through morning mist. A 32-year-old woman with shoulder-length black hair (from character bible) steps into frame from the right, silhouetted against golden hour sunlight. Camera tracks her movement as she walks purposefully toward camera. Shallow depth of field, lens flare kissing the edge of frame.",
      "visualStyle": "Cinematic establishing shot with atmospheric depth",
      "duration": 8
    }
  ]
}`;
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-pro-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Create a cinematic video script based on this idea:\n\n${content}` },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "create_script",
            description: "Create a cinematic video script with title, characters, and scenes",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "The video title" },
                characters: {
                  type: "object",
                  description: "Character bible with visual descriptions for consistency",
                  additionalProperties: { type: "string" },
                },
                scenes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      number: { type: "number" },
                      voiceover: { type: "string", description: "The narration text" },
                      visualPrompt: { type: "string", description: "Detailed visual description for image generation" },
                      visualStyle: { type: "string", description: "Camera/shot style descriptor" },
                      duration: { type: "number", description: "Duration in seconds (5-20)" },
                    },
                    required: ["number", "voiceover", "visualPrompt", "visualStyle", "duration"],
                  },
                },
              },
              required: ["title", "scenes"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "create_script" } },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Gemini 3 error:", error);
    throw new Error("Failed to generate script with Gemini 3 Preview");
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    const parsed = JSON.parse(toolCall.function.arguments);
    if (!parsed.title || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
      throw new Error("Invalid script structure from Gemini");
    }

    const styleDescription = getStylePrompt(params.style, params.customStyle);

    return {
      title: parsed.title,
      characters: parsed.characters || {},
      scenes: parsed.scenes.map((s: any, idx: number) => ({
        number: s?.number ?? idx + 1,
        voiceover: s?.voiceover ?? "",
        visualPrompt: `${s?.visualPrompt ?? ""}\n\nSTYLE: ${styleDescription}`,
        visualStyle: s?.visualStyle ?? "cinematic",
        duration: typeof s?.duration === "number" ? s.duration : 8,
      })),
    };
  }

  throw new Error("No tool call response from Gemini 3");
}

// ============================================
// STEP 2: Audio Generation with Multiple TTS Providers
// - Haitian Creole: Gemini TTS (Google)
// - Custom Voice: ElevenLabs TTS
// - Standard: Replicate Chatterbox-Turbo
// ============================================

// GEMINI TTS MODELS for Haitian Creole
const GEMINI_TTS_MODELS = [
  { name: "gemini-2.5-pro-preview-tts", label: "2.5 Pro Preview TTS" },
  { name: "gemini-2.5-flash-preview-tts", label: "2.5 Flash Preview TTS" },
];

// Generate audio with Gemini TTS (for Haitian Creole)
async function generateAudioWithGeminiTTS(
  text: string,
  sceneNumber: number,
  googleApiKey: string,
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  let sanitizedText = text.trim();
  if (!sanitizedText || sanitizedText.length < 2) return null;

  // Remove promotional content that might trigger filters
  sanitizedText = sanitizedText.replace(/\b(swiv|follow|like|subscribe|kòmante|comment|pataje|share|abòneman)\b[^.]*\./gi, ".");
  sanitizedText = sanitizedText.replace(/\.+/g, ".").replace(/\s+/g, " ").trim();

  for (const model of GEMINI_TTS_MODELS) {
    for (let retry = 0; retry < 3; retry++) {
      try {
        console.log(`[TTS-Gemini] Scene ${sceneNumber}: Trying ${model.label} (attempt ${retry + 1})`);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent?key=${googleApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `[Speak with natural enthusiasm, warmth and energy like sharing exciting news with a friend] ${sanitizedText}`,
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
          console.error(`[TTS-Gemini] ${model.label} API error: ${response.status} - ${errText}`);
          continue;
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];

        if (candidate?.finishReason === "OTHER") {
          console.warn(`[TTS-Gemini] ${model.label} content filter triggered`);
          continue;
        }

        const inlineData = candidate?.content?.parts?.[0]?.inlineData;
        if (!inlineData?.data) {
          console.warn(`[TTS-Gemini] ${model.label} no audio data in response`);
          continue;
        }

        // Decode base64 PCM and convert to WAV
        const pcmBytes = base64Decode(inlineData.data);
        const wavBytes = pcmToWav(pcmBytes, 24000, 1, 16);

        const fileName = `cinematic-audio-${Date.now()}-${sceneNumber}.wav`;
        const upload = await supabase.storage
          .from("audio-files")
          .upload(fileName, wavBytes, { contentType: "audio/wav", upsert: true });

        if (upload.error) {
          try {
            await supabase.storage.createBucket("audio-files", { public: true });
            await supabase.storage.from("audio-files").upload(fileName, wavBytes, { contentType: "audio/wav", upsert: true });
          } catch {
            throw new Error("Failed to upload audio");
          }
        }

        const { data: urlData } = supabase.storage.from("audio-files").getPublicUrl(fileName);
        console.log(`[TTS-Gemini] Scene ${sceneNumber} SUCCESS with ${model.label}`);
        return urlData.publicUrl;
      } catch (err) {
        console.error(`[TTS-Gemini] Scene ${sceneNumber} ${model.label} attempt ${retry + 1} failed:`, err);
        if (retry < 2) await sleep(2000 * (retry + 1));
      }
    }
  }

  return null;
}

// Generate audio with ElevenLabs TTS (for custom/cloned voices)
async function generateAudioWithElevenLabs(
  text: string,
  sceneNumber: number,
  voiceId: string,
  elevenLabsApiKey: string,
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  const sanitizedText = text.trim();
  if (!sanitizedText || sanitizedText.length < 2) return null;

  try {
    console.log(`[TTS-ElevenLabs] Scene ${sceneNumber}: Using voice ${voiceId}`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: sanitizedText,
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
      console.error(`[TTS-ElevenLabs] API error: ${response.status} - ${errText}`);
      return null;
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);

    const fileName = `cinematic-audio-${Date.now()}-${sceneNumber}.mp3`;
    const upload = await supabase.storage
      .from("audio-files")
      .upload(fileName, audioBytes, { contentType: "audio/mpeg", upsert: true });

    if (upload.error) {
      try {
        await supabase.storage.createBucket("audio-files", { public: true });
        await supabase.storage.from("audio-files").upload(fileName, audioBytes, { contentType: "audio/mpeg", upsert: true });
      } catch {
        throw new Error("Failed to upload audio");
      }
    }

    const { data: urlData } = supabase.storage.from("audio-files").getPublicUrl(fileName);
    console.log(`[TTS-ElevenLabs] Scene ${sceneNumber} SUCCESS`);
    return urlData.publicUrl;
  } catch (err) {
    console.error(`[TTS-ElevenLabs] Scene ${sceneNumber} error:`, err);
    return null;
  }
}

// Unified audio generation function
async function generateSceneAudio(
  scene: Scene,
  replicateToken: string,
  googleApiKey: string | undefined,
  elevenLabsApiKey: string | undefined,
  supabase: ReturnType<typeof createClient>,
  voiceGender: string = "female",
  customVoiceId?: string,
): Promise<{ predictionId?: string; audioUrl?: string }> {
  const voiceoverText = (scene.voiceover || "").trim();
  if (!voiceoverText || voiceoverText.length < 2) {
    return {};
  }

  const isHC = isHaitianCreole(voiceoverText);

  // CASE 1: Haitian Creole + Custom Voice → Gemini TTS → ElevenLabs Speech-to-Speech
  if (isHC && customVoiceId && elevenLabsApiKey && googleApiKey) {
    console.log(`[TTS] Scene ${scene.number}: Haitian Creole + Custom Voice workflow`);
    
    // Step 1: Generate base audio with Gemini
    const geminiAudioUrl = await generateAudioWithGeminiTTS(voiceoverText, scene.number, googleApiKey, supabase);
    if (!geminiAudioUrl) {
      console.error(`[TTS] Scene ${scene.number}: Gemini TTS failed for HC`);
      return {};
    }

    // Step 2: Transform with ElevenLabs Speech-to-Speech
    console.log(`[TTS] Scene ${scene.number}: Transforming with ElevenLabs STS`);
    const sourceResponse = await fetch(geminiAudioUrl);
    if (!sourceResponse.ok) return {};
    
    const sourceAudioBytes = new Uint8Array(await sourceResponse.arrayBuffer());
    const boundary = `----ElevenLabsSTS${Date.now()}`;
    const encoder = new TextEncoder();
    
    const parts: Uint8Array[] = [];
    parts.push(encoder.encode(`--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="audio"; filename="source.wav"\r\n`));
    parts.push(encoder.encode(`Content-Type: audio/wav\r\n\r\n`));
    parts.push(sourceAudioBytes);
    parts.push(encoder.encode(`\r\n--${boundary}\r\n`));
    parts.push(encoder.encode(`Content-Disposition: form-data; name="model_id"\r\n\r\n`));
    parts.push(encoder.encode(`eleven_multilingual_sts_v2\r\n`));
    parts.push(encoder.encode(`--${boundary}--\r\n`));

    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) { body.set(part, offset); offset += part.length; }

    const stsResponse = await fetch(
      `https://api.elevenlabs.io/v1/speech-to-speech/${customVoiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsApiKey,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: body,
      },
    );

    if (!stsResponse.ok) {
      console.error(`[TTS] Scene ${scene.number}: ElevenLabs STS failed`);
      return {};
    }

    const stsAudioBytes = new Uint8Array(await stsResponse.arrayBuffer());
    const fileName = `cinematic-audio-sts-${Date.now()}-${scene.number}.mp3`;
    await supabase.storage.from("audio-files").upload(fileName, stsAudioBytes, { contentType: "audio/mpeg", upsert: true });
    const { data: urlData } = supabase.storage.from("audio-files").getPublicUrl(fileName);
    
    console.log(`[TTS] Scene ${scene.number} SUCCESS: Gemini → ElevenLabs STS`);
    return { audioUrl: urlData.publicUrl };
  }

  // CASE 2: Custom Voice (non-HC) → ElevenLabs TTS directly
  if (customVoiceId && elevenLabsApiKey && !isHC) {
    console.log(`[TTS] Scene ${scene.number}: Custom voice via ElevenLabs TTS`);
    const audioUrl = await generateAudioWithElevenLabs(voiceoverText, scene.number, customVoiceId, elevenLabsApiKey, supabase);
    if (audioUrl) return { audioUrl };
  }

  // CASE 3: Haitian Creole (standard voice) → Gemini TTS
  if (isHC && googleApiKey) {
    console.log(`[TTS] Scene ${scene.number}: Haitian Creole via Gemini TTS`);
    const audioUrl = await generateAudioWithGeminiTTS(voiceoverText, scene.number, googleApiKey, supabase);
    if (audioUrl) return { audioUrl };
    console.error(`[TTS] Scene ${scene.number}: Gemini TTS failed for HC`);
    return {};
  }

  // CASE 4: Standard voice → Replicate Chatterbox
  console.log(`[TTS] Scene ${scene.number}: Standard voice via Replicate Chatterbox`);
  const voiceName = voiceGender === "male" ? "Ethan" : "Marisol";

  const response = await fetch(CHATTERBOX_TURBO_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${replicateToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: {
        text: voiceoverText,
        voice: voiceName,
        temperature: 0.9,
        top_p: 1,
        top_k: 1800,
        repetition_penalty: 2,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[TTS] Chatterbox-Turbo create error: ${errorText}`);
    throw new Error(`Chatterbox-Turbo failed (${response.status})`);
  }

  const prediction = await response.json();
  console.log(`[TTS] Chatterbox-Turbo prediction started: ${prediction.id}`);
  return { predictionId: prediction.id };
}

async function resolveChatterbox(
  predictionId: string,
  replicateToken: string,
  supabase: ReturnType<typeof createClient>,
  sceneNumber: number,
): Promise<string | null> {
  const result = await getReplicatePrediction(predictionId, replicateToken);

  if (result.status !== "succeeded") {
    if (result.status === "failed") {
      console.error("Chatterbox failed:", result.error);
      throw new Error("Chatterbox audio generation failed");
    }
    return null;
  }

  const outputUrl = result.output;
  if (typeof outputUrl !== "string" || !outputUrl) return null;

  // Download and upload to storage for durability
  const audioResponse = await fetch(outputUrl);
  if (!audioResponse.ok) {
    throw new Error("Failed to download generated audio");
  }
  const audioBuffer = await audioResponse.arrayBuffer();

  const fileName = `cinematic-audio-${Date.now()}-${sceneNumber}.wav`;
  const upload = await supabase.storage
    .from("audio-files")
    .upload(fileName, new Uint8Array(audioBuffer), { contentType: "audio/wav", upsert: true });

  if (upload.error) {
    // Try create bucket if missing
    try {
      await supabase.storage.createBucket("audio-files", { public: true });
      const retry = await supabase.storage
        .from("audio-files")
        .upload(fileName, new Uint8Array(audioBuffer), { contentType: "audio/wav", upsert: true });
      if (retry.error) throw retry.error;
    } catch (e) {
      console.error("Audio upload error:", upload.error);
      throw new Error("Failed to upload audio");
    }
  }

  const { data: urlData } = supabase.storage.from("audio-files").getPublicUrl(fileName);
  return urlData.publicUrl;
}

// ============================================
// STEP 3: Image Generation with Replicate Nano Banana
// ============================================
async function generateSceneImage(
  scene: Scene,
  style: string,
  format: "landscape" | "portrait" | "square",
  replicateToken: string,
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  // Map format to aspect ratio
  const aspectRatio = format === "portrait" ? "9:16" : format === "square" ? "1:1" : "16:9";
  
  // Get the full style prompt from STYLE_PROMPTS, fallback to style name if not found
  const styleKey = style.toLowerCase();
  const fullStylePrompt = STYLE_PROMPTS[styleKey] || STYLE_PROMPTS[style] || style;
  
  // Build comprehensive image prompt with STYLE_PROMPTS
  const imagePrompt = `${fullStylePrompt}

SCENE DESCRIPTION: ${scene.visualPrompt}

CAMERA/SHOT STYLE: ${scene.visualStyle}

FORMAT: ${format === "portrait" ? "VERTICAL 9:16 portrait orientation (tall, like a phone screen)" : format === "square" ? "SQUARE 1:1 aspect ratio (equal width and height)" : "HORIZONTAL 16:9 landscape orientation (wide, like a TV screen)"}. The image MUST be composed for this exact aspect ratio.

QUALITY REQUIREMENTS:
- ULTRA DETAILED with rich textures, accurate lighting, and proper shadows
- ANATOMICAL ACCURACY for any humans, animals, or creatures depicted
- Cinematic quality with dramatic lighting
- Ultra high resolution
- Professional illustration with dynamic composition and clear visual hierarchy`;

  console.log(`[IMG] Generating scene ${scene.number} with Replicate nano-banana, format: ${format}, aspect_ratio: ${aspectRatio}`);

  try {
    const createResponse = await fetch(`https://api.replicate.com/v1/models/${NANO_BANANA_MODEL}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateToken}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: {
          prompt: imagePrompt,
          aspect_ratio: aspectRatio,
          output_format: "png",
        },
      }),
    });

    if (!createResponse.ok) {
      const errText = await createResponse.text();
      console.error(`[IMG] Replicate nano-banana create failed: ${createResponse.status} - ${errText}`);
      throw new Error(`Replicate nano-banana failed: ${createResponse.status}`);
    }

    let prediction = await createResponse.json();
    console.log(`[IMG] Nano-banana prediction started: ${prediction.id}, status: ${prediction.status}`);

    // Poll for completion if not finished
    while (prediction.status !== "succeeded" && prediction.status !== "failed") {
      await sleep(2000);
      const pollResponse = await fetch(`${REPLICATE_PREDICTIONS_URL}/${prediction.id}`, {
        headers: { Authorization: `Bearer ${replicateToken}` },
      });
      prediction = await pollResponse.json();
    }

    if (prediction.status === "failed") {
      console.error(`[IMG] Nano-banana prediction failed: ${prediction.error}`);
      throw new Error(prediction.error || "Image generation failed");
    }

    // Get image URL from output
    const first = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    const imageUrl = typeof first === "string" ? first : first?.url || null;

    if (!imageUrl) {
      throw new Error("No image URL returned from Replicate");
    }

    console.log(`[IMG] Nano-banana success, downloading from: ${imageUrl.substring(0, 80)}...`);

    // Download and upload to Supabase storage
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) throw new Error("Failed to download image");

    const imageBuffer = new Uint8Array(await imgResponse.arrayBuffer());
    console.log(`[IMG] Scene ${scene.number} image downloaded: ${imageBuffer.length} bytes`);

    const fileName = `cinematic-scene-${Date.now()}-${scene.number}.png`;
    const upload = await supabase.storage
      .from("scene-images")
      .upload(fileName, imageBuffer, { contentType: "image/png", upsert: true });

    if (upload.error) {
      try {
        await supabase.storage.createBucket("scene-images", { public: true });
        const retry = await supabase.storage
          .from("scene-images")
          .upload(fileName, imageBuffer, { contentType: "image/png", upsert: true });
        if (retry.error) throw retry.error;
      } catch (e) {
        console.error("Image upload error:", upload.error);
        throw new Error("Failed to upload scene image");
      }
    }

    const { data: urlData } = supabase.storage.from("scene-images").getPublicUrl(fileName);
    console.log(`[IMG] Scene ${scene.number} image uploaded: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (err) {
    console.error(`[IMG] Scene ${scene.number} error:`, err);
    throw err;
  }
}

// ============================================
// STEP 4: Video Generation with Replicate Grok (phased)
// ============================================
async function startGrok(scene: Scene, imageUrl: string, format: "landscape" | "portrait" | "square", replicateToken: string) {
  // Fetch latest version dynamically
  const version = await getLatestModelVersion(GROK_VIDEO_MODEL, replicateToken);
  
  const aspectRatio = format === "portrait" ? "9:16" : format === "square" ? "1:1" : "16:9";
  const prediction = await createReplicatePrediction(
    version,
    {
      prompt: scene.visualPrompt,
      image: imageUrl,
      duration: Math.min(scene.duration, 15),
      resolution: "720p",
      aspect_ratio: aspectRatio,
    },
    replicateToken,
  );
  console.log(`Grok prediction started: ${prediction.id}`);
  return prediction.id as string;
}

async function resolveGrok(
  predictionId: string,
  replicateToken: string,
  supabase: ReturnType<typeof createClient>,
  sceneNumber: number,
): Promise<string | null> {
  const result = await getReplicatePrediction(predictionId, replicateToken);

  if (result.status !== "succeeded") {
    if (result.status === "failed") {
      const errorMsg = result.error || "Video generation failed";
      console.error("Grok failed:", errorMsg);
      
      // Surface user-friendly error messages for common issues
      if (errorMsg.includes("flagged as sensitive") || errorMsg.includes("E005")) {
        throw new Error("Content flagged as sensitive. Please try different visual descriptions or a different topic.");
      }
      if (errorMsg.includes("rate limit") || errorMsg.includes("429")) {
        throw new Error("Video API rate limited. Please wait a moment and try again.");
      }
      
      throw new Error(`Video generation failed: ${errorMsg}`);
    }
    return null;
  }

  // Handle different Replicate output formats: string, array, or object
  const output = result.output;
  let videoUrl: string | null = null;

  if (typeof output === "string" && output) {
    videoUrl = output;
  } else if (Array.isArray(output) && output.length > 0) {
    // Handle array output like ["https://...mp4"]
    videoUrl = typeof output[0] === "string" ? output[0] : null;
  } else if (typeof output === "object" && output !== null) {
    // Handle object output like { url: "..." } or { video: "..." }
    const obj = output as Record<string, unknown>;
    videoUrl = (obj.url || obj.video || obj.output) as string | null;
  }

  if (!videoUrl) {
    console.error("[Grok] Succeeded but no video URL found. Output:", JSON.stringify(output));
    throw new Error("Replicate succeeded but returned no video URL");
  }

  // Download the video from Replicate and upload to Supabase storage for persistence
  console.log(`[Grok] Downloading video for scene ${sceneNumber} from Replicate: ${videoUrl}`);
  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download generated video from Replicate: ${videoResponse.status}`);
  }
  const videoBuffer = await videoResponse.arrayBuffer();

  const fileName = `cinematic-video-${Date.now()}-${sceneNumber}.mp4`;
  const upload = await supabase.storage
    .from("scene-videos")
    .upload(fileName, new Uint8Array(videoBuffer), { contentType: "video/mp4", upsert: true });

  if (upload.error) {
    // Try create bucket if missing
    try {
      await supabase.storage.createBucket("scene-videos", { public: true });
      const retry = await supabase.storage
        .from("scene-videos")
        .upload(fileName, new Uint8Array(videoBuffer), { contentType: "video/mp4", upsert: true });
      if (retry.error) throw retry.error;
    } catch (e) {
      console.error("Video upload error:", upload.error);
      throw new Error("Failed to upload video to storage");
    }
  }

  const { data: urlData } = supabase.storage.from("scene-videos").getPublicUrl(fileName);
  console.log(`[Grok] Video uploaded: ${urlData.publicUrl}`);
  return urlData.publicUrl;
}

async function readGenerationOwned(
  supabase: ReturnType<typeof createClient>,
  generationId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("generations")
    .select("id, user_id, project_id, status, progress, scenes")
    .eq("id", generationId)
    .maybeSingle();

  if (error || !data) throw new Error("Generation not found");
  if (data.user_id !== userId) throw new Error("Forbidden");
  return data;
}

async function updateScenes(
  supabase: ReturnType<typeof createClient>,
  generationId: string,
  scenes: Scene[],
  progress?: number,
) {
  await supabase
    .from("generations")
    .update({ scenes, ...(typeof progress === "number" ? { progress } : {}) })
    .eq("id", generationId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return jsonResponse({ error: "Not authenticated" }, { status: 401 });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");

    if (!supabaseUrl || !supabaseKey) throw new Error("Backend configuration missing");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");
    if (!replicateToken) throw new Error("REPLICATE_API_TOKEN not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = sanitizeBearer(authHeader);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return jsonResponse({ error: "Invalid authentication" }, { status: 401 });

    // Verify admin access
    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) {
      return jsonResponse({ error: "Cinematic generation is only available for admins during beta" }, { status: 403 });
    }

    const body: CinematicRequest = await req.json().catch(() => ({}));
    const phase: Phase = body.phase || "script";

    // =============== PHASE 1: SCRIPT ===============
    if (phase === "script") {
      const content = requireString(body.content, "content");
      const format = (body.format || "portrait") as "landscape" | "portrait" | "square";
      const length = requireString(body.length, "length");
      const style = requireString(body.style, "style");

      console.log("=== CINEMATIC SCRIPT START ===");

      const script = await generateScriptWithGemini(
        content,
        {
          format,
          length,
          style,
          customStyle: body.customStyle,
          brandMark: body.brandMark,
          presenterFocus: body.presenterFocus,
          characterDescription: body.characterDescription,
          disableExpressions: body.disableExpressions,
          characterConsistencyEnabled: body.characterConsistencyEnabled,
          voiceType: body.voiceType,
          voiceId: body.voiceId,
          voiceName: body.voiceName,
        },
        lovableApiKey,
      );

      // Create project
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          title: script.title,
          content,
          format,
          length,
          style,
          project_type: "cinematic",
          status: "generating",
        })
        .select("id")
        .single();

      if (projectError || !project) throw new Error("Failed to create project");

      // Create generation
      const { data: generation, error: genError } = await supabase
        .from("generations")
        .insert({
          user_id: user.id,
          project_id: project.id,
          status: "generating",
          progress: 10,
          scenes: script.scenes,
        })
        .select("id")
        .single();

      if (genError || !generation) throw new Error("Failed to create generation record");

      return jsonResponse({
        success: true,
        projectId: project.id,
        generationId: generation.id,
        title: script.title,
        scenes: script.scenes,
        sceneCount: script.scenes.length,
      });
    }

    // All remaining phases require generationId
    const generationId = requireString(body.generationId, "generationId");
    const generation = await readGenerationOwned(supabase, generationId, user.id);

    const scenesRaw = Array.isArray(generation.scenes) ? generation.scenes : [];
    const scenes: Scene[] = scenesRaw.map((s: any, idx: number) => ({
      number: s?.number ?? idx + 1,
      voiceover: s?.voiceover ?? "",
      visualPrompt: s?.visualPrompt ?? "",
      visualStyle: s?.visualStyle ?? "cinematic",
      duration: typeof s?.duration === "number" ? s.duration : 6,
      audioUrl: s?.audioUrl,
      imageUrl: s?.imageUrl,
      videoUrl: s?.videoUrl,
      audioPredictionId: s?.audioPredictionId,
      videoPredictionId: s?.videoPredictionId,
    }));

    const sceneIndex = typeof body.sceneIndex === "number" ? body.sceneIndex : undefined;
    const req = body as CinematicRequest;

    // =============== PHASE 2: AUDIO ===============
    if (phase === "audio") {
      const idx = requireNumber(sceneIndex, "sceneIndex");
      const scene = scenes[idx];
      if (!scene) throw new Error("Scene not found");

      if (scene.audioUrl) {
        return jsonResponse({ success: true, status: "complete", scene });
      }

      // Get voice settings from project
      const { data: project } = await supabase
        .from("projects")
        .select("voice_name, voice_type, voice_id")
        .eq("id", generation.project_id)
        .maybeSingle();
      
      // Map voice_name to gender: "male" or "female" (default female for Marisol)
      const voiceGender = project?.voice_name === "male" ? "male" : "female";
      const customVoiceId = project?.voice_type === "custom" ? project?.voice_id : undefined;
      
      // Get API keys for TTS
      const googleApiKey = Deno.env.get("GOOGLE_TTS_API_KEY");
      const elevenLabsApiKey = Deno.env.get("ELEVENLABS_API_KEY");

      // If we don't have a prediction ID yet, start the audio generation
      if (!scene.audioPredictionId && !scene.audioUrl) {
        const result = await generateSceneAudio(
          scene,
          replicateToken,
          googleApiKey,
          elevenLabsApiKey,
          supabase,
          voiceGender,
          customVoiceId,
        );

        // If we got a direct audioUrl (Gemini/ElevenLabs), we're done
        if (result.audioUrl) {
          scenes[idx] = { ...scene, audioUrl: result.audioUrl };
          await updateScenes(supabase, generationId, scenes);
          return jsonResponse({ success: true, status: "complete", scene: scenes[idx] });
        }

        // If we got a predictionId (Chatterbox), save it and return processing
        if (result.predictionId) {
          scenes[idx] = { ...scene, audioPredictionId: result.predictionId };
          await updateScenes(supabase, generationId, scenes);
          return jsonResponse({ success: true, status: "processing", scene: scenes[idx] });
        }

        // Neither worked - error
        throw new Error("Failed to start audio generation");
      }

      // If we have a prediction ID, try to resolve it (Chatterbox async polling)
      if (scene.audioPredictionId) {
        const audioUrl = await resolveChatterbox(scene.audioPredictionId, replicateToken, supabase, scene.number);
        if (!audioUrl) {
          return jsonResponse({ success: true, status: "processing", scene });
        }

        scenes[idx] = { ...scene, audioUrl };
        await updateScenes(supabase, generationId, scenes);
        return jsonResponse({ success: true, status: "complete", scene: scenes[idx] });
      }

      return jsonResponse({ success: true, status: "processing", scene });
    }

    // =============== PHASE 3: IMAGES ===============
    if (phase === "images") {
      const idx = requireNumber(sceneIndex, "sceneIndex");
      const scene = scenes[idx];
      if (!scene) throw new Error("Scene not found");

      if (scene.imageUrl) return jsonResponse({ success: true, status: "complete", scene });

      // We need style + format from the project record
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, style, format")
        .eq("id", generation.project_id)
        .maybeSingle();

      if (projectError || !project) throw new Error("Project not found");

      const imageUrl = await generateSceneImage(
        scene,
        project.style || "realistic",
        (project.format || "portrait") as "landscape" | "portrait" | "square",
        replicateToken,
        supabase,
      );

      scenes[idx] = { ...scene, imageUrl };
      await updateScenes(supabase, generationId, scenes);

      return jsonResponse({ success: true, status: "complete", scene: scenes[idx] });
    }

    // =============== PHASE 4: VIDEO ===============
    if (phase === "video") {
      const idx = requireNumber(sceneIndex, "sceneIndex");
      const scene = scenes[idx];
      if (!scene) throw new Error("Scene not found");

      if (scene.videoUrl) return jsonResponse({ success: true, status: "complete", scene });
      if (!scene.imageUrl) throw new Error("Scene image is missing (run images phase first)");

      // Read format from project
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, format")
        .eq("id", generation.project_id)
        .maybeSingle();
      if (projectError || !project) throw new Error("Project not found");

      const format = (project.format || "portrait") as "landscape" | "portrait" | "square";

      if (!scene.videoPredictionId) {
        const predictionId = await startGrok(scene, scene.imageUrl, format, replicateToken);
        scenes[idx] = { ...scene, videoPredictionId: predictionId };
        await updateScenes(supabase, generationId, scenes);
        return jsonResponse({ success: true, status: "processing", scene: scenes[idx] });
      }

      const videoUrl = await resolveGrok(scene.videoPredictionId, replicateToken, supabase, scene.number);
      if (!videoUrl) {
        return jsonResponse({ success: true, status: "processing", scene });
      }

      scenes[idx] = { ...scene, videoUrl };
      await updateScenes(supabase, generationId, scenes);

      return jsonResponse({ success: true, status: "complete", scene: scenes[idx] });
    }

    // =============== IMAGE-EDIT PHASE (Apply modification then regenerate video) ===============
    if (phase === "image-edit") {
      const idx = requireNumber(sceneIndex, "sceneIndex");
      const scene = scenes[idx];
      if (!scene) throw new Error("Scene not found");

      const modification = req.imageModification || "";
      if (!modification.trim()) throw new Error("Image modification is required for image-edit phase");

      // Get project for style/format
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, style, format")
        .eq("id", generation.project_id)
        .maybeSingle();
      if (projectError || !project) throw new Error("Project not found");

      const format = (project.format || "portrait") as "landscape" | "portrait" | "square";
      const style = project.style || "realistic";

      // Use Lovable AI for image editing
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

      const fullStylePrompt = getStylePrompt(style);
      const editPrompt = `Edit this image: ${modification}

IMPORTANT: Preserve the overall composition, lighting, and style of the original image.
Apply the following style: ${fullStylePrompt}

Make only the requested changes while keeping everything else consistent.`;

      console.log(`[IMG-EDIT] Scene ${scene.number}: Applying edit via Lovable AI`);

      const editResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: editPrompt },
                { type: "image_url", image_url: { url: scene.imageUrl } },
              ],
            },
          ],
          modalities: ["image", "text"],
        }),
      });

      if (!editResponse.ok) {
        const errText = await editResponse.text();
        console.error(`[IMG-EDIT] Lovable AI failed: ${errText}`);
        throw new Error("Image editing failed");
      }

      const editData = await editResponse.json();
      const editedImageBase64 = editData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      
      if (!editedImageBase64) {
        throw new Error("No edited image returned from Lovable AI");
      }

      // Upload base64 image to storage
      const base64Data = editedImageBase64.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      const fileName = `cinematic-scene-edited-${Date.now()}-${scene.number}.png`;
      const upload = await supabase.storage
        .from("scene-images")
        .upload(fileName, imageBuffer, { contentType: "image/png", upsert: true });

      if (upload.error) {
        try {
          await supabase.storage.createBucket("scene-images", { public: true });
          await supabase.storage.from("scene-images").upload(fileName, imageBuffer, { contentType: "image/png", upsert: true });
        } catch (e) {
          throw new Error("Failed to upload edited image");
        }
      }

      const { data: urlData } = supabase.storage.from("scene-images").getPublicUrl(fileName);
      const newImageUrl = urlData.publicUrl;
      console.log(`[IMG-EDIT] Scene ${scene.number} edited image uploaded: ${newImageUrl}`);

      // Now regenerate video with the new image
      console.log(`[IMG-EDIT] Scene ${scene.number}: Starting video regeneration`);
      const predictionId = await startGrok(scene, newImageUrl, format, replicateToken);
      
      // Poll for video completion
      let videoUrl: string | null = null;
      for (let i = 0; i < 60; i++) {
        await sleep(3000);
        videoUrl = await resolveGrok(predictionId, replicateToken, supabase, scene.number);
        if (videoUrl) break;
      }

      if (!videoUrl) {
        throw new Error("Video generation timed out");
      }

      scenes[idx] = { ...scene, imageUrl: newImageUrl, videoUrl, videoPredictionId: undefined };
      await updateScenes(supabase, generationId, scenes);

      return jsonResponse({ success: true, status: "complete", scene: scenes[idx] });
    }

    // =============== IMAGE-REGEN PHASE (Full regenerate image then video) ===============
    if (phase === "image-regen") {
      const idx = requireNumber(sceneIndex, "sceneIndex");
      const scene = scenes[idx];
      if (!scene) throw new Error("Scene not found");

      // Get project for style/format
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, style, format")
        .eq("id", generation.project_id)
        .maybeSingle();
      if (projectError || !project) throw new Error("Project not found");

      const format = (project.format || "portrait") as "landscape" | "portrait" | "square";
      const style = project.style || "realistic";

      console.log(`[IMG-REGEN] Scene ${scene.number}: Regenerating image`);

      // Generate new image
      const newImageUrl = await generateSceneImage(scene, style, format, replicateToken, supabase);

      console.log(`[IMG-REGEN] Scene ${scene.number}: Starting video regeneration`);
      const predictionId = await startGrok(scene, newImageUrl, format, replicateToken);
      
      // Poll for video completion
      let videoUrl: string | null = null;
      for (let i = 0; i < 60; i++) {
        await sleep(3000);
        videoUrl = await resolveGrok(predictionId, replicateToken, supabase, scene.number);
        if (videoUrl) break;
      }

      if (!videoUrl) {
        throw new Error("Video generation timed out");
      }

      scenes[idx] = { ...scene, imageUrl: newImageUrl, videoUrl, videoPredictionId: undefined };
      await updateScenes(supabase, generationId, scenes);

      return jsonResponse({ success: true, status: "complete", scene: scenes[idx] });
    }

    // =============== PHASE 5: FINALIZE ===============
    if (phase === "finalize") {
      // Collect all video URLs from scenes
      const videoUrls = scenes.filter((s) => s.videoUrl).map((s) => s.videoUrl as string);
      // Keep first as legacy field, but also return all clips
      const finalVideoUrl = videoUrls[0] || "";

      // Mark complete
      await supabase
        .from("generations")
        .update({
          status: "complete",
          progress: 100,
          completed_at: new Date().toISOString(),
          scenes,
          video_url: finalVideoUrl,
        })
        .eq("id", generationId);

      await supabase.from("projects").update({ status: "complete" }).eq("id", generation.project_id);

      // Title from project
      const { data: project } = await supabase
        .from("projects")
        .select("id, title")
        .eq("id", generation.project_id)
        .maybeSingle();

      return jsonResponse({
        success: true,
        projectId: generation.project_id,
        generationId,
        title: project?.title || "Untitled Cinematic",
        scenes,
        finalVideoUrl,
        allVideoUrls: videoUrls, // All generated clips
      });
    }

    return jsonResponse({ error: "Invalid phase" }, { status: 400 });
  } catch (error) {
    console.error("Cinematic generation error:", error);
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
});
