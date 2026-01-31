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
    const debug = url.searchParams.get("debug") === "true"; // ?debug=true to see data without redirect

    console.log(`[Share-Meta] Request for ID: ${generationId} | Debug: ${debug}`);

    if (!generationId) {
      return Response.redirect("https://motionmax.io", 302);
    }

    // 2. Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Fetch specific video data
    const { data: generation, error } = await supabase
      .from("generations")
      .select(`id, scenes, projects(title)`)
      .eq("id", generationId)
      .maybeSingle();

    if (error || !generation) {
      console.error("[Share-Meta] Not found:", generationId, error);
      return Response.redirect("https://motionmax.io", 302);
    }

    // 4. Extract Metadata
    // Handle projects as either object or array depending on join result
    const projectData = generation.projects as unknown;
    let projectTitle: string | undefined;
    if (Array.isArray(projectData) && projectData.length > 0) {
      projectTitle = projectData[0]?.title;
    } else if (projectData && typeof projectData === 'object') {
      projectTitle = (projectData as { title?: string }).title;
    }

    let title = projectTitle || "MotionMax Video";
    let description = "Watch this AI-generated story.";
    let imageUrl = "https://motionmax.io/og-image.png"; // Fallback

    // Parse Scenes safely
    let scenes = generation.scenes;
    if (typeof scenes === 'string') {
      try { scenes = JSON.parse(scenes); } catch (e) { console.error("[Share-Meta] JSON parse fail", e); }
    }

    if (Array.isArray(scenes) && scenes.length > 0) {
      const first = scenes[0];
      
      console.log(`[Share-Meta] First scene keys: ${Object.keys(first).join(', ')}`);
      
      // Get Image (Check both single and array)
      if (first.imageUrl?.startsWith("http")) {
        imageUrl = first.imageUrl;
        console.log(`[Share-Meta] Using imageUrl: ${imageUrl}`);
      } else if (first.imageUrls?.[0]?.startsWith("http")) {
        imageUrl = first.imageUrls[0];
        console.log(`[Share-Meta] Using imageUrls[0]: ${imageUrl}`);
      }

      // Get Snippet (Script)
      if (first.voiceover) {
        description = first.voiceover.substring(0, 160).replace(/\s+/g, ' ').trim() + "...";
      }
    }

    const appUrl = `https://motionmax.io/share/${generationId}`;

    console.log(`[Share-Meta] Resolved: Title="${title}" | Image="${imageUrl}"`);

    // 5. Return HTML (Bot Friendly)
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} | MotionMax</title>
    <meta name="description" content="${escapeHtml(description)}">
    
    <meta property="og:type" content="video.other">
    <meta property="og:url" content="${appUrl}">
    <meta property="og:title" content="${escapeHtml(title)} | MotionMax">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="MotionMax">
    
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)} | MotionMax">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${imageUrl}">

    ${!debug ? `<meta http-equiv="refresh" content="0;url=${appUrl}">` : ''}
    <link rel="canonical" href="${appUrl}">
    
    <style>
      body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0F1112; color: #fff; text-align: center; padding: 1rem; }
      h1 { font-size: 1.5rem; margin: 1rem 0; color: #2D9A8C; }
      p { color: #888; max-width: 600px; }
      a { color: #2D9A8C; text-decoration: none; }
      img { max-width: 400px; border-radius: 8px; margin: 1rem 0; }
      .debug-info { background: #1a1a1a; padding: 1rem; border-radius: 8px; text-align: left; max-width: 600px; margin-top: 1rem; }
      .debug-info code { color: #4ade80; word-break: break-all; }
    </style>
  </head>
  <body>
    ${debug 
      ? `<h1>🔍 Debug Mode</h1>
         <img src="${imageUrl}" alt="Thumbnail" onerror="this.style.display='none'">
         <div class="debug-info">
           <p><strong>Title:</strong> <code>${escapeHtml(title)}</code></p>
           <p><strong>Description:</strong> <code>${escapeHtml(description)}</code></p>
           <p><strong>Image URL:</strong> <code>${imageUrl}</code></p>
           <p><strong>App URL:</strong> <code>${appUrl}</code></p>
         </div>
         <p style="margin-top: 1rem;"><a href="${appUrl}">→ Go to App</a></p>`
      : `<p>Redirecting to MotionMax...</p>
         <a href="${appUrl}">Click here if not redirected</a>`
    }
  </body>
</html>`;

    return new Response(html, { 
      headers: { ...corsHeaders, "Content-Type": "text/html" } 
    });

  } catch (e: any) {
    console.error("[Share-Meta] Fatal error:", e);
    return Response.redirect("https://motionmax.io", 302);
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
