import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

// Glif Simple API
const GLIF_SIMPLE_API_URL = "https://simple-api.glif.app";

// Glif workflow IDs
const GLIF_TXT2VID_ID = "cmlcrert2000204l8u8z1nysa";
const GLIF_IMG2VID_ID = "cmlcswdal000404l217ez6vkf";
const GLIF_STITCH_ID = "cmlctayju000004l5qxf7ydrd";

interface GlifTxt2VidInput {
  prompt: string;
  audio_url?: string;
  duration?: number;
}

interface GlifImg2VidInput {
  image_url: string;
  prompt: string;
  duration?: number;
}

interface GlifStitchInput {
  video_urls: string[];
}

interface GlifResponse {
  output?: string;
  error?: string;
}

type GlifInputs = Record<string, unknown> | unknown[];

// Helper to call Glif Simple API
async function callGlif(
  glifId: string,
  inputs: GlifInputs,
  apiKey: string,
  opts?: { retries?: number }
): Promise<GlifResponse> {
  const retries = opts?.retries ?? 2;

  const callViaBaseUrl = async () => {
    const payload = { id: glifId, inputs };
    return fetch(GLIF_SIMPLE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  };

  const callViaIdUrl = async () => {
    // Glif also supports putting the id in the URL, with body { inputs: ... }
    const payload = { inputs };
    return fetch(`${GLIF_SIMPLE_API_URL}/${glifId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    console.log(
      `[GLIF] Calling ${glifId} (attempt ${attempt + 1}/${retries + 1}) with inputs type: ${Array.isArray(inputs) ? "array" : "object"}`
    );

    // Try the canonical base URL first
    let response = await callViaBaseUrl();

    // If Glif can’t fetch the workflow, try the /{id} route (some glifs behave differently)
    if (!response.ok) {
      const errorText = await response.text();
      const couldNotFetch =
        response.status >= 500 && /could not fetch glif/i.test(errorText);

      if (couldNotFetch) {
        console.warn(`[GLIF] Base URL returned could-not-fetch; retrying via /{id} route`);
        response = await callViaIdUrl();
      } else {
        console.error(`[GLIF] API error (${response.status}):`, errorText);

        // Handle rate limiting explicitly
        if (response.status === 429) {
          const retryAfterSec = Number(response.headers.get("retry-after") || "");
          const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? Math.round(retryAfterSec * 1000)
            : 1500 * (attempt + 1);

          if (attempt < retries) {
            console.warn(`[GLIF] Rate limited (429). Waiting ${waitMs}ms then retrying...`);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }

          throw new Error("Glif rate limit exceeded. Please wait 30–60 seconds and try again.");
        }

    // Handle rate limiting explicitly
    if (response.status === 429) {
      const retryAfterSec = Number(response.headers.get("retry-after") || "");
      const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.round(retryAfterSec * 1000)
        : 1500 * (attempt + 1);

      if (attempt < retries) {
        console.warn(`[GLIF] Rate limited (429). Waiting ${waitMs}ms then retrying...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      throw new Error("Glif rate limit exceeded. Please wait 30–60 seconds and try again.");
    }

    if (response.status >= 500 && attempt < retries) {
      const backoffMs = 400 * (attempt + 1);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }

        throw new Error(`Glif API error: ${response.status} - ${errorText}`);
      }
    }

    if (response.ok) {
      const result = await response.json();
      console.log(`[GLIF] Response:`, result);
      return result;
    }

    const fallbackErrorText = await response.text();
    console.error(`[GLIF] API error (${response.status}):`, fallbackErrorText);

    if (response.status >= 500 && attempt < retries) {
      const backoffMs = 400 * (attempt + 1);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }

    if (/could not fetch glif/i.test(fallbackErrorText)) {
      throw new Error(
        `Glif API error: ${response.status} - ${fallbackErrorText} (This usually means the workflow id is invalid, deleted, private, or your token can’t access it.)`
      );
    }

    throw new Error(`Glif API error: ${response.status} - ${fallbackErrorText}`);
  }

  throw new Error("Glif API error: retries exhausted");
}

// Glif workflow metadata (used to discover the real input block names + order)
const GLIF_META_API_URL = "https://glif.app/api/glifs";
const glifInputNameCache = new Map<string, string[]>();

async function getGlifInputNames(glifId: string, apiKey: string): Promise<string[]> {
  const cached = glifInputNameCache.get(glifId);
  if (cached) return cached;

  const resp = await fetch(`${GLIF_META_API_URL}?id=${encodeURIComponent(glifId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Failed to fetch Glif metadata (${resp.status}): ${t.substring(0, 200)}`);
  }

  const data = await resp.json();
  const nodes = data?.[0]?.data?.nodes;
  const inputNames: string[] = Array.isArray(nodes)
    ? nodes
        // Glif node types vary; match broadly on anything that looks like an input node.
        .filter(
          (n: any) =>
            typeof n?.type === "string" &&
            /input/i.test(n.type) &&
            typeof n?.name === "string" &&
            n.name.trim().length > 0
        )
        .map((n: any) => n.name)
    : [];

  glifInputNameCache.set(glifId, inputNames);
  console.log(`[GLIF] Input names for ${glifId}:`, inputNames);
  return inputNames;
}

