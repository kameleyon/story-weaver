import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Delete user data in order (respecting foreign keys)
    // 1. Generations (references projects)
    await adminClient.from("generations").delete().eq("user_id", userId);
    // 2. Project shares (references projects)
    await adminClient.from("project_shares").delete().eq("user_id", userId);
    // 3. Project characters (references projects)
    await adminClient.from("project_characters").delete().eq("user_id", userId);
    // 4. Projects
    await adminClient.from("projects").delete().eq("user_id", userId);
    // 5. Voice clones
    await adminClient.from("user_voices").delete().eq("user_id", userId);
    // 6. API keys
    await adminClient.from("user_api_keys").delete().eq("user_id", userId);
    // 7. Credits & transactions
    await adminClient.from("credit_transactions").delete().eq("user_id", userId);
    await adminClient.from("user_credits").delete().eq("user_id", userId);
    // 8. Generation costs
    await adminClient.from("generation_costs").delete().eq("user_id", userId);
    // 9. Subscriptions
    await adminClient.from("subscriptions").delete().eq("user_id", userId);
    // 10. Profile
    await adminClient.from("profiles").delete().eq("user_id", userId);
    // 11. Admin/system logs referencing user
    await adminClient.from("system_logs").delete().eq("user_id", userId);

    // Finally, delete the auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Error deleting auth user:", deleteError);
      return new Response(
        JSON.stringify({ error: "Failed to delete account. Please contact support." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Delete account error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
