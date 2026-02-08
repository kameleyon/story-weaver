import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Phase = "script" | "audio" | "images" | "video" | "finalize";

interface CinematicRequest {
  phase?: Phase;

  // Script phase inputs
  content?: string;
  format?: "landscape" | "portrait" | "square";
  length?: string;
  style?: string;
  customStyle?: string;
  brandMark?: string;
  characterDescription?: string;
  inspirationStyle?: string;
  storyTone?: string;
  storyGenre?: string;
  disableExpressions?: boolean;
  brandName?: string;
  characterConsistencyEnabled?: boolean;
  voiceType?: "standard" | "custom";
  voiceId?: string;
  voiceName?: string;

  // Subsequent phases inputs
  projectId?: string;
  generationId?: string;
  sceneIndex?: number;
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

const CHATTERBOX_MODEL = "resemble-ai/chatterbox";
const GROK_VIDEO_MODEL = "xai/grok-imagine-video";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
async function generateScriptWithGemini(
  content: string,
  params: Required<Pick<CinematicRequest, "format" | "length" | "style">> &
    Partial<Pick<
      CinematicRequest,
      | "customStyle"
      | "brandMark"
      | "characterDescription"
      | "inspirationStyle"
      | "storyTone"
      | "storyGenre"
      | "disableExpressions"
      | "brandName"
      | "characterConsistencyEnabled"
      | "voiceType"
      | "voiceId"
      | "voiceName"
    >>,
  lovableApiKey: string,
): Promise<{ title: string; scenes: Scene[] }> {
  console.log("Step 1: Generating script with Gemini 3 Preview...");

  const systemPrompt = `You are a cinematic video script writer. Create a compelling script for a short video.
Generate exactly 7 scenes. Each scene should have:
1. A voiceover narration (what will be spoken)
2. A detailed visual prompt for AI image generation (describe the scene visually, characters, setting, lighting, mood)
3. A visual style descriptor (e.g., "cinematic wide shot", "close-up portrait", "aerial view")
4. Duration in seconds (5-10)

The style is: ${params.style}
The tone is: ${params.storyTone || "casual"}
The genre is: ${params.storyGenre || "documentary"}
${params.inspirationStyle ? `Writing inspiration: ${params.inspirationStyle}` : ""}
${params.characterDescription ? `Main character appearance: ${params.characterDescription}` : ""}
${params.brandName ? `Brand/Character name to include: ${params.brandName}` : ""}

You MUST respond with a JSON object containing a "title" string and a "scenes" array. Each scene must have: number, voiceover, visualPrompt, visualStyle, duration.`;

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
            description: "Create a cinematic video script with title and scenes",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "The video title" },
                scenes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      number: { type: "number" },
                      voiceover: { type: "string", description: "The narration text" },
                      visualPrompt: { type: "string", description: "Detailed visual description for image generation" },
                      visualStyle: { type: "string", description: "Camera/shot style descriptor" },
                      duration: { type: "number", description: "Duration in seconds (5-10)" },
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

    return {
      title: parsed.title,
      scenes: parsed.scenes.map((s: any, idx: number) => ({
        number: s?.number ?? idx + 1,
        voiceover: s?.voiceover ?? "",
        visualPrompt: s?.visualPrompt ?? "",
        visualStyle: s?.visualStyle ?? "cinematic",
        duration: typeof s?.duration === "number" ? s.duration : 6,
      })),
    };
  }

  throw new Error("No tool call response from Gemini 3");
}

// ============================================
// STEP 2: Audio Generation with Replicate Chatterbox (phased)
// ============================================
async function startChatterbox(scene: Scene, replicateToken: string): Promise<string> {
  // Fetch latest version dynamically
  const version = await getLatestModelVersion(CHATTERBOX_MODEL, replicateToken);

  // Replicate's Chatterbox schema currently requires `input.prompt`
  const prompt = (scene.voiceover || "").trim() || `Scene ${scene.number} narration.`;

  const prediction = await createReplicatePrediction(
    version,
    {
      prompt,
      exaggeration: 0.5,
      cfg: 0.5,
    },
    replicateToken,
  );
  console.log(`Chatterbox prediction started: ${prediction.id}`);
  return prediction.id;
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
// STEP 3: Image Generation with Gemini Image (phased)
// ============================================
async function generateSceneImage(
  scene: Scene,
  style: string,
  format: "landscape" | "portrait" | "square",
  lovableApiKey: string,
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const aspectRatio = format === "portrait" ? "9:16" : format === "square" ? "1:1" : "16:9";
  const imagePrompt = `${scene.visualPrompt}. Style: ${style}, ${scene.visualStyle}. Cinematic quality, ${aspectRatio} aspect ratio. Ultra high resolution.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: imagePrompt }],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Image generation error:", error);
    throw new Error("Failed to generate image");
  }

  const data = await response.json();
  const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageData) throw new Error("No image generated");

  const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
  const imageBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

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
  return urlData.publicUrl;
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

async function resolveGrok(predictionId: string, replicateToken: string): Promise<string | null> {
  const result = await getReplicatePrediction(predictionId, replicateToken);

  if (result.status !== "succeeded") {
    if (result.status === "failed") {
      console.error("Grok failed:", result.error);
      throw new Error("Grok video generation failed");
    }
    return null;
  }

  const outputUrl = result.output;
  if (typeof outputUrl !== "string" || !outputUrl) return null;
  return outputUrl;
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
          characterDescription: body.characterDescription,
          inspirationStyle: body.inspirationStyle,
          storyTone: body.storyTone,
          storyGenre: body.storyGenre,
          disableExpressions: body.disableExpressions,
          brandName: body.brandName,
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

    // =============== PHASE 2: AUDIO ===============
    if (phase === "audio") {
      const idx = requireNumber(sceneIndex, "sceneIndex");
      const scene = scenes[idx];
      if (!scene) throw new Error("Scene not found");

      if (scene.audioUrl) {
        return jsonResponse({ success: true, status: "complete", scene });
      }

      if (!scene.audioPredictionId) {
        const predictionId = await startChatterbox(scene, replicateToken);
        scenes[idx] = { ...scene, audioPredictionId: predictionId };
        await updateScenes(supabase, generationId, scenes);
        return jsonResponse({ success: true, status: "processing", scene: scenes[idx] });
      }

      // Try resolve (single check; client will call again if still processing)
      const audioUrl = await resolveChatterbox(scene.audioPredictionId, replicateToken, supabase, scene.number);
      if (!audioUrl) {
        return jsonResponse({ success: true, status: "processing", scene });
      }

      scenes[idx] = { ...scene, audioUrl };
      await updateScenes(supabase, generationId, scenes);

      return jsonResponse({ success: true, status: "complete", scene: scenes[idx] });
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
        lovableApiKey,
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

      const videoUrl = await resolveGrok(scene.videoPredictionId, replicateToken);
      if (!videoUrl) {
        return jsonResponse({ success: true, status: "processing", scene });
      }

      scenes[idx] = { ...scene, videoUrl };
      await updateScenes(supabase, generationId, scenes);

      return jsonResponse({ success: true, status: "complete", scene: scenes[idx] });
    }

    // =============== PHASE 5: FINALIZE ===============
    if (phase === "finalize") {
      const videoUrls = scenes.filter((s) => s.videoUrl).map((s) => s.videoUrl as string);
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
