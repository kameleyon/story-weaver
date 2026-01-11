import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerationRequest {
  content: string;
  format: string;
  length: string;
  style: string;
  customStyle?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get the user from the authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Verify the user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { content, format, length, style, customStyle }: GenerationRequest = await req.json();

    // Determine scene count based on video length
    const sceneCounts: Record<string, number> = {
      short: 4,
      brief: 6,
      presentation: 10,
    };
    const sceneCount = sceneCounts[length] || 6;

    // Step 1: Generate script with scenes
    const styleDescription = style === "custom" ? customStyle : style;
    
    const scriptPrompt = `You are a video script writer. Create a compelling video script from the following content.
    
Content: ${content}

Requirements:
- Video format: ${format} (${format === "landscape" ? "16:9" : format === "portrait" ? "9:16" : "1:1"})
- Target length: ${length === "short" ? "under 2 minutes" : length === "brief" ? "2-5 minutes" : "5-10 minutes"}
- Visual style: ${styleDescription}
- Create exactly ${sceneCount} scenes

For each scene, provide:
1. Scene number
2. Voiceover text (what will be spoken)
3. Visual description (detailed prompt for image generation in the ${styleDescription} style)
4. Duration in seconds

Format your response as JSON with this structure:
{
  "title": "Video Title",
  "scenes": [
    {
      "number": 1,
      "voiceover": "Text to be spoken...",
      "visualPrompt": "Detailed image generation prompt...",
      "duration": 15
    }
  ]
}`;

    console.log("Generating script...");
    
    const scriptResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an expert video script writer. Always respond with valid JSON only." },
          { role: "user", content: scriptPrompt }
        ],
      }),
    });

    if (!scriptResponse.ok) {
      const status = scriptResponse.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await scriptResponse.text();
      console.error("Script generation error:", status, errorText);
      throw new Error("Failed to generate script");
    }

    const scriptData = await scriptResponse.json();
    const scriptContent = scriptData.choices?.[0]?.message?.content;
    
    if (!scriptContent) {
      throw new Error("No script content received");
    }

    // Parse the script JSON
    let parsedScript;
    try {
      // Try to extract JSON from the response
      const jsonMatch = scriptContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedScript = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse script:", parseError, scriptContent);
      throw new Error("Failed to parse generated script");
    }

    console.log("Script generated:", parsedScript.title);

    // Create project in database
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title: parsedScript.title || "Untitled Video",
        content: content,
        format: format,
        length: length,
        style: style,
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
        project_id: project.id,
        user_id: user.id,
        status: "generating",
        progress: 25,
        script: scriptContent,
        scenes: parsedScript.scenes,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (genError) {
      console.error("Generation creation error:", genError);
      throw new Error("Failed to create generation record");
    }

    // Step 2: Generate images for each scene (using Lovable AI image model)
    console.log("Generating scene images...");
    const sceneImages: string[] = [];
    
    for (let i = 0; i < parsedScript.scenes.length; i++) {
      const scene = parsedScript.scenes[i];
      
      try {
        const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                content: `Create a ${format} aspect ratio image: ${scene.visualPrompt}. Style: ${styleDescription}. High quality, professional.`
              }
            ],
            modalities: ["image", "text"]
          }),
        });

        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          const imageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (imageUrl) {
            sceneImages.push(imageUrl);
            console.log(`Scene ${i + 1} image generated`);
          } else {
            sceneImages.push(""); // Placeholder for failed image
            console.log(`Scene ${i + 1} image failed - no URL`);
          }
        } else {
          sceneImages.push("");
          console.log(`Scene ${i + 1} image failed - status ${imageResponse.status}`);
        }
      } catch (imgError) {
        console.error(`Scene ${i + 1} image error:`, imgError);
        sceneImages.push("");
      }

      // Update progress
      const progress = 25 + Math.floor(((i + 1) / parsedScript.scenes.length) * 50);
      await supabase
        .from("generations")
        .update({ progress, scenes: parsedScript.scenes.map((s: any, idx: number) => ({
          ...s,
          imageUrl: sceneImages[idx] || null
        })) })
        .eq("id", generation.id);
    }

    // Update generation as complete
    const finalScenes = parsedScript.scenes.map((s: any, idx: number) => ({
      ...s,
      imageUrl: sceneImages[idx] || null
    }));

    await supabase
      .from("generations")
      .update({
        status: "complete",
        progress: 100,
        scenes: finalScenes,
        completed_at: new Date().toISOString(),
      })
      .eq("id", generation.id);

    await supabase
      .from("projects")
      .update({ status: "complete" })
      .eq("id", project.id);

    console.log("Generation complete!");

    return new Response(
      JSON.stringify({
        success: true,
        projectId: project.id,
        generationId: generation.id,
        title: parsedScript.title,
        scenes: finalScenes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});