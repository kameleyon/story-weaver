import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  // 1. Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const generationId = url.searchParams.get("id");
    const debug = url.searchParams.get("debug") === "true"; // ?debug=true to see data without redirect
    const v = url.searchParams.get("v") || Date.now().toString();

    console.log(
      `[Share-Meta] Request token=${token ?? ""} id=${generationId ?? ""} debug=${debug} v=${v}`,
    );

    if (!token && !generationId) {
      return Response.redirect("https://motionmax.io", 302);
    }

    // 2. Initialize Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Fetch share data
    let title = "MotionMax Video";
    let description = "Watch this AI-generated story.";
    let imageUrl = "https://motionmax.io/og-image.png";
    let appUrl = "https://motionmax.io";

    let scenes: unknown = undefined;

    if (token) {
      // Token-based share (matches /share/:token route)
      const { data: shared, error: sharedError } = await supabase.rpc(
        "get_shared_project",
        { share_token_param: token },
      );

      if (sharedError || !shared) {
        console.error("[Share-Meta] Share token not found:", token, sharedError);
        return Response.redirect("https://motionmax.io", 302);
      }

      const sharedAny = shared as any;
      const projectTitle = sharedAny?.project?.title as string | undefined;
      title = projectTitle ? `${projectTitle} | MotionMax` : "MotionMax Video | MotionMax";
      scenes = sharedAny?.scenes;
      appUrl = `https://motionmax.io/share/${token}`;
    } else if (generationId) {
      // Fallback: generation-id based (kept for testing)
      const { data: generation, error: genError } = await supabase
        .from("generations")
        .select(`id, scenes, projects(title)`)
        .eq("id", generationId)
        .maybeSingle();

      if (genError || !generation) {
        console.error("[Share-Meta] Generation not found:", generationId, genError);
        return Response.redirect("https://motionmax.io", 302);
      }

      const projectData = generation.projects as unknown;
      let projectTitle: string | undefined;
      if (Array.isArray(projectData) && projectData.length > 0) {
        projectTitle = projectData[0]?.title;
      } else if (projectData && typeof projectData === "object") {
        projectTitle = (projectData as { title?: string }).title;
      }

      title = projectTitle ? `${projectTitle} | MotionMax` : "MotionMax Video | MotionMax";
      scenes = generation.scenes;
      appUrl = `https://motionmax.io/share/${generationId}`;
    }

    // Parse Scenes safely
    if (typeof scenes === "string") {
      try {
        scenes = JSON.parse(scenes);
      } catch (e) {
        console.error("[Share-Meta] JSON parse fail", e);
      }
    }

    if (Array.isArray(scenes) && scenes.length > 0) {
      const first = scenes[0] as any;

      console.log(`[Share-Meta] First scene keys: ${Object.keys(first ?? {}).join(", ")}`);

      // Get Image (Check both single and array)
      if (first?.imageUrl?.startsWith("http")) {
        imageUrl = first.imageUrl;
        console.log(`[Share-Meta] Using imageUrl: ${imageUrl}`);
      } else if (first?.imageUrls?.[0]?.startsWith("http")) {
        imageUrl = first.imageUrls[0];
        console.log(`[Share-Meta] Using imageUrls[0]: ${imageUrl}`);
      }

      // Get Snippet (Script)
      if (typeof first?.voiceover === "string" && first.voiceover.length > 0) {
        description = first.voiceover
          .substring(0, 160)
          .replace(/\s+/g, " ")
          .trim() + "...";
      }
    }

    const cacheBustedImageUrl = withCacheBust(imageUrl, v);

    console.log(`[Share-Meta] Resolved: Title="${title}" | Image="${imageUrl}" | AppUrl="${appUrl}"`);

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
    <meta property="og:image" content="${cacheBustedImageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:site_name" content="MotionMax">
    
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)} | MotionMax">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${cacheBustedImageUrl}">

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
          <img src="${cacheBustedImageUrl}" alt="Thumbnail" onerror="this.style.display='none'">
         <div class="debug-info">
           <p><strong>Title:</strong> <code>${escapeHtml(title)}</code></p>
           <p><strong>Description:</strong> <code>${escapeHtml(description)}</code></p>
           <p><strong>Image URL:</strong> <code>${imageUrl}</code></p>
           <p><strong>Image URL (busted):</strong> <code>${cacheBustedImageUrl}</code></p>
           <p><strong>App URL:</strong> <code>${appUrl}</code></p>
         </div>
         <p style="margin-top: 1rem;"><a href="${appUrl}">→ Go to App</a></p>`
      : `<p>Redirecting to MotionMax...</p>
         <a href="${appUrl}">Click here if not redirected</a>`
    }
  </body>
</html>`;

    return new Response(html, { 
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
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

function withCacheBust(url: string, v: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("v", v);
    return parsed.toString();
  } catch {
    return url;
  }
}
