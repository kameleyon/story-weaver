import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
  duration: number;
  audioUrl?: string;
  videoUrl?: string;
}

const GLIF_API_URL = "https://simple-api.glif.app";

// Glif workflow IDs
const GLIF_TXT2VID_ID = "cmlcrert2000204l8u8z1nysa"; // Text-to-Video
const GLIF_IMG2VID_ID = "cmlcswdal000404l217ez6vkf"; // Image-to-Video
const GLIF_STITCH_ID = "cmlctayju000004l5qxf7ydrd"; // Video Stitching

async function callGlifApi(glifId: string, inputs: string[], apiToken: string): Promise<any> {
  console.log(`Calling Glif API with id: ${glifId}, inputs:`, inputs);
  
  const response = await fetch(GLIF_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: glifId,
      inputs,
    }),
  });

  const result = await response.json();
  
  if (result.error) {
    console.error("Glif API error:", result.error);
    throw new Error(`Glif API error: ${result.error}`);
  }

  console.log("Glif API response:", result);
  return result;
}

async function generateScriptWithAI(
  content: string,
  params: CinematicRequest,
  openRouterKey: string
): Promise<{ title: string; scenes: Scene[] }> {
  const systemPrompt = `You are a cinematic video script writer. Create a compelling script for a short video.
Generate scenes that are 5-10 seconds each. Each scene should have:
1. A voiceover narration (what will be spoken)
2. A detailed visual prompt for AI video generation (describe the scene visually, including camera angles, lighting, mood)
3. Duration in seconds (5-10)

The style is: ${params.style}
The tone is: ${params.storyTone || "casual"}
The genre is: ${params.storyGenre || "documentary"}
${params.inspirationStyle ? `Writing inspiration: ${params.inspirationStyle}` : ""}
${params.characterDescription ? `Main character appearance: ${params.characterDescription}` : ""}
${params.brandName ? `Brand/Character name to include: ${params.brandName}` : ""}

Respond with JSON only:
{
  "title": "Video Title",
  "scenes": [
    {
      "number": 1,
      "voiceover": "The narration text...",
      "visualPrompt": "Detailed visual description for AI video generation...",
      "duration": 8
    }
  ]
}`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Create a cinematic video script based on this idea:\n\n${content}` },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("OpenRouter error:", error);
    throw new Error("Failed to generate script");
  }

  const data = await response.json();
  const scriptText = data.choices?.[0]?.message?.content || "";
  
  try {
    return JSON.parse(scriptText);
  } catch (e) {
    console.error("Failed to parse script:", scriptText);
    throw new Error("Invalid script format from AI");
  }
}

async function generateAudioForScene(
  scene: Scene,
  voiceParams: { voiceType?: string; voiceId?: string; voiceName?: string },
  supabaseUrl: string,
  supabaseKey: string
): Promise<string> {
  // Call the existing audio generation from generate-video
  // For now, we'll use Google TTS via the existing infrastructure
  const googleTtsKey = Deno.env.get("GOOGLE_TTS_API_KEY");
  if (!googleTtsKey) {
    throw new Error("GOOGLE_TTS_API_KEY not configured");
  }

  const voiceName = voiceParams.voiceType === "custom" && voiceParams.voiceId
    ? voiceParams.voiceId
    : (voiceParams.voiceName === "male" ? "en-US-Neural2-D" : "en-US-Neural2-C");

  const ttsResponse = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${googleTtsKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: scene.voiceover },
        voice: {
          languageCode: "en-US",
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 1.0,
          pitch: 0,
        },
      }),
    }
  );

  if (!ttsResponse.ok) {
    const error = await ttsResponse.text();
    console.error("TTS error:", error);
    throw new Error("Failed to generate audio");
  }

  const ttsData = await ttsResponse.json();
  const audioContent = ttsData.audioContent;

  // Upload to Supabase storage
  const supabase = createClient(supabaseUrl, supabaseKey);
  const fileName = `cinematic-audio-${Date.now()}-${scene.number}.mp3`;
  const audioBuffer = Uint8Array.from(atob(audioContent), c => c.charCodeAt(0));

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("audio-files")
    .upload(fileName, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    throw new Error("Failed to upload audio");
  }

  const { data: urlData } = supabase.storage
    .from("audio-files")
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get auth token
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const glifToken = Deno.env.get("GLIF_API_TOKEN");
    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration missing");
    }

    if (!glifToken) {
      throw new Error("GLIF_API_TOKEN not configured");
    }

    if (!openRouterKey) {
      throw new Error("OPENROUTER_API_KEY not configured");
    }

    // Parse request
    const params: CinematicRequest = await req.json();
    console.log("Cinematic generation request:", params);

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

    // Step 1: Generate script
    console.log("Step 1: Generating script...");
    const script = await generateScriptWithAI(params.content, params, openRouterKey);
    console.log("Script generated:", script.title, `${script.scenes.length} scenes`);

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

    if (projectError) {
      console.error("Project creation error:", projectError);
      throw new Error("Failed to create project");
    }

    // Create generation record
    const { data: generation, error: genError } = await supabase
      .from("generations")
      .insert({
        user_id: user.id,
        project_id: project.id,
        status: "generating",
        progress: 10,
      })
      .select()
      .single();

    if (genError) {
      console.error("Generation creation error:", genError);
      throw new Error("Failed to create generation record");
    }

    // Step 2: Generate audio for each scene
    console.log("Step 2: Generating audio...");
    const scenesWithAudio: Scene[] = [];
    
    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i];
      console.log(`Generating audio for scene ${i + 1}/${script.scenes.length}`);
      
      try {
        const audioUrl = await generateAudioForScene(
          scene,
          { voiceType: params.voiceType, voiceId: params.voiceId, voiceName: params.voiceName },
          supabaseUrl,
          supabaseKey
        );
        scenesWithAudio.push({ ...scene, audioUrl });
      } catch (audioError) {
        console.error(`Audio generation failed for scene ${i + 1}:`, audioError);
        // Continue without audio for this scene
        scenesWithAudio.push(scene);
      }

      // Update progress
      await supabase
        .from("generations")
        .update({ progress: 10 + Math.floor((i + 1) / script.scenes.length * 30) })
        .eq("id", generation.id);
    }

    // Step 3: Generate video clips using Glif
    console.log("Step 3: Generating video clips via Glif...");
    const scenesWithVideo: Scene[] = [];

    for (let i = 0; i < scenesWithAudio.length; i++) {
      const scene = scenesWithAudio[i];
      console.log(`Generating video for scene ${i + 1}/${scenesWithAudio.length}`);

      try {
        // Use text-to-video for now
        // Glif txt2vid expects: [prompt, audio_url]
        const glifInputs = [
          `${scene.visualPrompt}. Cinematic quality, ${params.style} style, ${scene.duration} seconds.`,
        ];
        
        if (scene.audioUrl) {
          glifInputs.push(scene.audioUrl);
        }

        const glifResult = await callGlifApi(GLIF_TXT2VID_ID, glifInputs, glifToken);
        
        if (glifResult.output) {
          scenesWithVideo.push({ ...scene, videoUrl: glifResult.output });
        } else {
          console.warn(`No video output for scene ${i + 1}`);
          scenesWithVideo.push(scene);
        }
      } catch (glifError) {
        console.error(`Glif video generation failed for scene ${i + 1}:`, glifError);
        scenesWithVideo.push(scene);
      }

      // Update progress
      await supabase
        .from("generations")
        .update({ progress: 40 + Math.floor((i + 1) / scenesWithAudio.length * 40) })
        .eq("id", generation.id);
    }

    // Step 4: Stitch videos together using Glif
    console.log("Step 4: Stitching videos...");
    let finalVideoUrl = "";
    
    const videoUrls = scenesWithVideo
      .filter(s => s.videoUrl)
      .map(s => s.videoUrl!);

    if (videoUrls.length > 0) {
      try {
        // Glif stitch expects array of video URLs
        const stitchResult = await callGlifApi(GLIF_STITCH_ID, videoUrls, glifToken);
        if (stitchResult.output) {
          finalVideoUrl = stitchResult.output;
        } else {
          // Use first video as fallback
          finalVideoUrl = videoUrls[0] || "";
        }
      } catch (stitchError) {
        console.error("Video stitching failed:", stitchError);
        // Use first video as fallback
        finalVideoUrl = videoUrls[0] || "";
      }
    }

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

    // Update project status
    await supabase
      .from("projects")
      .update({ status: "complete" })
      .eq("id", project.id);

    console.log("Cinematic generation complete:", finalVideoUrl);

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
