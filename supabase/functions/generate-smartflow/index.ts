import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============= INPUT VALIDATION =============
const INPUT_LIMITS = {
  dataSource: 250000,
  extractionPrompt: 2000,
  style: 50,
  customStyle: 2000,
  format: 20,
  brandMark: 500,
  voiceId: 200,
  voiceName: 200,
};

const ALLOWED_FORMATS = ["landscape", "portrait", "square"] as const;
const ALLOWED_STYLES = ["minimalist", "doodle", "stick", "realistic", "storybook", "caricature", "sketch", "crayon", "custom"] as const;

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

// ============= STYLE DESCRIPTIONS (consistent with generate-video) =============
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

// ============= FORMAT MAPPING (consistent with generate-video) =============
const FORMAT_SPECS: Record<string, { aspectRatio: string; description: string }> = {
  portrait: { aspectRatio: "9:16", description: "VERTICAL 9:16 portrait orientation - tall and narrow like a phone screen" },
  square: { aspectRatio: "1:1", description: "SQUARE 1:1 orientation - equal width and height" },
  landscape: { aspectRatio: "16:9", description: "HORIZONTAL 16:9 landscape orientation - wide like a TV screen" },
};

// ============= IMAGE GENERATION VIA REPLICATE (consistent with generate-video) =============
async function generateImageWithReplicate(
  prompt: string,
  replicateApiKey: string,
  format: string,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  const aspectRatio = FORMAT_SPECS[format]?.aspectRatio || "1:1";

  try {
    console.log(`[SMARTFLOW-IMG] Generating image with Replicate nano-banana, aspect_ratio: ${aspectRatio}`);

    const createResponse = await fetch("https://api.replicate.com/v1/models/google/nano-banana/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateApiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: aspectRatio,
          output_format: "png",
        },
      }),
    });

    if (!createResponse.ok) {
      const errText = await createResponse.text().catch(() => "");
      console.error(`[SMARTFLOW-IMG] Replicate create failed: ${createResponse.status} - ${errText}`);
      return { ok: false, error: `Replicate failed: ${createResponse.status}` };
    }

    const result = await createResponse.json();
    const outputUrl = result.output;

    if (!outputUrl) {
      console.error("[SMARTFLOW-IMG] No output URL in response");
      return { ok: false, error: "No image URL returned" };
    }

    // Fetch the actual image bytes
    const imageResponse = await fetch(outputUrl);
    if (!imageResponse.ok) {
      return { ok: false, error: "Failed to fetch generated image" };
    }

    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    console.log(`[SMARTFLOW-IMG] Image generated successfully, ${bytes.length} bytes`);
    return { ok: true, bytes };
  } catch (err) {
    console.error("[SMARTFLOW-IMG] Error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ============= TTS VIA REPLICATE CHATTERBOX (consistent with generate-video) =============
async function generateAudioWithReplicate(
  text: string,
  replicateApiKey: string,
  voiceGender: string,
): Promise<{ ok: true; bytes: Uint8Array; durationSeconds: number } | { ok: false; error: string }> {
  // Use speaker names that work with chatterbox-turbo
  const speakerText = voiceGender === "male" ? "Aaron" : "Marisol";

  try {
    console.log(`[SMARTFLOW-TTS] Generating audio with Replicate chatterbox, voice: ${speakerText}`);

    const response = await fetch("https://api.replicate.com/v1/models/resemble-ai/chatterbox-turbo/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateApiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: {
          text,
          speaker: speakerText,
          exaggeration: 0.4,
          cfg_weight: 0.5,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`[SMARTFLOW-TTS] Replicate TTS failed: ${response.status} - ${errText}`);
      return { ok: false, error: `TTS failed: ${response.status}` };
    }

    const result = await response.json();
    const audioUrl = result.output;

    if (!audioUrl) {
      return { ok: false, error: "No audio URL returned" };
    }

    // Fetch the actual audio bytes
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return { ok: false, error: "Failed to fetch generated audio" };
    }

    const bytes = new Uint8Array(await audioResponse.arrayBuffer());
    // Estimate duration (MP3 at ~128kbps ≈ 16KB/sec)
    const durationSeconds = Math.max(1, Math.round(bytes.length / 16000));
    
    console.log(`[SMARTFLOW-TTS] Audio generated successfully, ${bytes.length} bytes, ~${durationSeconds}s`);
    return { ok: true, bytes, durationSeconds };
  } catch (err) {
    console.error("[SMARTFLOW-TTS] Error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

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

    // Get Replicate API key (same as generate-video)
    const replicateApiKey = Deno.env.get("REPLICATE_TTS_API_KEY");
    if (!replicateApiKey) {
      return new Response(JSON.stringify({ error: "REPLICATE_TTS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Parse and validate request body
    const body = await req.json();
    const phase = body.phase || "generate";

    // ============= REGENERATE IMAGE =============
    if (phase === "regenerate-image") {
      const generationId = body.generationId;
      const imagePromptOverride = validateString(body.imagePrompt, "imagePrompt", 5000);
      const format = validateEnum(body.format, "format", ALLOWED_FORMATS) || "square";
      const style = validateEnum(body.style, "style", ALLOWED_STYLES) || "minimalist";
      const customStyle = validateString(body.customStyle, "customStyle", INPUT_LIMITS.customStyle);
      const brandMark = validateString(body.brandMark, "brandMark", INPUT_LIMITS.brandMark);

      if (!generationId || !imagePromptOverride) {
        return new Response(JSON.stringify({ error: "Missing generationId or imagePrompt" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("[SMARTFLOW] Regenerating image for generation:", generationId);

      const styleDesc = style === "custom" ? customStyle : STYLE_DESCRIPTIONS[style] || STYLE_DESCRIPTIONS.minimalist;
      const formatSpec = FORMAT_SPECS[format] || FORMAT_SPECS.square;

      const imagePrompt = `Create a professional infographic visualization.

${formatSpec.description}

STYLE: ${styleDesc}

USER'S MODIFICATION REQUEST:
${imagePromptOverride}

${brandMark ? `Include subtle brand watermark: "${brandMark}" in the bottom center.` : ""}

Create a stunning, professional infographic with clear visual hierarchy, readable text, and balanced composition.`;

      // Generate with Replicate nano-banana
      const imageResult = await generateImageWithReplicate(imagePrompt, replicateApiKey, format);
      
      if (!imageResult.ok) {
        throw new Error(imageResult.error);
      }

      const imagePath = `${user.id}/${generationId}/infographic.png`;
      const { error: uploadError } = await adminClient.storage
        .from("audio")
        .upload(imagePath, imageResult.bytes, { contentType: "image/png", upsert: true });

      if (uploadError) {
        throw new Error("Failed to upload regenerated image");
      }

      const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
        .from("audio")
        .createSignedUrl(imagePath, 60 * 60 * 24 * 365);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        throw new Error("Failed to create signed URL");
      }

      console.log("[SMARTFLOW] Image regenerated successfully:", signedUrlData.signedUrl);

      return new Response(
        JSON.stringify({ success: true, imageUrl: signedUrlData.signedUrl }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= REGENERATE AUDIO =============
    if (phase === "regenerate-audio") {
      const generationId = body.generationId;
      const script = validateString(body.script, "script", 10000);
      const voiceGender = body.voiceGender || "female";

      if (!generationId || !script) {
        return new Response(JSON.stringify({ error: "Missing generationId or script" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("[SMARTFLOW] Regenerating audio for generation:", generationId);

      const audioResult = await generateAudioWithReplicate(script, replicateApiKey, voiceGender);
      
      if (!audioResult.ok) {
        throw new Error(audioResult.error);
      }

      const audioPath = `${user.id}/${generationId}/narration.mp3`;
      const { error: audioUploadError } = await adminClient.storage
        .from("audio")
        .upload(audioPath, audioResult.bytes, { contentType: "audio/mpeg", upsert: true });

      if (audioUploadError) {
        throw new Error("Failed to upload regenerated audio");
      }

      const { data: audioSignedData, error: audioSignedError } = await adminClient.storage
        .from("audio")
        .createSignedUrl(audioPath, 60 * 60 * 24 * 365);

      if (audioSignedError || !audioSignedData?.signedUrl) {
        throw new Error("Failed to create signed URL for audio");
      }

      // Update generation record
      await supabase
        .from("generations")
        .update({ script, audio_url: audioSignedData.signedUrl })
        .eq("id", generationId)
        .eq("user_id", user.id);

      console.log("[SMARTFLOW] Audio regenerated successfully:", audioSignedData.signedUrl);

      return new Response(
        JSON.stringify({ success: true, audioUrl: audioSignedData.signedUrl }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============= NORMAL GENERATION FLOW =============
    const dataSource = validateString(body.dataSource, "dataSource", INPUT_LIMITS.dataSource);
    const extractionPrompt = validateString(body.extractionPrompt, "extractionPrompt", INPUT_LIMITS.extractionPrompt);
    const style = validateEnum(body.style, "style", ALLOWED_STYLES) || "minimalist";
    const customStyle = validateString(body.customStyle, "customStyle", INPUT_LIMITS.customStyle);
    const format = validateEnum(body.format, "format", ALLOWED_FORMATS) || "square";
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

    // ============= STEP 1: Analyze data with Lovable AI =============
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
4. Write a comprehensive, engaging narration script explaining the infographic in depth (aim for 3-5 minutes when read aloud, approximately 500-800 words). Cover all key insights with context, examples, and actionable takeaways.

The infographic should be:
- Format: ${formatSpec.description}
- Style: ${styleDesc}
${brandMark ? `- Include brand mark: "${brandMark}" in bottom center` : ""}

Respond with a JSON object containing:
{
  "title": "Infographic title",
  "keyInsights": ["insight 1", "insight 2", ...],
  "imagePrompt": "Detailed prompt for image generation describing layout, visual elements, icons, colors, and composition...",
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

    // ============= STEP 2: Generate infographic image with Replicate =============
    const imagePrompt = `Create a professional infographic visualization.

${formatSpec.description}

STYLE: ${styleDesc}

CONTENT TO VISUALIZE:
Title: ${analysisResult.title}
Key Information:
${analysisResult.keyInsights?.map((i: string, idx: number) => `${idx + 1}. ${i}`).join("\n")}

DESIGN REQUIREMENTS:
${analysisResult.imagePrompt}

${brandMark ? `Include subtle brand watermark: "${brandMark}" in the bottom center.` : ""}

Create a stunning, professional infographic with clear visual hierarchy, readable text, icons, charts, and balanced composition.`;

    console.log("[SMARTFLOW] Generating infographic image with Replicate...");

    const imageResult = await generateImageWithReplicate(imagePrompt, replicateApiKey, format);

    if (!imageResult.ok) {
      console.error("[SMARTFLOW] Image generation failed:", imageResult.error);
      throw new Error(imageResult.error);
    }

    console.log("[SMARTFLOW] Image generated successfully");

    // Upload image to storage
    const imagePath = `${user.id}/${generation.id}/infographic.png`;
    const { error: uploadError } = await adminClient.storage
      .from("audio")
      .upload(imagePath, imageResult.bytes, { contentType: "image/png", upsert: true });

    if (uploadError) {
      console.error("[SMARTFLOW] Image upload error:", uploadError);
      throw new Error("Failed to upload image");
    }

    // Create signed URL
    const { data: signedUrlData, error: signedUrlError } = await adminClient.storage
      .from("audio")
      .createSignedUrl(imagePath, 60 * 60 * 24 * 365);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("[SMARTFLOW] Signed URL error:", signedUrlError);
      throw new Error("Failed to create signed URL");
    }

    const imageUrl = signedUrlData.signedUrl;
    console.log("[SMARTFLOW] Image uploaded:", imageUrl);

    // Update progress
    await supabase
      .from("generations")
      .update({ progress: 60 })
      .eq("id", generation.id)
      .eq("user_id", user.id);

    // ============= STEP 3: Generate narration audio with Replicate (if enabled) =============
    let audioUrl: string | null = null;
    let duration = 0;

    if (enableVoice && analysisResult.narrationScript) {
      console.log("[SMARTFLOW] Generating narration audio with Replicate...");

      try {
        const audioResult = await generateAudioWithReplicate(
          analysisResult.narrationScript,
          replicateApiKey,
          voiceGender
        );

        if (audioResult.ok) {
          const audioPath = `${user.id}/${generation.id}/narration.mp3`;
          const { error: audioUploadError } = await adminClient.storage
            .from("audio")
            .upload(audioPath, audioResult.bytes, { contentType: "audio/mpeg", upsert: true });

          if (!audioUploadError) {
            const { data: audioSignedData } = await adminClient.storage
              .from("audio")
              .createSignedUrl(audioPath, 60 * 60 * 24 * 365);

            audioUrl = audioSignedData?.signedUrl || null;
            duration = audioResult.durationSeconds;

            console.log("[SMARTFLOW] Audio uploaded:", audioUrl, "duration:", duration);
          }
        } else {
          console.error("[SMARTFLOW] Audio generation failed:", audioResult.error);
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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[SMARTFLOW] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
