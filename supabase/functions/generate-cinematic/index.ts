import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CinematicRequest {
  content: string;
  format: "landscape" | "portrait" | "square";
  length: string;
  style: string;
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
}

const REPLICATE_API_URL = "https://api.replicate.com/v1/predictions";
const GROK_VIDEO_MODEL = "xai/grok-imagine-video";

// ============================================
// STEP 1: Script Generation with Gemini 3 Preview
// ============================================
async function generateScriptWithGemini(
  content: string,
  params: CinematicRequest,
  lovableApiKey: string
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
      "Authorization": `Bearer ${lovableApiKey}`,
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
  console.log("Gemini 3 response:", JSON.stringify(data).substring(0, 500));

  // Extract from tool call
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    const parsed = JSON.parse(toolCall.function.arguments);
    if (!parsed.title || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
      throw new Error("Invalid script structure from Gemini");
    }
    console.log(`Script generated: "${parsed.title}" with ${parsed.scenes.length} scenes`);
    return parsed;
  }

  throw new Error("No tool call response from Gemini 3");
}

// ============================================
// STEP 2: Audio Generation with Replicate Chatterbox
// ============================================
async function generateAudioWithChatterbox(
  scene: Scene,
  replicateToken: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<string> {
  console.log(`Step 2: Generating audio for scene ${scene.number} with Chatterbox...`);

  // Create prediction
  const predictionResponse = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      "Authorization": `Token ${replicateToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: "8ed55d249e421f2133dfb868a8a4d58fff23cfd0427cf75a01c47b91ae3ae73a",
      input: {
        text: scene.voiceover,
        exaggeration: 0.5,
        cfg_weight: 0.5,
      },
    }),
  });

  if (!predictionResponse.ok) {
    const error = await predictionResponse.text();
    console.error("Chatterbox prediction error:", error);
    throw new Error("Failed to start Chatterbox prediction");
  }

  const prediction = await predictionResponse.json();
  console.log(`Chatterbox prediction started: ${prediction.id}`);

  // Poll for completion
  let result = prediction;
  let attempts = 0;
  const maxAttempts = 60;

  while (result.status !== "succeeded" && result.status !== "failed" && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { "Authorization": `Token ${replicateToken}` },
    });
    
    result = await statusResponse.json();
    attempts++;
    console.log(`Chatterbox status: ${result.status} (attempt ${attempts})`);
  }

  if (result.status !== "succeeded" || !result.output) {
    console.error("Chatterbox failed:", result.error || "No output");
    throw new Error("Chatterbox audio generation failed");
  }

  // Download and upload to Supabase
  const audioUrl = result.output;
  console.log(`Chatterbox audio URL: ${audioUrl}`);

  const audioResponse = await fetch(audioUrl);
  const audioBuffer = await audioResponse.arrayBuffer();

  const supabase = createClient(supabaseUrl, supabaseKey);
  const fileName = `cinematic-audio-${Date.now()}-${scene.number}.wav`;

  const { error: uploadError } = await supabase.storage
    .from("audio-files")
    .upload(fileName, new Uint8Array(audioBuffer), {
      contentType: "audio/wav",
      upsert: true,
    });

  if (uploadError) {
    console.error("Audio upload error:", uploadError);
    throw new Error("Failed to upload audio");
  }

  const { data: urlData } = supabase.storage.from("audio-files").getPublicUrl(fileName);
  console.log(`Audio uploaded: ${urlData.publicUrl}`);
  
  return urlData.publicUrl;
}

// ============================================
// STEP 3: Image Generation with Gemini Image
// ============================================
async function generateSceneImage(
  scene: Scene,
  style: string,
  format: string,
  lovableApiKey: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<string> {
  console.log(`Step 3: Generating image for scene ${scene.number}...`);

  const aspectRatio = format === "portrait" ? "9:16" : format === "square" ? "1:1" : "16:9";
  
  const imagePrompt = `${scene.visualPrompt}. Style: ${style}, ${scene.visualStyle}. Cinematic quality, ${aspectRatio} aspect ratio. Ultra high resolution.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [
        { role: "user", content: imagePrompt },
      ],
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

  if (!imageData) {
    console.error("No image in response:", JSON.stringify(data).substring(0, 500));
    throw new Error("No image generated");
  }

  // Upload base64 image to Supabase
  const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
  const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

  const supabase = createClient(supabaseUrl, supabaseKey);
  const fileName = `cinematic-scene-${Date.now()}-${scene.number}.png`;

  const { error: uploadError } = await supabase.storage
    .from("scene-images")
    .upload(fileName, imageBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    // Try creating the bucket if it doesn't exist
    console.log("Creating scene-images bucket...");
    await supabase.storage.createBucket("scene-images", { public: true });
    
    const { error: retryError } = await supabase.storage
      .from("scene-images")
      .upload(fileName, imageBuffer, {
        contentType: "image/png",
        upsert: true,
      });
    
    if (retryError) {
      console.error("Image upload error:", retryError);
      throw new Error("Failed to upload scene image");
    }
  }

  const { data: urlData } = supabase.storage.from("scene-images").getPublicUrl(fileName);
  console.log(`Scene image uploaded: ${urlData.publicUrl}`);
  
  return urlData.publicUrl;
}

// ============================================
// STEP 4: Video Generation with Replicate Grok
// ============================================
async function generateVideoFromImage(
  scene: Scene,
  imageUrl: string,
  format: string,
  replicateToken: string
): Promise<string> {
  console.log(`Step 4: Generating video for scene ${scene.number} with Grok...`);

  const aspectRatio = format === "portrait" ? "9:16" : format === "square" ? "1:1" : "16:9";

  // Create prediction
  const predictionResponse = await fetch(REPLICATE_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Token ${replicateToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: "luma/ray",
      model: GROK_VIDEO_MODEL,
      input: {
        prompt: scene.visualPrompt,
        image: imageUrl,
        duration: Math.min(scene.duration, 15),
        resolution: "720p",
        aspect_ratio: aspectRatio,
      },
    }),
  });

  if (!predictionResponse.ok) {
    const error = await predictionResponse.text();
    console.error("Grok prediction error:", error);
    throw new Error("Failed to start Grok video prediction");
  }

  const prediction = await predictionResponse.json();
  console.log(`Grok prediction started: ${prediction.id}`);

  // Poll for completion
  let result = prediction;
  let attempts = 0;
  const maxAttempts = 120; // 4 minutes max for video

  while (result.status !== "succeeded" && result.status !== "failed" && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    const statusResponse = await fetch(`${REPLICATE_API_URL}/${prediction.id}`, {
      headers: { "Authorization": `Token ${replicateToken}` },
    });
    
    result = await statusResponse.json();
    attempts++;
    console.log(`Grok status: ${result.status} (attempt ${attempts})`);
  }

  if (result.status !== "succeeded" || !result.output) {
    console.error("Grok failed:", result.error || "No output");
    throw new Error("Grok video generation failed");
  }

  console.log(`Video generated: ${result.output}`);
  return result.output;
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");

    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase configuration missing");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");
    if (!replicateToken) throw new Error("REPLICATE_API_TOKEN not configured");

    const params: CinematicRequest = await req.json();
    console.log("=== CINEMATIC GENERATION START ===");
    console.log("Request:", JSON.stringify(params).substring(0, 300));

    // Verify user auth
    const supabase = createClient(supabaseUrl, supabaseKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify admin access
    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Cinematic generation is only available for admins during beta" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // STEP 1: Generate Script with Gemini 3 Preview
    const script = await generateScriptWithGemini(params.content, params, lovableApiKey);

    // Create project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title: script.title,
        content: params.content,
        format: params.format,
        length: params.length,
        style: params.style,
        project_type: "cinematic",
        status: "generating",
      })
      .select()
      .single();

    if (projectError) throw new Error("Failed to create project");

    // Create generation record
    const { data: generation, error: genError } = await supabase
      .from("generations")
      .insert({
        user_id: user.id,
        project_id: project.id,
        status: "generating",
        progress: 5,
      })
      .select()
      .single();

    if (genError) throw new Error("Failed to create generation record");

    const updateProgress = async (progress: number) => {
      await supabase.from("generations").update({ progress }).eq("id", generation.id);
    };

    // STEP 2: Generate Audio for each scene
    console.log("=== STEP 2: AUDIO GENERATION ===");
    const scenesWithAudio: Scene[] = [];
    
    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i];
      try {
        const audioUrl = await generateAudioWithChatterbox(scene, replicateToken, supabaseUrl, supabaseKey);
        scenesWithAudio.push({ ...scene, audioUrl });
      } catch (audioError) {
        console.error(`Audio failed for scene ${i + 1}:`, audioError);
        scenesWithAudio.push(scene);
      }
      await updateProgress(5 + Math.floor((i + 1) / script.scenes.length * 25));
    }

    // STEP 3: Generate Images for each scene
    console.log("=== STEP 3: IMAGE GENERATION ===");
    const scenesWithImages: Scene[] = [];
    
    for (let i = 0; i < scenesWithAudio.length; i++) {
      const scene = scenesWithAudio[i];
      try {
        const imageUrl = await generateSceneImage(
          scene,
          params.style,
          params.format,
          lovableApiKey,
          supabaseUrl,
          supabaseKey
        );
        scenesWithImages.push({ ...scene, imageUrl });
      } catch (imageError) {
        console.error(`Image failed for scene ${i + 1}:`, imageError);
        scenesWithImages.push(scene);
      }
      await updateProgress(30 + Math.floor((i + 1) / scenesWithAudio.length * 25));
    }

    // STEP 4: Generate Videos from Images
    console.log("=== STEP 4: VIDEO GENERATION ===");
    const scenesWithVideo: Scene[] = [];
    
    for (let i = 0; i < scenesWithImages.length; i++) {
      const scene = scenesWithImages[i];
      if (scene.imageUrl) {
        try {
          const videoUrl = await generateVideoFromImage(scene, scene.imageUrl, params.format, replicateToken);
          scenesWithVideo.push({ ...scene, videoUrl });
        } catch (videoError) {
          console.error(`Video failed for scene ${i + 1}:`, videoError);
          scenesWithVideo.push(scene);
        }
      } else {
        scenesWithVideo.push(scene);
      }
      await updateProgress(55 + Math.floor((i + 1) / scenesWithImages.length * 30));
    }

    // Final video is the first generated video (stitching removed - use client-side or separate service)
    const videoUrls = scenesWithVideo.filter(s => s.videoUrl).map(s => s.videoUrl!);
    const finalVideoUrl = videoUrls[0] || "";

    // Update generation with final result
    await supabase
      .from("generations")
      .update({
        status: "complete",
        progress: 100,
        completed_at: new Date().toISOString(),
        scenes: scenesWithVideo,
        video_url: finalVideoUrl,
      })
      .eq("id", generation.id);

    await supabase.from("projects").update({ status: "complete" }).eq("id", project.id);

    console.log("=== CINEMATIC GENERATION COMPLETE ===");
    console.log("Final video:", finalVideoUrl);

    return new Response(
      JSON.stringify({
        success: true,
        projectId: project.id,
        generationId: generation.id,
        title: script.title,
        scenes: scenesWithVideo,
        finalVideoUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Cinematic generation error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
