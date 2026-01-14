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
  out = out.replace(/\[[^\]]+\]/g, " ");
  out = out.replace(/[*_~`]+/g, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

// ============= TTS GENERATION =============
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
      
      const createResponse = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${replicateApiKey}`,
          "Content-Type": "application/json",
          "Prefer": "wait"
        },
        body: JSON.stringify({
          version: "140ed22e05f0c1e6bf23b016d0956a29f05e9ea74c414c1eb7ed6da1f0da72cc",
          input: {
            text: voiceoverText,
            audio_prompt_path: "https://replicate.delivery/pbxt/MaU6sNNxMSU6RVbGHTCCNhfKtAqXRvkAFwcnLHrKPdUYjRZt/aurora.wav",
            exaggeration: 0.8,
            cfg_weight: 0.5,
            temperature: 1,
            chunk_size: 250,
            seed: Math.floor(Math.random() * 1000000)
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

      const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());
      console.log(`[TTS] Scene ${sceneIndex + 1} audio OK - ${audioBytes.length} bytes`);

      // Estimate duration (~44100 samples/sec, 16-bit = 2 bytes/sample)
      durationSeconds = Math.max(1, audioBytes.length / (44100 * 2));

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

// ============= IMAGE GENERATION =============
async function generateImageWithReplicate(
  prompt: string,
  replicateApiKey: string,
  format: string
): Promise<{ ok: true; imageBase64: string } | { ok: false; error: string; status?: number; retryAfterSeconds?: number }> {
  const aspectRatio = format === "portrait" ? "9:16" : format === "square" ? "1:1" : "16:9";
  
  try {
    const createResponse = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${replicateApiKey}`,
        "Content-Type": "application/json",
        "Prefer": "wait"
      },
      body: JSON.stringify({
        version: "2a437fef147c7eaa46e8e21d9be81c62a6c0f52490ad5753520254bc81ea041b",
        input: {
          prompt,
          size: "4K",
          aspect_ratio: aspectRatio,
          guidance_scale: 3.5,
          num_inference_steps: 30,
          seed: Math.floor(Math.random() * 1000000)
        }
      })
    });

    if (!createResponse.ok) {
      const status = createResponse.status;
      const retryAfter = createResponse.headers.get("retry-after");
      return { ok: false, error: `API error ${status}`, status, retryAfterSeconds: retryAfter ? parseInt(retryAfter) : undefined };
    }

    let prediction = await createResponse.json();

    while (prediction.status !== "succeeded" && prediction.status !== "failed") {
      await sleep(2000);
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { "Authorization": `Bearer ${replicateApiKey}` }
      });
      prediction = await pollResponse.json();
    }

    if (prediction.status === "failed") {
      return { ok: false, error: prediction.error || "Image generation failed" };
    }

    const imageUrl = prediction.output?.[0] || prediction.output;
    if (!imageUrl) return { ok: false, error: "No image URL returned" };

    // Download image
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) return { ok: false, error: "Failed to download image" };

    const imgBytes = new Uint8Array(await imgResponse.arrayBuffer());
    const base64 = btoa(String.fromCharCode(...imgBytes));
    
    return { ok: true, imageBase64: base64 };
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
      model: "google/gemini-3-pro-preview",
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
  replicateApiKey: string
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
        generateSceneAudioReplicate(scenes[i], i, replicateApiKey, supabase, user.id, projectId)
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

async function handleImagesPhase(
  supabase: any,
  user: any,
  generationId: string,
  projectId: string,
  replicateApiKey: string
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

  // Build image tasks
  interface ImageTask { sceneIndex: number; subIndex: number; prompt: string; }
  const imageTasks: ImageTask[] = [];

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

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    imageTasks.push({ sceneIndex: i, subIndex: 0, prompt: buildImagePrompt(scene.visualPrompt, scene, 0) });
    
    if (scene.subVisuals && scene.duration >= 12) {
      const maxSub = scene.duration >= 19 ? 2 : 1;
      for (let j = 0; j < Math.min(scene.subVisuals.length, maxSub); j++) {
        imageTasks.push({ sceneIndex: i, subIndex: j + 1, prompt: buildImagePrompt(scene.subVisuals[j], scene, j + 1) });
      }
    }
  }

  console.log(`Phase: IMAGES - Generating ${imageTasks.length} images...`);

  const sceneImageUrls: (string | null)[][] = scenes.map(() => []);
  let completedImages = 0;

  // Process in batches of 4
  const BATCH_SIZE = 4;
  for (let batchStart = 0; batchStart < imageTasks.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, imageTasks.length);
    
    const statusMsg = `Generating images... (${completedImages}/${imageTasks.length} complete)`;
    const progress = 40 + Math.floor((completedImages / imageTasks.length) * 50);

    // Update progress
    await supabase.from("generations").update({
      progress,
      scenes: scenes.map((s, idx) => {
        const imgs = sceneImageUrls[idx].filter(Boolean) as string[];
        return {
          ...s,
          imageUrl: imgs[0] || null,
          imageUrls: imgs.length > 0 ? imgs : undefined,
          _meta: {
            ...s._meta,
            statusMessage: statusMsg,
            totalImages: imageTasks.length,
            completedImages,
          }
        };
      })
    }).eq("id", generationId);

    const batchPromises = [];
    for (let t = batchStart; t < batchEnd; t++) {
      const task = imageTasks[t];
      batchPromises.push(
        (async () => {
          for (let attempt = 1; attempt <= 5; attempt++) {
            const result = await generateImageWithReplicate(task.prompt, replicateApiKey, format);
            if (result.ok) {
              // Upload to storage
              const imgBytes = new Uint8Array(atob(result.imageBase64).split("").map(c => c.charCodeAt(0)));
              const suffix = task.subIndex > 0 ? `-${task.subIndex + 1}` : "";
              const path = `${user.id}/${projectId}/scene-${task.sceneIndex + 1}${suffix}.png`;
              
              await supabase.storage.from("audio").upload(path, imgBytes, { contentType: "image/png", upsert: true });
              const { data: { publicUrl } } = supabase.storage.from("audio").getPublicUrl(path);
              
              return { task, url: publicUrl };
            }
            
            if (attempt < 5) {
              const delay = result.retryAfterSeconds ? result.retryAfterSeconds * 1000 : 8000;
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
      if (url) completedImages++;
    }

    if (batchEnd < imageTasks.length) await sleep(2000);
  }

  costTracking.imagesGenerated = completedImages;
  costTracking.estimatedCostUsd += completedImages * PRICING.imagePerImage;
  phaseTimings.images = Date.now() - phaseStart;

  // Final update
  await supabase.from("generations").update({
    progress: 90,
    scenes: scenes.map((s, idx) => {
      const imgs = sceneImageUrls[idx].filter(Boolean) as string[];
      return {
        ...s,
        imageUrl: imgs[0] || null,
        imageUrls: imgs.length > 0 ? imgs : undefined,
        _meta: {
          ...s._meta,
          statusMessage: "Images complete. Finalizing...",
          totalImages: imageTasks.length,
          completedImages,
          costTracking,
          phaseTimings,
        }
      };
    })
  }).eq("id", generationId);

  console.log(`Phase: IMAGES complete in ${phaseTimings.images}ms - ${completedImages}/${imageTasks.length} images`);

  return new Response(
    JSON.stringify({
      success: true,
      phase: "images",
      progress: 90,
      imagesGenerated: completedImages,
      totalImages: imageTasks.length,
      costTracking,
      phaseTime: phaseTimings.images,
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

    const body: GenerationRequest = await req.json();
    const { phase, generationId, projectId, content, format, length, style, customStyle } = body;

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
        return await handleAudioPhase(supabase, user, generationId, projectId, REPLICATE_API_KEY);
      case "images":
        return await handleImagesPhase(supabase, user, generationId, projectId, REPLICATE_API_KEY);
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
