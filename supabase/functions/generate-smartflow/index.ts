import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============= INPUT VALIDATION =============
const INPUT_LIMITS = {
  dataSource: 250000, // Max 250K characters for data
  extractionPrompt: 2000,
  style: 50,
  customStyle: 2000,
  format: 20,
  brandMark: 500,
  voiceId: 200,
  voiceName: 200,
};

const ALLOWED_FORMATS = ["landscape", "portrait", "square"];
const ALLOWED_STYLES = ["minimalist", "doodle", "stick", "realistic", "storybook", "caricature", "sketch", "crayon", "custom"];

function validateString(value: unknown, fieldName: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`${fieldName} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new Error(`${fieldName} exceeds maximum length of ${maxLength}`);
  return trimmed || null;
}

function validateEnum<T extends string>(value: unknown, fieldName: string, allowed: readonly T[]): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`${fieldName} must be a string`);
  const lower = value.toLowerCase().trim();
  if (!allowed.includes(lower as T)) throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}`);
  return lower as T;
}

// ============= STYLE DESCRIPTIONS =============
const STYLE_DESCRIPTIONS: Record<string, string> = {
  minimalist: "Clean, modern minimalist design with simple shapes, flat colors, and ample white space. Professional corporate aesthetic.",
  doodle: "Hand-drawn doodle style with sketchy lines, playful icons, and a casual, approachable feel.",
  stick: "Simple stick figure illustrations with basic shapes, clean lines, and easy-to-understand visual metaphors.",
  realistic: "Photorealistic 3D renders with professional lighting, detailed textures, and polished corporate look.",
  storybook: "Warm, illustrated storybook aesthetic with soft colors, gentle gradients, and charming character designs.",
  caricature: "Exaggerated caricature style with bold expressions, dynamic poses, and humorous visual elements.",
  sketch: "Pencil sketch aesthetic with cross-hatching, artistic shading, and an elegant hand-drawn quality.",
  crayon: "Colorful crayon-drawn style with textured strokes, vibrant colors, and a playful, childlike charm.",
  custom: "",
};