type GlifKnownValues = {
  prompt?: string;
  duration?: string;
  audioUrl?: string;
  imageUrl?: string;
};

function pickValueForInputName(name: string, values: GlifKnownValues): string | undefined {
  const n = name.toLowerCase();

  if (values.prompt && (n.includes("prompt") || n === "text" || n.includes("caption") || n.includes("instruction"))) {
    return values.prompt;
  }

  if (values.imageUrl && n.includes("image")) {
    return values.imageUrl;
  }

  if (values.audioUrl && n.includes("audio")) {
    return values.audioUrl;
  }

  if (values.duration && (n.includes("duration") || n.includes("seconds") || n.includes("secs") || n === "sec")) {
    return values.duration;
  }

  return undefined;
}

function buildInputsObjectFromNames(names: string[], values: GlifKnownValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const v = pickValueForInputName(name, values);
    if (typeof v === "string") out[name] = v;
  }
  return out;
}

function buildInputsArrayFromNames(names: string[], values: GlifKnownValues): string[] {
  return names.map((name) => pickValueForInputName(name, values) ?? "");
}

// Generate video from text prompt
export async function generateTextToVideo(
  prompt: string,
  audioUrl?: string,
  duration: number = 10,
  apiKey?: string
): Promise<string> {
  const glifKey = apiKey || Deno.env.get("GLIF_API_KEY");
  if (!glifKey) {
    throw new Error("GLIF_API_KEY is not configured");
  }

  const trimmedPrompt = (prompt || "").trim();
  if (!trimmedPrompt) {
    throw new Error("Text-to-video failed: prompt is empty before calling Glif");
  }

  const durationSec = Math.max(1, Math.round(duration));
  const durationStr = String(durationSec);

  // Glif Simple API expects payload like: { id, inputs: {...} } OR { id, inputs: [ ... ] }
  // Some workflows have unstable/unknown input names and (more importantly) different INPUT ORDER.
  // "Prompt is required" often means the prompt wasn’t provided in the expected slot.
  let inputNames: string[] = [];
  try {
    inputNames = await getGlifInputNames(GLIF_TXT2VID_ID, glifKey);
  } catch (e) {
    console.warn("[GLIF] Could not load workflow metadata; falling back to heuristics:", e);
  }

  if (inputNames.length === 0) {
    // Don’t hard-fail here: metadata may be unavailable/partial for private workflows.
    // We still try common named/positional payload shapes below.
    console.warn(
      `[GLIF] No input nodes detected for ${GLIF_TXT2VID_ID}. Proceeding with heuristic payloads; if this fails, add a TextInput block (name: prompt) in Glif and republish.`
    );
  }

  const schemaNamedInputs =
    inputNames.length > 0
      ? buildInputsObjectFromNames(inputNames, { prompt: trimmedPrompt, duration: durationStr, audioUrl })
      : null;
  const schemaPositionalInputs =
    inputNames.length > 0
      ? buildInputsArrayFromNames(inputNames, { prompt: trimmedPrompt, duration: durationStr, audioUrl })
      : null;

  const attempts: GlifInputs[] = [
    ...(schemaNamedInputs && Object.keys(schemaNamedInputs).length > 0 ? [schemaNamedInputs] : []),
    ...(schemaPositionalInputs ? [schemaPositionalInputs] : []),

    // Named (common aliases)
    {
      prompt: trimmedPrompt,
      Prompt: trimmedPrompt,
      text: trimmedPrompt,
      Text: trimmedPrompt,
      ...(audioUrl
        ? {
            audio_url: audioUrl,
            audioUrl,
            audio: audioUrl,
            Audio: audioUrl,
          }
        : {}),
      duration: durationStr,
      Duration: durationStr,
    },

    // Positional variants (different workflows expect different ordering)
    [trimmedPrompt, audioUrl || "", durationStr],
    [trimmedPrompt, durationStr, audioUrl || ""],
    [audioUrl || "", trimmedPrompt, durationStr],
    [durationStr, trimmedPrompt, audioUrl || ""],
    [trimmedPrompt, durationStr],
    [durationStr, trimmedPrompt],
  ];

  let result: GlifResponse | null = null;

  for (let i = 0; i < attempts.length; i++) {
    result = await callGlif(GLIF_TXT2VID_ID, attempts[i], glifKey, { retries: 2 });

    // If prompt is still "missing", try the next payload shape.
    if (result?.error && /prompt\s+is\s+required/i.test(result.error)) {
      continue;
    }

    break;
  }

  if (result.error) {
    throw new Error(`Text-to-video failed: ${result.error}`);
  }

  if (!result.output) {
    throw new Error("No video URL returned from text-to-video");
  }

  return result.output;
}

