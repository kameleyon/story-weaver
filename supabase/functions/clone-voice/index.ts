import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      console.error("Missing ELEVENLABS_API_KEY");
      return new Response(
        JSON.stringify({ error: "ElevenLabs API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Create Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { audioUrl, voiceName, description } = await req.json();

    if (!audioUrl || !voiceName) {
      return new Response(
        JSON.stringify({ error: "audioUrl and voiceName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Cloning voice for user ${user.id}: ${voiceName}`);
    console.log(`Audio URL: ${audioUrl}`);

    // Fetch the audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      console.error("Failed to fetch audio:", audioResponse.status);
      return new Response(
        JSON.stringify({ error: "Failed to fetch audio file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioBlob = await audioResponse.blob();
    console.log(`Audio file size: ${audioBlob.size} bytes, type: ${audioBlob.type}`);

    // Prepare multipart form data for ElevenLabs
    const formData = new FormData();
    formData.append("name", voiceName);
    formData.append("files", audioBlob, "voice_sample.mp3");
    if (description) {
      formData.append("description", description);
    }

    // Call ElevenLabs Instant Voice Cloning API
    console.log("Calling ElevenLabs API...");
    const elevenLabsResponse = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      console.error("ElevenLabs API error:", elevenLabsResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `ElevenLabs API error: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const elevenLabsResult = await elevenLabsResponse.json();
    const voiceId = elevenLabsResult.voice_id;
    console.log(`Voice cloned successfully! Voice ID: ${voiceId}`);

    // Insert into user_voices table
    const { data: insertData, error: insertError } = await supabaseAdmin
      .from("user_voices")
      .insert({
        user_id: user.id,
        voice_name: voiceName,
        voice_id: voiceId,
        sample_url: audioUrl,
        description: description || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save voice to database" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Voice saved to database:", insertData.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        voiceId, 
        voice: insertData 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Clone voice error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
