import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_BASE_URL = "https://motionmax.io";

interface ShareData {
  project: {
    id: string;
    title: string;
    description: string | null;
    format: string;
    style: string;
  };
  scenes: Array<{
    imageUrl?: string;
    imageUrls?: string[];
    narration?: string;
  }>;
  share: {
    id: string;
    view_count: number;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    // Initialize Supabase client with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase Environment Variables");
      return new Response(getDefaultHtml(token || ""), {
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      });
    }

    if (!token) {
      console.error("Missing share token");
      return new Response(getDefaultHtml(""), {
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch shared project data using the RPC function
    const { data, error } = await supabase.rpc("get_shared_project", {
      share_token_param: token,
    });

    if (error) {
      console.error("Supabase RPC Error:", error);
      return new Response(getDefaultHtml(token), {
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      });
    }

    if (!data) {
      console.error("No data returned for token:", token);
      return new Response(getDefaultHtml(token), {
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      });
    }

    const shareData = data as ShareData;
    const project = shareData.project;
    const scenes = shareData.scenes;

    // Extract title with fallback
    const title = project?.title || "MotionMax Video";

    // Extract thumbnail from first scene with robust fallback logic
    let thumbnailUrl = `${APP_BASE_URL}/og-image.png`;

    if (Array.isArray(scenes) && scenes.length > 0) {
      const firstScene = scenes[0];

      // Priority 1: Direct imageUrl that is a valid absolute URL
      if (firstScene?.imageUrl && typeof firstScene.imageUrl === 'string' && firstScene.imageUrl.startsWith('http')) {
        thumbnailUrl = firstScene.imageUrl;
      }
      // Priority 2: First image in imageUrls array
      else if (firstScene?.imageUrls && Array.isArray(firstScene.imageUrls) && firstScene.imageUrls.length > 0) {
        const firstImageUrl = firstScene.imageUrls[0];
        if (typeof firstImageUrl === 'string' && firstImageUrl.startsWith('http')) {
          thumbnailUrl = firstImageUrl;
        }
      }
    }

    // Get snippet from first scene narration or project description
    const snippet = project?.description ||
      (Array.isArray(scenes) && scenes.length > 0 && scenes[0]?.narration
        ? scenes[0].narration.slice(0, 150)
        : "Watch this AI-generated video created with MotionMax");

    // Build the share page URL (where users will be redirected)
    const sharePageUrl = `${APP_BASE_URL}/share/${token}`;

    console.log("Serving OG meta for:", { token, title, thumbnailUrl, sharePageUrl });

    // Generate HTML with OG meta tags
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | MotionMax</title>
  
  <!-- Primary Meta Tags -->
  <meta name="title" content="${escapeHtml(title)} | MotionMax">
  <meta name="description" content="${escapeHtml(snippet)}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="video.other">
  <meta property="og:url" content="${sharePageUrl}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(snippet)}">
  <meta property="og:image" content="${escapeHtml(thumbnailUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="MotionMax">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${sharePageUrl}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(snippet)}">
  <meta name="twitter:image" content="${escapeHtml(thumbnailUrl)}">
  
  <!-- Redirect to actual share page -->
  <meta http-equiv="refresh" content="0;url=${sharePageUrl}">
  <link rel="canonical" href="${sharePageUrl}">
  
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #0F1112;
      color: #fff;
    }
    .loading {
      text-align: center;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }
    a {
      color: #2D9A8C;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="loading">
    <h1>${escapeHtml(title)}</h1>
    <p>Redirecting to MotionMax...</p>
    <p><a href="${sharePageUrl}">Click here if not redirected</a></p>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { ...corsHeaders, "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("Share meta error:", error);
    return new Response(getDefaultHtml(""), {
      headers: { ...corsHeaders, "Content-Type": "text/html" },
    });
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getDefaultHtml(token: string): string {
  const sharePageUrl = token ? `${APP_BASE_URL}/share/${token}` : APP_BASE_URL;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MotionMax Video</title>
  
  <meta name="description" content="Watch this AI-generated video created with MotionMax">
  
  <meta property="og:type" content="video.other">
  <meta property="og:title" content="MotionMax Video">
  <meta property="og:description" content="Watch this AI-generated video created with MotionMax">
  <meta property="og:image" content="${APP_BASE_URL}/og-image.png">
  <meta property="og:url" content="${sharePageUrl}">
  <meta property="og:site_name" content="MotionMax">
  
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="MotionMax Video">
  <meta name="twitter:description" content="Watch this AI-generated video created with MotionMax">
  <meta name="twitter:image" content="${APP_BASE_URL}/og-image.png">
  
  <meta http-equiv="refresh" content="0;url=${sharePageUrl}">
  
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #0F1112;
      color: #fff;
    }
  </style>
</head>
<body>
  <p>Redirecting...</p>
</body>
</html>`;
}