// Generate video from image + prompt
export async function generateImageToVideo(
  imageUrl: string,
  prompt: string,
  duration: number = 10,
  apiKey?: string
): Promise<string> {
  const glifKey = apiKey || Deno.env.get("GLIF_API_KEY");
  if (!glifKey) {
    throw new Error("GLIF_API_KEY is not configured");
  }

  const trimmedPrompt = (prompt || "").trim();
  if (!trimmedPrompt) {
    throw new Error("Image-to-video failed: prompt is empty before calling Glif");
  }

  const durationSec = Math.max(1, Math.round(duration));
  const durationStr = String(durationSec);

  let inputNames: string[] = [];
  try {
    inputNames = await getGlifInputNames(GLIF_IMG2VID_ID, glifKey);
  } catch (e) {
    console.warn("[GLIF] Could not load workflow metadata; falling back to heuristics:", e);
  }

  if (inputNames.length === 0) {
    console.warn(
      `[GLIF] No input nodes detected for ${GLIF_IMG2VID_ID}. Proceeding with heuristic payloads; if this fails, add Image/Text input blocks in Glif and republish.`
    );
  }

  const schemaNamedInputs =
    inputNames.length > 0
      ? buildInputsObjectFromNames(inputNames, {
          prompt: trimmedPrompt,
          duration: durationStr,
          imageUrl,
        })
      : null;
  const schemaPositionalInputs =
    inputNames.length > 0
      ? buildInputsArrayFromNames(inputNames, {
          prompt: trimmedPrompt,
          duration: durationStr,
          imageUrl,
        })
      : null;

  const attempts: GlifInputs[] = [
    ...(schemaNamedInputs && Object.keys(schemaNamedInputs).length > 0 ? [schemaNamedInputs] : []),
    ...(schemaPositionalInputs ? [schemaPositionalInputs] : []),

    {
      image_url: imageUrl,
      imageUrl,
      Image: imageUrl,
      prompt: trimmedPrompt,
      Prompt: trimmedPrompt,
      text: trimmedPrompt,
      Text: trimmedPrompt,
      duration: durationStr,
      Duration: durationStr,
    },

    // Positional variants
    [imageUrl, trimmedPrompt, durationStr],
    [imageUrl, durationStr, trimmedPrompt],
    [trimmedPrompt, imageUrl, durationStr],
    [durationStr, imageUrl, trimmedPrompt],
  ];

  let result: GlifResponse | null = null;

  for (let i = 0; i < attempts.length; i++) {
    result = await callGlif(GLIF_IMG2VID_ID, attempts[i], glifKey, { retries: 2 });

    if (result?.error && /prompt\s+is\s+required/i.test(result.error)) {
      continue;
    }

    break;
  }

  if (result.error) {
    throw new Error(`Image-to-video failed: ${result.error}`);
  }

  if (!result.output) {
    throw new Error("No video URL returned from image-to-video");
  }

  return result.output;
}

// Stitch multiple video clips together
export async function stitchVideos(
  videoUrls: string[],
  apiKey?: string
): Promise<string> {
  const glifKey = apiKey || Deno.env.get("GLIF_API_KEY");
  if (!glifKey) {
    throw new Error("GLIF_API_KEY is not configured");
  }

  if (videoUrls.length === 0) {
    throw new Error("No video URLs provided for stitching");
  }

  // If only one video, return it directly
  if (videoUrls.length === 1) {
    return videoUrls[0];
  }

  const urlsJson = JSON.stringify(videoUrls);

  let inputNames: string[] = [];
  try {
    inputNames = await getGlifInputNames(GLIF_STITCH_ID, glifKey);
  } catch (e) {
    console.warn("[GLIF] Could not load stitch workflow metadata:", e);
  }

  if (inputNames.length === 0) {
    console.warn(
      `[GLIF] No input nodes detected for ${GLIF_STITCH_ID}. Proceeding with heuristic payloads; if this fails, add a TextInput block for video_urls in Glif and republish.`
    );
  }

  let result = await callGlif(
    GLIF_STITCH_ID,
    {
      video_urls: urlsJson,
    },
    glifKey,
    { retries: 2 }
  );

  if (result?.error && /required|video_urls|video urls/i.test(result.error)) {
    result = await callGlif(
      GLIF_STITCH_ID,
      [urlsJson],
      glifKey,
      { retries: 2 }
    );
  }

  if (result.error) {
    throw new Error(`Video stitching failed: ${result.error}`);
  }

  if (!result.output) {
    throw new Error("No video URL returned from stitching");
  }

  return result.output;
}

