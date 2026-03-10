import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Verify caller is admin
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: user.id });
  if (!isAdmin) {
    return new Response("Forbidden - admin only", { status: 403 });
  }

  const url = new URL(req.url);
  const bucket = url.searchParams.get("bucket");
  const prefix = url.searchParams.get("prefix") || "";
  const action = url.searchParams.get("action") || "list"; // list | manifest | download

  const ALL_BUCKETS = [
    "audio",
    "source_uploads",
    "voice_samples",
    "scene-images",
    "audio-files",
    "scene-videos",
    "project-thumbnails",
    "style-references",
    "videos",
  ];

  // Action: list all buckets with file counts
  if (action === "list" && !bucket) {
    const summary: Record<string, { count: number; totalSize: number }> = {};

    for (const b of ALL_BUCKETS) {
      let count = 0;
      let totalSize = 0;
      let offset = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase.storage
          .from(b)
          .list(prefix, { limit: pageSize, offset, sortBy: { column: "created_at", order: "asc" } });

        if (error || !data || data.length === 0) break;

        // Filter out folder placeholders (they have no metadata or id is null-ish)
        const files = data.filter((f) => f.id && f.name !== ".emptyFolderPlaceholder");
        count += files.length;
        totalSize += files.reduce((sum, f) => sum + (f.metadata?.size || 0), 0);

        if (data.length < pageSize) break;
        offset += pageSize;
      }

      summary[b] = { count, totalSize };
    }

    return new Response(
      JSON.stringify({
        buckets: summary,
        totalFiles: Object.values(summary).reduce((s, b) => s + b.count, 0),
        usage: "Add ?action=manifest&bucket=BUCKET_NAME to get signed download URLs",
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  }

  // Action: list files in a specific bucket (with paths)
  if (action === "list" && bucket) {
    const allFiles: { name: string; size: number; created: string }[] = [];
    // Recursively list files including subfolders
    async function listRecursive(path: string) {
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase.storage
          .from(bucket!)
          .list(path, { limit: pageSize, offset, sortBy: { column: "created_at", order: "asc" } });

        if (error || !data || data.length === 0) break;

        for (const item of data) {
          if (item.name === ".emptyFolderPlaceholder") continue;
          const fullPath = path ? `${path}/${item.name}` : item.name;

          if (item.id) {
            // It's a file
            allFiles.push({
              name: fullPath,
              size: item.metadata?.size || 0,
              created: item.created_at || "",
            });
          } else {
            // It's a folder, recurse
            await listRecursive(fullPath);
          }
        }

        if (data.length < pageSize) break;
        offset += pageSize;
      }
    }

    await listRecursive(prefix);

    return new Response(
      JSON.stringify({ bucket, fileCount: allFiles.length, files: allFiles }),
      { headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  }

  // Action: manifest — generate signed download URLs for all files in a bucket
  if (action === "manifest" && bucket) {
    if (!ALL_BUCKETS.includes(bucket)) {
      return new Response(JSON.stringify({ error: `Unknown bucket: ${bucket}` }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const manifest: { path: string; url: string; size: number }[] = [];

    async function buildManifest(path: string) {
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase.storage
          .from(bucket!)
          .list(path, { limit: pageSize, offset, sortBy: { column: "created_at", order: "asc" } });

        if (error || !data || data.length === 0) break;

        for (const item of data) {
          if (item.name === ".emptyFolderPlaceholder") continue;
          const fullPath = path ? `${path}/${item.name}` : item.name;

          if (item.id) {
            // Generate a signed URL (7 days)
            const { data: signed } = await supabase.storage
              .from(bucket!)
              .createSignedUrl(fullPath, 604800);

            manifest.push({
              path: fullPath,
              url: signed?.signedUrl || "",
              size: item.metadata?.size || 0,
            });
          } else {
            await buildManifest(fullPath);
          }
        }

        if (data.length < pageSize) break;
        offset += pageSize;
      }
    }

    await buildManifest(prefix);

    return new Response(
      JSON.stringify({ bucket, fileCount: manifest.length, files: manifest }),
      {
        headers: {
          ...corsHeaders,
          "content-type": "application/json",
          "content-disposition": `attachment; filename="${bucket}_manifest.json"`,
        },
      }
    );
  }

  // Action: download — proxy-download a single file (for cross-origin)
  if (action === "download" && bucket) {
    const filePath = url.searchParams.get("path");
    if (!filePath) {
      return new Response(JSON.stringify({ error: "path param required" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (error || !data) {
      return new Response(JSON.stringify({ error: error?.message || "File not found" }), {
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    return new Response(data, {
      headers: {
        ...corsHeaders,
        "content-type": data.type || "application/octet-stream",
        "content-disposition": `attachment; filename="${filePath.split("/").pop()}"`,
      },
    });
  }

  return new Response(
    JSON.stringify({
      error: "Invalid action",
      usage: {
        "list all buckets": "?action=list",
        "list bucket files": "?action=list&bucket=BUCKET_NAME",
        "get manifest": "?action=manifest&bucket=BUCKET_NAME",
        "download file": "?action=download&bucket=BUCKET_NAME&path=FILE_PATH",
      },
    }),
    { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } }
  );
});
