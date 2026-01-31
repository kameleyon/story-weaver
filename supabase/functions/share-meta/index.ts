import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // 1. Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const generationId = url.searchParams.get("id");

    console.log("Share request for Generation ID:", generationId);

    if (!generationId) {
      return new Response("Missing ID", { status: 400 });
    }

    // 2. Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Fetch Generation Data (Title, Scenes for Image/Script)
    const { data: generation, error } = await supabase
      .from("generations")
      .select(`
        id,
        scenes,
        projects (
          title
        )
      `)
      .eq("id", generationId)
      .maybeSingle();

    if (error || !generation) {
      console.error("Database Error or Not Found:", error);
      // Fallback to main site if ID is wrong
      return Response.redirect("https://motionmax.io", 302);
    }

    // 4. Extract Metadata
    
    // A. Title - handle projects as either object or array depending on join result
    const projectData = generation.projects as unknown;
    let projectTitle: string | undefined;
    if (Array.isArray(projectData) && projectData.length > 0) {
      projectTitle = projectData[0]?.title;
    } else if (projectData && typeof projectData === 'object') {
      projectTitle = (projectData as { title?: string }).title;
    }
    const title = projectTitle 
      ? `${projectTitle} | MotionMax` 
      : "Check out this video | MotionMax";

    // B. Parse Scenes to get Thumbnail and Snippet
    let imageUrl = "https://motionmax.io/og-image.png"; // Default
    let description = "Watch this AI-generated video story created with MotionMax."; // Default

    const scenes = generation.scenes;
    
    if (Array.isArray(scenes) && scenes.length > 0) {
      const firstScene = scenes[0];

      // Extract Image
      if (firstScene.imageUrl && firstScene.imageUrl.startsWith("http")) {
        imageUrl = firstScene.imageUrl;
      } else if (firstScene.imageUrls?.[0]?.startsWith("http")) {
        imageUrl = firstScene.imageUrls[0];
      }

      // Extract Snippet (Script/Voiceover)
      if (firstScene.voiceover) {
        // Create a 160-char snippet
        description = firstScene.voiceover.substring(0, 160).replace(/\s+/g, ' ').trim() + "...";
      }
    }

    const videoUrl = `https://motionmax.io/share/${generationId}`;
    const siteName = "MotionMax";

    console.log("Serving Meta:", { title, imageUrl, description });

    // 5. Generate the HTML response
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta property="og:type" content="video.other">
    <meta property="og:url" content="${videoUrl}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="${siteName}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${videoUrl}">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${imageUrl}">
    <meta http-equiv="refresh" content="0;url=${videoUrl}">
    <link rel="canonical" href="${videoUrl}">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #0F1112;
            color: #fff;
            text-align: center;
        }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
        p { color: #888; margin: 0.5rem 0; }
        a { color: #2D9A8C; text-decoration: none; }
    </style>
</head>
<body>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <br>
    <p>Redirecting to MotionMax...</p>
    <a href="${videoUrl}">Click here if not redirected</a>
</body>
</html>`;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });

  } catch (error: any) {
    console.error("Function Error:", error.message);
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, "Location": "https://motionmax.io" },
    });
  }
});

// Helper to prevent breaking HTML with special chars
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