// Main handler for cinematic video generation
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, generationId, projectId, scenes, characterConsistencyEnabled } = body;

    console.log(`[CINEMATIC] Action: ${action}, generationId: ${generationId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin status
    const { data: hasAdminRole } = await supabase.rpc("is_admin", { _user_id: user.id });
    if (!hasAdminRole) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required for Cinematic mode" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const glifApiKey = Deno.env.get("GLIF_API_KEY");
    if (!glifApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "GLIF_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    switch (action) {
      case "generate-scene-video": {
        // Generate video for a single scene
        const { sceneIndex, prompt, imageUrl, audioUrl, duration = 10 } = body;
        
        let videoUrl: string;
        
        if (characterConsistencyEnabled && imageUrl) {
          // Use image-to-video when character consistency is enabled
          console.log(`[CINEMATIC] Scene ${sceneIndex}: Using image-to-video with consistency`);
          videoUrl = await generateImageToVideo(imageUrl, prompt, duration, glifApiKey);
        } else {
          // Use text-to-video for standard generation
          console.log(`[CINEMATIC] Scene ${sceneIndex}: Using text-to-video`);
          videoUrl = await generateTextToVideo(prompt, audioUrl, duration, glifApiKey);
        }

        // Update generation progress in database
        if (generationId) {
          await supabase
            .from("generations")
            .update({ 
              progress: Math.min(90, 40 + (sceneIndex + 1) * 10),
            })
            .eq("id", generationId);
        }

        return new Response(
          JSON.stringify({ success: true, videoUrl, sceneIndex }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "stitch-videos": {
        // Stitch all scene videos together
        const { videoUrls } = body;
        
        if (!Array.isArray(videoUrls) || videoUrls.length === 0) {
          return new Response(
            JSON.stringify({ success: false, error: "No video URLs provided" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[CINEMATIC] Stitching ${videoUrls.length} videos`);
        const finalVideoUrl = await stitchVideos(videoUrls, glifApiKey);

        // Update generation as complete
        if (generationId) {
          await supabase
            .from("generations")
            .update({ 
              progress: 100,
              status: "complete",
              video_url: finalVideoUrl,
              completed_at: new Date().toISOString(),
            })
            .eq("id", generationId);
        }

        return new Response(
          JSON.stringify({ success: true, finalVideoUrl }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "generate-all": {
        // Full pipeline: generate all scene videos and stitch them
        if (!Array.isArray(scenes) || scenes.length === 0) {
          return new Response(
            JSON.stringify({ success: false, error: "No scenes provided" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[CINEMATIC] Generating ${scenes.length} scene videos`);
        const videoUrls: string[] = [];

        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          const prompt = scene.visualPrompt || scene.visual_prompt || "";
          const imageUrl = scene.imageUrl || scene.image_url;
          const audioUrl = scene.audioUrl || scene.audio_url;
          const duration = Math.min(20, Math.max(5, scene.duration || 10));

          try {
            let videoUrl: string;
            
            if (characterConsistencyEnabled && imageUrl) {
              console.log(`[CINEMATIC] Scene ${i + 1}/${scenes.length}: Image-to-video`);
              videoUrl = await generateImageToVideo(imageUrl, prompt, duration, glifApiKey);
            } else {
              console.log(`[CINEMATIC] Scene ${i + 1}/${scenes.length}: Text-to-video`);
              videoUrl = await generateTextToVideo(prompt, audioUrl, duration, glifApiKey);
            }

            videoUrls.push(videoUrl);

            // Update progress
            if (generationId) {
              const progress = Math.min(85, 40 + Math.round((i + 1) / scenes.length * 45));
              await supabase
                .from("generations")
                .update({ progress })
                .eq("id", generationId);
            }
          } catch (err) {
            console.error(`[CINEMATIC] Scene ${i + 1} failed:`, err);
            throw new Error(`Failed to generate video for scene ${i + 1}: ${err.message}`);
          }
        }

        // Stitch all videos together
        console.log(`[CINEMATIC] Stitching ${videoUrls.length} videos`);
        const finalVideoUrl = await stitchVideos(videoUrls, glifApiKey);

        // Mark generation complete
        if (generationId) {
          // Update scenes with video URLs
          const updatedScenes = scenes.map((scene: any, idx: number) => ({
            ...scene,
            videoUrl: videoUrls[idx],
          }));

          await supabase
            .from("generations")
            .update({ 
              progress: 100,
              status: "complete",
              video_url: finalVideoUrl,
              scenes: updatedScenes,
              completed_at: new Date().toISOString(),
            })
            .eq("id", generationId);
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            finalVideoUrl,
            sceneVideoUrls: videoUrls,
            scenesCount: scenes.length,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("[CINEMATIC] Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
