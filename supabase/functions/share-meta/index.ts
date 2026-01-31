import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    if (!token) {
      return new Response("Missing share token", { status: 400 });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch shared project data using the RPC function
    const { data, error } = await supabase.rpc("get_shared_project", {
      share_token_param: token,
    });

    if (error || !data) {
      console.error("Error fetching share:", error);
      return new Response(getDefaultHtml(token), {
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      });
    }

    const shareData = data as ShareData;
    const project = shareData.project;
    const scenes = shareData.scenes || [];

    // Get thumbnail from first scene
    const firstScene = scenes[0];
    const thumbnailUrl = firstScene?.imageUrls?.[0] || firstScene?.imageUrl || "";

    // Get snippet from first scene narration or project description
    const snippet = project.description || 
      firstScene?.narration?.slice(0, 150) || 
      "Watch this AI-generated video created with MotionMax";

    // Build the share page URL
    const sharePageUrl = `https://motionmax.io/share/${token}`;
    const siteUrl = "https://motionmax.io";

    // Generate HTML with OG meta tags
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(project.title)} | MotionMax</title>
  
  <!-- Primary Meta Tags -->
  <meta name="title" content="${escapeHtml(project.title)} | MotionMax">
  <meta name="description" content="${escapeHtml(snippet)}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="video.other">
  <meta property="og:url" content="${sharePageUrl}">
  <meta property="og:title" content="${escapeHtml(project.title)}">
  <meta property="og:description" content="${escapeHtml(snippet)}">
  ${thumbnailUrl ? `<meta property="og:image" content="${escapeHtml(thumbnailUrl)}">` : `<meta property="og:image" content="${siteUrl}/og-image.png">`}
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="MotionMax">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${sharePageUrl}">
  <meta name="twitter:title" content="${escapeHtml(project.title)}">
  <meta name="twitter:description" content="${escapeHtml(snippet)}">
  ${thumbnailUrl ? `<meta name="twitter:image" content="${escapeHtml(thumbnailUrl)}">` : `<meta name="twitter:image" content="${siteUrl}/og-image.png">`}
  
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
    a {
      color: #2D9A8C;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="loading">
    <p>Loading...</p>
    <p><a href="${sharePageUrl}">Click here if you're not redirected</a></p>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { ...corsHeaders, "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("Share meta error:", error);
    return new Response("Internal server error", { status: 500 });
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
  const sharePageUrl = `https://motionmax.io/share/${token}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MotionMax Video</title>
  <meta property="og:title" content="MotionMax Video">
  <meta property="og:description" content="Watch this AI-generated video created with MotionMax">
  <meta property="og:image" content="https://motionmax.io/og-image.png">
  <meta property="og:url" content="${sharePageUrl}">
  <meta http-equiv="refresh" content="0;url=${sharePageUrl}">
</head>
<body>
  <p>Redirecting...</p>
</body>
</html>`;
}
