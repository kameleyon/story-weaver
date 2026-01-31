import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const generationId = url.searchParams.get("id");
    const userAgent = req.headers.get("user-agent") || "";
    const isBot = /bot|googlebot|crawler|spider|robot|crawling|facebookexternalhit/i.test(userAgent);

    console.log(`[Share-Meta] Request for ID: ${generationId} | User-Agent: ${userAgent}`);

    if (!generationId) {
      return Response.redirect("https://motionmax.io", 302);
    }

    // 1. Setup Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Fetch Data
    const { data: generation, error } = await supabase
      .from("generations")
      .select(`
        id,
        scenes,
        projects ( title )
      `)
      .eq("id", generationId)
      .maybeSingle();

    if (error || !generation) {
      console.error("[Share-Meta] DB Error:", error);
      return Response.redirect(`https://motionmax.io/share/${generationId}`, 302);
    }

    // 3. Extract Metadata (Safely)
    // Handle projects as either object or array depending on join result
    const projectData = generation.projects as unknown;
    let projectTitle: string | undefined;
    if (Array.isArray(projectData) && projectData.length > 0) {
      projectTitle = projectData[0]?.title;
    } else if (projectData && typeof projectData === 'object') {
      projectTitle = (projectData as { title?: string }).title;
    }
    
    const title = projectTitle 
      ? `${projectTitle} | MotionMax` 
      : "Watch this video on MotionMax";
    
    let description = "AI-generated video presentation.";
    let imageUrl = "https://motionmax.io/og-image.png";

    // --- ROBUST JSON PARSING FIX ---
    let scenes = generation.scenes;
    
    // Fix: Sometimes Supabase returns JSONB as a string if using specific drivers
    if (typeof scenes === 'string') {
      try { scenes = JSON.parse(scenes); } catch (e) { console.error("[Share-Meta] JSON parse fail", e); }
    }

    if (Array.isArray(scenes) && scenes.length > 0) {
      const first = scenes[0];
      
      console.log(`[Share-Meta] First scene keys: ${Object.keys(first).join(', ')}`);
      
      // 1. Get Image (Prioritize valid URLs)
      if (first.imageUrl && first.imageUrl.startsWith("http")) {
        imageUrl = first.imageUrl;
        console.log(`[Share-Meta] Using imageUrl: ${imageUrl}`);
      } else if (Array.isArray(first.imageUrls) && first.imageUrls.length > 0) {
        if (first.imageUrls[0].startsWith("http")) {
          imageUrl = first.imageUrls[0];
          console.log(`[Share-Meta] Using imageUrls[0]: ${imageUrl}`);
        }
      }

      // 2. Get Description (Snippet)
      if (first.voiceover) {
        const text = first.voiceover.replace(/[^\w\s.,?!]/g, ' ').replace(/\s+/g, ' ').trim();
        description = text.length > 150 ? text.substring(0, 150) + "..." : text;
      }
    }

    // Ensure URL is absolute
    const finalUrl = `https://motionmax.io/share/${generationId}`;
    
    console.log(`[Share-Meta] Resolved: Title="${title}" | Image="${imageUrl}"`);

    // 4. Generate HTML
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    
    <meta property="og:type" content="video.other">
    <meta property="og:url" content="${finalUrl}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="MotionMax">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${finalUrl}">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${imageUrl}">
    
    <meta http-equiv="refresh" content="0;url=${finalUrl}">
    <link rel="canonical" href="${finalUrl}">
    
    <style>
      body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0F1112; color: #fff; }
      h1 { font-size: 1.5rem; margin: 1rem 0; }
      p { color: #888; }
      a { color: #2D9A8C; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>
    <p>Redirecting to app...</p>
    <a href="${finalUrl}">Click to watch</a>
  </body>
</html>`;

    return new Response(html, {
      headers: { ...corsHeaders, "Content-Type": "text/html" },
    });

  } catch (e: any) {
    console.error("[Share-Meta] Fatal:", e);
    return Response.redirect("https://motionmax.io", 302);
  }
});

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
