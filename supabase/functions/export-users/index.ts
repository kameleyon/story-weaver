import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  const format = url.searchParams.get("format") || "json"; // "json" or "script"

  // Fetch ALL auth users using pagination (admin API returns max 1000 per page)
  const allUsers: Array<{
    id: string;
    email: string;
    created_at: string;
    email_confirmed_at: string | null;
    phone: string | null;
    raw_user_meta_data: Record<string, unknown>;
  }> = [];

  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    for (const u of users) {
      allUsers.push({
        id: u.id,
        email: u.email || "",
        created_at: u.created_at,
        email_confirmed_at: u.email_confirmed_at || null,
        phone: u.phone || null,
        raw_user_meta_data: (u.user_metadata || {}) as Record<string, unknown>,
      });
    }

    if (users.length < perPage) break;
    page++;
  }

  // Format: JSON export (for programmatic use)
  if (format === "json") {
    return new Response(JSON.stringify({
      total: allUsers.length,
      exported_at: new Date().toISOString(),
      users: allUsers,
    }, null, 2), {
      headers: {
        ...corsHeaders,
        "content-type": "application/json",
        "content-disposition": "attachment; filename=\"users_export.json\"",
      },
    });
  }

  // Format: Migration script (ready to run on new project)
  const lines: string[] = [
    "// =============================================================",
    "// USER MIGRATION SCRIPT — Run on your NEW Supabase project",
    "// =============================================================",
    "// Prerequisites:",
    "//   1. Install: npm install @supabase/supabase-js",
    "//   2. Set NEW_SUPABASE_URL and NEW_SERVICE_ROLE_KEY below",
    "//   3. Run: node migrate-users.js",
    "// =============================================================",
    "",
    'import { createClient } from "@supabase/supabase-js";',
    "",
    "// ⚠️  REPLACE THESE with your NEW project credentials",
    'const NEW_SUPABASE_URL = "https://YOUR-NEW-PROJECT.supabase.co";',
    'const NEW_SERVICE_ROLE_KEY = "YOUR-NEW-SERVICE-ROLE-KEY";',
    "",
    "const supabase = createClient(NEW_SUPABASE_URL, NEW_SERVICE_ROLE_KEY);",
    "",
    `const users = ${JSON.stringify(allUsers, null, 2)};`,
    "",
    "async function migrateUsers() {",
    '  console.log(`Migrating ${users.length} users...\\n`);',
    "  let success = 0;",
    "  let failed = 0;",
    "",
    "  for (const user of users) {",
    "    try {",
    "      const { data, error } = await supabase.auth.admin.createUser({",
    "        id: user.id,             // ← PRESERVES original UUID",
    "        email: user.email,",
    '        password: "TempPass_" + Math.random().toString(36).slice(2, 10),',
    "        email_confirm: true,     // Skip email verification",
    "        user_metadata: user.raw_user_meta_data,",
    "      });",
    "",
    "      if (error) {",
    "        console.error(`  ✗ ${user.email}: ${error.message}`);",
    "        failed++;",
    "      } else {",
    "        console.log(`  ✓ ${user.email} (${user.id})`);",
    "        success++;",
    "      }",
    "    } catch (err) {",
    "      console.error(`  ✗ ${user.email}: ${err.message}`);",
    "      failed++;",
    "    }",
    "  }",
    "",
    '  console.log(`\\n=== Migration complete: ${success} created, ${failed} failed ===`);',
    "",
    "  // After migration, send password reset emails so users can set their own passwords",
    '  console.log("\\nSending password reset emails...");',
    "  for (const user of users) {",
    "    const { error } = await supabase.auth.admin.generateLink({",
    '      type: "recovery",',
    "      email: user.email,",
    "    });",
    '    if (!error) console.log(`  📧 Reset email queued for ${user.email}`);',
    "  }",
    "}",
    "",
    "migrateUsers();",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      ...corsHeaders,
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": 'attachment; filename="migrate-users.mjs"',
    },
  });
});
