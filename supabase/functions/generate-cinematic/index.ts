import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

// Replicate API
const REPLICATE_API_URL = "https://api.replicate.com/v1/predictions";
const KLING_MODEL = "kwaivgi/kling-v2.5-turbo-pro";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string;
  urls?: {
    get: string;
    cancel: string;
  };
}

// Generate video using Replicate Kling v2.5
async function generateVideoWithReplicate(
  prompt: string,
  options: {
    startImage?: string;
    duration?: 5 | 10;
    aspectRatio?: "16:9" | "9:16" | "1:1";
    negativePrompt?: string;
  } = {}
): Promise<string> {
  const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");
  if (!replicateToken) {
    throw new Error("REPLICATE_API_TOKEN is not configured");
  }

  const trimmedPrompt = (prompt || "").trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required for video generation");
  }

  console.log(`[REPLICATE] Generating video with Kling v2.5: "${trimmedPrompt.substring(0, 50)}..."`);

  // Build input payload
  const input: Record<string, unknown> = {
    prompt: trimmedPrompt,
    duration: options.duration || 5,
    aspect_ratio: options.aspectRatio || "16:9",
  };

  if (options.startImage) {
    input.start_image = options.startImage;
  }

  if (options.negativePrompt) {
    input.negative_prompt = options.negativePrompt;
  }

  // Create prediction
  const createResponse = await fetch(REPLICATE_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${replicateToken}`,
      "Content-Type": "application/json",
      "Prefer": "wait", // Wait for completion
    },
    body: JSON.stringify({
      version: KLING_MODEL,
      input,
    }),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.error(`[REPLICATE] Create prediction failed (${createResponse.status}):`, errorText);
    throw new Error(`Replicate API error: ${createResponse.status} - ${errorText}`);
  }

  let prediction: ReplicatePrediction = await createResponse.json();
  console.log(`[REPLICATE] Prediction created: ${prediction.id}, status: ${prediction.status}`);

  // Poll for completion if not using "Prefer: wait" or if still processing
  const maxWaitMs = 5 * 60 * 1000; // 5 minutes max wait
  const pollIntervalMs = 3000; // 3 seconds between polls
  const startTime = Date.now();

  while (prediction.status === "starting" || prediction.status === "processing") {
    if (Date.now() - startTime > maxWaitMs) {
      throw new Error("Video generation timed out after 5 minutes");
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));

    const pollResponse = await fetch(prediction.urls?.get || `${REPLICATE_API_URL}/${prediction.id}`, {
      headers: {
        "Authorization": `Bearer ${replicateToken}`,
      },
    });

    if (!pollResponse.ok) {
      const errorText = await pollResponse.text();
      console.error(`[REPLICATE] Poll failed (${pollResponse.status}):`, errorText);
      throw new Error(`Failed to check prediction status: ${pollResponse.status}`);
    }

    prediction = await pollResponse.json();
    console.log(`[REPLICATE] Prediction ${prediction.id} status: ${prediction.status}`);
  }

  if (prediction.status === "failed") {
    console.error(`[REPLICATE] Prediction failed:`, prediction.error);
    throw new Error(`Video generation failed: ${prediction.error || "Unknown error"}`);
  }

  if (prediction.status === "canceled") {
    throw new Error("Video generation was canceled");
  }

  // Extract output URL
  let videoUrl: string;
  if (typeof prediction.output === "string") {
    videoUrl = prediction.output;
  } else if (Array.isArray(prediction.output) && prediction.output.length > 0) {
    videoUrl = prediction.output[0];
  } else {
    console.error(`[REPLICATE] Unexpected output format:`, prediction.output);
    throw new Error("No video URL returned from Replicate");
  }

  console.log(`[REPLICATE] Video generated successfully: ${videoUrl}`);
  return videoUrl;
}

// Generate video from text prompt (text-to-video)
export async function generateTextToVideo(
  prompt: string,
  _audioUrl?: string, // Audio not directly supported by Kling
  duration: number = 5
): Promise<string> {
  // Kling only supports 5 or 10 second durations
  const validDuration = duration >= 8 ? 10 : 5;
  
  return generateVideoWithReplicate(prompt, {
    duration: validDuration as 5 | 10,
    aspectRatio: "16:9",
    negativePrompt: "blurry, low quality, distorted, watermark, text overlay",
  });
}

// Generate video from image + prompt (image-to-video)
export async function generateImageToVideo(
  imageUrl: string,
  prompt: string,
  duration: number = 5
): Promise<string> {
  const validDuration = duration >= 8 ? 10 : 5;
  
  return generateVideoWithReplicate(prompt, {
    startImage: imageUrl,
    duration: validDuration as 5 | 10,
    aspectRatio: "16:9",
    negativePrompt: "blurry, low quality, distorted, watermark, text overlay",
  });
}

// For now, stitching is not directly supported by Kling
// Return the first video or handle externally
export async function stitchVideos(videoUrls: string[]): Promise<string> {
  if (videoUrls.length === 0) {
    throw new Error("No video URLs provided for stitching");
  }
  
  // If only one video, return it
  if (videoUrls.length === 1) {
    return videoUrls[0];
  }
  
  // For now, return a message that videos need to be stitched externally
  // or return all URLs for client-side handling
  console.warn(`[REPLICATE] Video stitching not yet implemented for Replicate. Returning first video.`);
  console.log(`[REPLICATE] All generated video URLs:`, videoUrls);
  
  // Return first video as fallback - client should handle stitching
  return videoUrls[0];
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

    const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");
    if (!replicateToken) {
      return new Response(
        JSON.stringify({ success: false, error: "REPLICATE_API_TOKEN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    switch (action) {
      case "generate-scene-video": {
        // Generate video for a single scene
        const { sceneIndex, prompt, imageUrl, audioUrl, duration = 5 } = body;
        
        let videoUrl: string;
        
        if (characterConsistencyEnabled && imageUrl) {
          // Use image-to-video when character consistency is enabled
          console.log(`[CINEMATIC] Scene ${sceneIndex}: Using image-to-video with Kling`);
          videoUrl = await generateImageToVideo(imageUrl, prompt, duration);
        } else {
          // Use text-to-video for standard generation
          console.log(`[CINEMATIC] Scene ${sceneIndex}: Using text-to-video with Kling`);
          videoUrl = await generateTextToVideo(prompt, audioUrl, duration);
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

        console.log(`[CINEMATIC] Processing ${videoUrls.length} videos`);
        const finalVideoUrl = await stitchVideos(videoUrls);

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
          JSON.stringify({ 
            success: true, 
            finalVideoUrl,
            allVideoUrls: videoUrls, // Return all URLs so client can handle stitching if needed
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "generate-all": {
        // Full pipeline: generate all scene videos
        if (!Array.isArray(scenes) || scenes.length === 0) {
          return new Response(
            JSON.stringify({ success: false, error: "No scenes provided" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[CINEMATIC] Generating ${scenes.length} scene videos with Kling v2.5`);
        const videoUrls: string[] = [];

        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          // Robust fallback: try all possible property names for the visual prompt
          const prompt = (
            scene.visualPrompt || 
            scene.visual_prompt || 
            scene.visual_description ||
            scene.voiceover ||
            scene.narration ||
            scene.text ||
            scene.description ||
            ""
          ).trim();
          
          if (!prompt) {
            console.error(`[CINEMATIC] Scene ${i + 1}: No prompt found. Scene data:`, JSON.stringify(scene, null, 2));
            throw new Error(`Scene ${i + 1} has no visual prompt or text content`);
          }
          
          const imageUrl = scene.imageUrl || scene.image_url;
          const duration = scene.duration || 5;

          console.log(`[CINEMATIC] Scene ${i + 1}/${scenes.length}: prompt="${prompt.substring(0, 50)}...", hasImage=${!!imageUrl}`);

          try {
            let videoUrl: string;
            
            if (characterConsistencyEnabled && imageUrl) {
              console.log(`[CINEMATIC] Scene ${i + 1}/${scenes.length}: Image-to-video with Kling`);
              videoUrl = await generateImageToVideo(imageUrl, prompt, duration);
            } else {
              console.log(`[CINEMATIC] Scene ${i + 1}/${scenes.length}: Text-to-video with Kling`);
              videoUrl = await generateTextToVideo(prompt, undefined, duration);
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

        // For now, use the first video as the "final" since stitching isn't implemented
        // The client can handle combining videos if needed
        const finalVideoUrl = videoUrls.length === 1 ? videoUrls[0] : videoUrls[0];
        console.log(`[CINEMATIC] Generated ${videoUrls.length} videos. Final: ${finalVideoUrl}`);

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
