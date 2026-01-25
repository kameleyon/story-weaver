import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Service role client for DB operations
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Create a client with the user's auth header for getClaims
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Use getClaims to verify the JWT
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      // Check if it's an expired token
      if (claimsError?.message?.includes("expired")) {
        throw new Error("Session expired. Please refresh the page.");
      }
      throw new Error("Authentication error: Invalid session");
    }
    
    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string;
    
    if (!userId || !userEmail) {
      throw new Error("User not authenticated or email not available");
    }
    logStep("User authenticated", { userId, email: userEmail });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No Stripe customer found, returning free tier");
      
      // Check for credits in the database
      const { data: creditData } = await supabaseAdmin
        .from("user_credits")
        .select("credits_balance")
        .eq("user_id", userId)
        .single();

      return new Response(JSON.stringify({
        subscribed: false,
        plan: "free",
        credits_balance: creditData?.credits_balance || 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    let plan = "free";
    let subscriptionEnd = null;
    let cancelAtPeriodEnd = false;

    if (subscriptions.data.length > 0) {
      const subscription = subscriptions.data[0];
      
      // Handle current_period_end - Stripe usually returns seconds, but be defensive
      // because some nested shapes can surface millisecond-like values.
      const periodEndRaw =
        subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end;

      const parseStripePeriodEndToIso = (value: unknown): string | null => {
        const n =
          typeof value === "number"
            ? value
            : typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))
              ? Number(value)
              : null;

        if (n === null) return null;

        // Heuristic: seconds are ~1e9, milliseconds are ~1e12
        const ms = n > 100_000_000_000 ? n : n * 1000;
        const d = new Date(ms);
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString();
      };

      subscriptionEnd = parseStripePeriodEndToIso(periodEndRaw);
      
      cancelAtPeriodEnd = subscription.cancel_at_period_end || false;
      
      const productId = subscription.items.data[0].price.product as string;
      logStep("Active subscription found", { subscriptionId: subscription.id, productId, periodEnd: periodEndRaw });

      // Map product IDs to plans - Updated tier names
      const productToPlan: Record<string, string> = {
        // New tiers
        "prod_TqznNZmUhevHh4": "starter",
        "prod_TqznlgT1Jl6Re7": "creator",
        "prod_TqznqQYYG4UUY8": "professional",
        // Legacy tiers (map to new names)
        "prod_TnzLdHWPkqAiqr": "starter",    // old premium -> starter
        "prod_TnzLCasreSakEb": "creator",     // old pro -> creator
        "prod_TnzLP4tQINtak9": "professional", // old platinum -> professional
      };
      plan = productToPlan[productId] || "starter";
    }

    // Get credits balance
    const { data: creditData } = await supabaseAdmin
      .from("user_credits")
      .select("credits_balance")
      .eq("user_id", userId)
      .single();

    logStep("Returning subscription status", { plan, subscriptionEnd });

    return new Response(JSON.stringify({
      subscribed: plan !== "free",
      plan,
      subscription_end: subscriptionEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      credits_balance: creditData?.credits_balance || 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