// ============= FORMAT MAPPING =============
const FORMAT_SPECS: Record<string, { width: number; height: number; aspect: string }> = {
  portrait: { width: 1080, height: 1920, aspect: "9:16 vertical" },
  square: { width: 1080, height: 1080, aspect: "1:1 square" },
  landscape: { width: 1920, height: 1080, aspect: "16:9 horizontal" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[SMARTFLOW] User authenticated:", user.id);

    // Parse and validate request body
    const body = await req.json();
    const dataSource = validateString(body.dataSource, "dataSource", INPUT_LIMITS.dataSource);
    const extractionPrompt = validateString(body.extractionPrompt, "extractionPrompt", INPUT_LIMITS.extractionPrompt);
    const style = validateEnum(body.style, "style", ALLOWED_STYLES as unknown as readonly string[]) || "minimalist";
    const customStyle = validateString(body.customStyle, "customStyle", INPUT_LIMITS.customStyle);
    const format = validateEnum(body.format, "format", ALLOWED_FORMATS as unknown as readonly string[]) || "square";
    const brandMark = validateString(body.brandMark, "brandMark", INPUT_LIMITS.brandMark);
    const enableVoice = Boolean(body.enableVoice);
    const voiceType = body.voiceType || "standard";
    const voiceId = validateString(body.voiceId, "voiceId", INPUT_LIMITS.voiceId);
    const voiceName = validateString(body.voiceName, "voiceName", INPUT_LIMITS.voiceName);
    const voiceGender = body.voiceGender || "female";

    if (!dataSource || dataSource.length < 10) {
      return new Response(JSON.stringify({ error: "Data source must be at least 10 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!extractionPrompt || extractionPrompt.length < 5) {
      return new Response(JSON.stringify({ error: "Extraction prompt must be at least 5 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[SMARTFLOW] Request validated:", { style, format, enableVoice, dataLength: dataSource.length });

    // Create project record
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title: `Smart Flow - ${new Date().toLocaleDateString()}`,
        content: dataSource.substring(0, 1000),
        description: extractionPrompt,
        project_type: "smartflow",
        format,
        style: style === "custom" ? customStyle : style,
        length: "short",
        brand_mark: brandMark,
        voice_type: voiceType,
        voice_id: voiceId,
        voice_name: voiceName,
        status: "generating",
      })
      .select()
      .single();

    if (projectError) {
      console.error("[SMARTFLOW] Project creation error:", projectError);
      return new Response(JSON.stringify({ error: "Failed to create project" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[SMARTFLOW] Project created:", project.id);

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
      console.error("[SMARTFLOW] Generation creation error:", genError);
      return new Response(JSON.stringify({ error: "Failed to create generation" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[SMARTFLOW] Generation created:", generation.id);

    // ============= STEP 1: Analyze data and create infographic content =============
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const styleDesc = style === "custom" ? customStyle : STYLE_DESCRIPTIONS[style] || STYLE_DESCRIPTIONS.minimalist;
    const formatSpec = FORMAT_SPECS[format] || FORMAT_SPECS.square;

    const analysisPrompt = `You are an expert data analyst and infographic designer. Analyze the following data and create content for a single, stunning infographic image.

USER'S DATA SOURCE:
${dataSource}

USER'S EXTRACTION REQUEST:
${extractionPrompt}

Your task:
1. Extract the key insights, statistics, or information the user requested
2. Structure this information for a visually compelling infographic
3. Create a detailed image generation prompt for the infographic
4. Write a short narration script explaining the infographic (60-90 seconds when read aloud)

The infographic should be:
- Format: ${formatSpec.aspect} (${formatSpec.width}x${formatSpec.height}px)
- Style: ${styleDesc}
${brandMark ? `- Include brand mark: "${brandMark}" in bottom center` : ""}

Respond with a JSON object containing:
{
  "title": "Infographic title",
  "keyInsights": ["insight 1", "insight 2", ...],
  "imagePrompt": "Detailed prompt for image generation...",
  "narrationScript": "Script for voice narration..."
}`;

    console.log("[SMARTFLOW] Calling AI for analysis...");

    const analysisResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an expert data analyst and infographic designer. Always respond with valid JSON." },
          { role: "user", content: analysisPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      console.error("[SMARTFLOW] Analysis API error:", analysisResponse.status, errorText);
      throw new Error(`Analysis failed: ${analysisResponse.status}`);
    }

    const analysisData = await analysisResponse.json();
    let analysisResult;
    try {
      const content = analysisData.choices?.[0]?.message?.content || "";
      analysisResult = JSON.parse(content);
    } catch (e) {
      console.error("[SMARTFLOW] Failed to parse analysis result:", e);
      throw new Error("Failed to parse AI analysis");
    }

    console.log("[SMARTFLOW] Analysis complete:", analysisResult.title);

    // Update progress
    await supabase
      .from("generations")
      .update({ progress: 30, script: analysisResult.narrationScript })
      .eq("id", generation.id)
      .eq("user_id", user.id);

    // ============= STEP 2: Generate infographic image =============
    const imagePrompt = `Create a professional infographic image.

STYLE: ${styleDesc}
FORMAT: ${formatSpec.aspect} orientation, ${formatSpec.width}x${formatSpec.height}px

CONTENT TO VISUALIZE:
Title: ${analysisResult.title}
Key Information:
${analysisResult.keyInsights?.map((i: string, idx: number) => `${idx + 1}. ${i}`).join("\n")}

DESIGN REQUIREMENTS:
${analysisResult.imagePrompt}

${brandMark ? `WATERMARK: Add "${brandMark}" as a subtle brand mark in the bottom center of the image.` : ""}

Create a visually stunning, professional infographic that clearly communicates these insights. Use icons, charts, and visual elements appropriate for the style. Ensure text is readable and the layout is balanced.`;

    console.log("[SMARTFLOW] Generating infographic image...");

    const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: imagePrompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error("[SMARTFLOW] Image generation error:", imageResponse.status, errorText);
      throw new Error(`Image generation failed: ${imageResponse.status}`);
    }

    const imageData = await imageResponse.json();
    const imageBase64 = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageBase64) {
      console.error("[SMARTFLOW] No image in response");
      throw new Error("No image generated");
    }

    console.log("[SMARTFLOW] Image generated successfully");

    // Upload image to storage
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const imagePath = `${user.id}/${generation.id}/infographic.png`;

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { error: uploadError } = await adminClient.storage
      .from("audio")
      .upload(imagePath, imageBytes, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("[SMARTFLOW] Image upload error:", uploadError);
      throw new Error("Failed to upload image");
    }

    const { data: { publicUrl: imageUrl } } = adminClient.storage
      .from("audio")
      .getPublicUrl(imagePath);

    console.log("[SMARTFLOW] Image uploaded:", imageUrl);

    // Update progress
    await supabase
      .from("generations")
      .update({ progress: 60 })
      .eq("id", generation.id)
      .eq("user_id", user.id);

    // ============= STEP 3: Generate narration audio (if enabled) =============
    let audioUrl: string | null = null;
    let duration = 0;

    if (enableVoice && analysisResult.narrationScript) {
      console.log("[SMARTFLOW] Generating narration audio...");

      try {
        // Use Gemini TTS for narration
        const GOOGLE_TTS_API_KEY = Deno.env.get("GOOGLE_TTS_API_KEY");
        if (!GOOGLE_TTS_API_KEY) {
          throw new Error("GOOGLE_TTS_API_KEY not configured");
        }

        const voiceMap: Record<string, string> = {
          male: "Enceladus",
          female: "Kore",
        };

        const ttsResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GOOGLE_TTS_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: analysisResult.narrationScript }] }],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voiceMap[voiceGender] || "Kore" },
                  },
                },
              },
            }),
          }
        );

        if (ttsResponse.ok) {
          const ttsData = await ttsResponse.json();
          const audioBase64 = ttsData.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

          if (audioBase64) {
            // Decode and upload audio
            const audioBytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
            const audioPath = `${user.id}/${generation.id}/narration.mp3`;

            const { error: audioUploadError } = await adminClient.storage
              .from("audio")
              .upload(audioPath, audioBytes, {
                contentType: "audio/mpeg",
                upsert: true,
              });

            if (!audioUploadError) {
              const { data: { publicUrl } } = adminClient.storage
                .from("audio")
                .getPublicUrl(audioPath);
              audioUrl = publicUrl;
              
              // Estimate duration (roughly 150 words per minute)
              const wordCount = analysisResult.narrationScript.split(/\s+/).length;
              duration = Math.min(120, Math.ceil((wordCount / 150) * 60));
              
              console.log("[SMARTFLOW] Audio uploaded:", audioUrl, "duration:", duration);
            }
          }
        }
      } catch (audioError) {
        console.error("[SMARTFLOW] Audio generation error:", audioError);
        // Continue without audio
      }
    }

    // Update progress
    await supabase
      .from("generations")
      .update({ progress: 90 })
      .eq("id", generation.id)
      .eq("user_id", user.id);

    // ============= STEP 4: Finalize =============
    const scenes = [
      {
        id: 1,
        text: analysisResult.narrationScript || analysisResult.title,
        imageUrl,
        audioUrl,
        duration: duration || 10,
        title: analysisResult.title,
        keyInsights: analysisResult.keyInsights,
      },
    ];

    // Update generation as complete
    await supabase
      .from("generations")
      .update({
        status: "complete",
        progress: 100,
        completed_at: new Date().toISOString(),
        scenes,
        script: analysisResult.narrationScript,
        audio_url: audioUrl,
      })
      .eq("id", generation.id)
      .eq("user_id", user.id);

    // Update project status
    await supabase
      .from("projects")
      .update({
        title: analysisResult.title || `Smart Flow - ${new Date().toLocaleDateString()}`,
        status: "complete",
      })
      .eq("id", project.id)
      .eq("user_id", user.id);

    console.log("[SMARTFLOW] Generation complete!");

    return new Response(
      JSON.stringify({
        success: true,
        projectId: project.id,
        generationId: generation.id,
        title: analysisResult.title,
        imageUrl,
        audioUrl,
        script: analysisResult.narrationScript,
        keyInsights: analysisResult.keyInsights,
        scenes,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[SMARTFLOW] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
