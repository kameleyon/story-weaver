import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-YEARLY-PRICES] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Fetch existing monthly products so we attach yearly prices to the same products
    const monthlyProductIds = {
      starter: "prod_Tnyz2nMLqpHz3R",
      creator: "prod_Tnz0KUQX2J5VBH",
      professional: "prod_Tnz0BeRmJDdh0V",
    };

    const yearlyAmounts = {
      starter: 11990,      // $119.90/yr
      creator: 31990,      // $319.90/yr
      professional: 71990, // $719.90/yr
    };

    const results: Record<string, string> = {};

    for (const [plan, productId] of Object.entries(monthlyProductIds)) {
      const amount = yearlyAmounts[plan as keyof typeof yearlyAmounts];

      // Check if a yearly price already exists for this product
      const existingPrices = await stripe.prices.list({
        product: productId,
        active: true,
        limit: 10,
      });

      const existingYearly = existingPrices.data.find(
        (p) => p.recurring?.interval === "year"
      );

      if (existingYearly) {
        logStep(`Yearly price already exists for ${plan}`, { priceId: existingYearly.id });
        results[plan] = existingYearly.id;
      } else {
        const price = await stripe.prices.create({
          product: productId,
          unit_amount: amount,
          currency: "usd",
          recurring: { interval: "year" },
          nickname: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan - Yearly`,
        });
        logStep(`Created yearly price for ${plan}`, { priceId: price.id, amount });
        results[plan] = price.id;
      }
    }

    logStep("All yearly prices ready", results);

    return new Response(JSON.stringify({ success: true, prices: results }), {
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
