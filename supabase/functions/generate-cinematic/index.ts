import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

// Glif API endpoints
const GLIF_TXT2VID_URL = "https://simple-api.glif.app/cmlcrert2000204l8u8z1nysa";
const GLIF_IMG2VID_URL = "https://simple-api.glif.app/cmlcswdal000404l217ez6vkf";
const GLIF_STITCH_URL = "https://simple-api.glif.app/cmlctayju000004l5qxf7ydrd";

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

// Helper to call Glif API
async function callGlif(
  endpoint: string, 
  params: Record<string, unknown>,
  apiKey: string
): Promise<GlifResponse> {
  console.log(`[GLIF] Calling ${endpoint} with params:`, JSON.stringify(params));
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[GLIF] API error (${response.status}):`, errorText);
    throw new Error(`Glif API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log(`[GLIF] Response:`, result);
  return result;
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

  // Glif Simple API expects params under `inputs`. Names must match the workflow,
  // so we also include a positional `inputs` array fallback.
  const payload: Record<string, unknown> = {
    inputs: {
      prompt: trimmedPrompt,
      duration: String(durationSec),
      ...(audioUrl ? { audio_url: audioUrl } : {}),
    },
    // Fallbacks for workflows that read top-level fields
    prompt: trimmedPrompt,
    duration: String(durationSec),
    ...(audioUrl ? { audio_url: audioUrl } : {}),
    // Positional fallback (most robust when input names differ)
    inputs_array: [trimmedPrompt, audioUrl || "", String(durationSec)],
  };

  const result = await callGlif(GLIF_TXT2VID_URL, payload, glifKey);

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

  const payload: Record<string, unknown> = {
    inputs: {
      image_url: imageUrl,
      prompt: trimmedPrompt,
      duration: String(durationSec),
    },
    image_url: imageUrl,
    prompt: trimmedPrompt,
    duration: String(durationSec),
    inputs_array: [imageUrl, trimmedPrompt, String(durationSec)],
  };

  const result = await callGlif(GLIF_IMG2VID_URL, payload, glifKey);

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

  const payload: Record<string, unknown> = {
    inputs: {
      video_urls: videoUrls,
    },
    video_urls: videoUrls,
    inputs_array: [JSON.stringify(videoUrls)],
  };

  const result = await callGlif(GLIF_STITCH_URL, payload, glifKey);

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
