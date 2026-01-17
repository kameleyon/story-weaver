import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Credit pack product IDs
const creditPackProducts: Record<string, number> = {
  "prod_Tnz0gHVRtX0ZKa": 10,   // 10 credits
  "prod_Tnz0B2aJPD895y": 50,   // 50 credits
  "prod_Tnz1CygtJnMhUz": 150,  // 150 credits
};

// Subscription plan product IDs
const subscriptionProducts: Record<string, string> = {
  "prod_Tnyz2nMLqpHz3R": "premium",
  "prod_Tnz0KUQX2J5VBH": "pro",
  "prod_Tnz0BeRmJDdh0V": "platinum",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const signature = req.headers.get("stripe-signature");
    const body = await req.text();
    
    logStep("Webhook received", { hasSignature: !!signature });

    // For now, parse without signature verification
    // In production, use the webhook secret for verification
    const event = JSON.parse(body) as Stripe.Event;
    logStep("Event type", { type: event.type });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id || session.client_reference_id;
        const customerId = session.customer as string;
        
        logStep("Checkout completed", { userId, customerId, mode: session.mode });

        if (!userId) {
          logStep("No user ID found in session");
          break;
        }

        if (session.mode === "payment") {
          // One-time payment (credit purchase)
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
          for (const item of lineItems.data) {
            const productId = item.price?.product as string;
            const credits = creditPackProducts[productId];
            
            if (credits) {
              logStep("Adding credits", { userId, credits, productId });
              
              // Upsert user credits
              const { data: existingCredits } = await supabaseAdmin
                .from("user_credits")
                .select("*")
                .eq("user_id", userId)
                .single();

              if (existingCredits) {
                await supabaseAdmin
                  .from("user_credits")
                  .update({
                    credits_balance: existingCredits.credits_balance + credits,
                    total_purchased: existingCredits.total_purchased + credits,
                  })
                  .eq("user_id", userId);
              } else {
                await supabaseAdmin
                  .from("user_credits")
                  .insert({
                    user_id: userId,
                    credits_balance: credits,
                    total_purchased: credits,
                  });
              }

              // Log the transaction
              await supabaseAdmin
                .from("credit_transactions")
                .insert({
                  user_id: userId,
                  amount: credits,
                  transaction_type: "purchase",
                  description: `Purchased ${credits} credits`,
                  stripe_payment_intent_id: session.payment_intent as string,
                });
            }
          }
        } else if (session.mode === "subscription") {
          // Subscription purchase
          const subscriptionId = session.subscription as string;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const productId = subscription.items.data[0].price.product as string;
          const planName = subscriptionProducts[productId] || "premium";

          logStep("Creating subscription record", { userId, planName, subscriptionId });

          // Upsert subscription
          const { data: existingSub } = await supabaseAdmin
            .from("subscriptions")
            .select("*")
            .eq("user_id", userId)
            .single();

          const subscriptionData = {
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan_name: planName,
            status: "active" as const,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          };

          if (existingSub) {
            await supabaseAdmin
              .from("subscriptions")
              .update(subscriptionData)
              .eq("user_id", userId);
          } else {
            await supabaseAdmin
              .from("subscriptions")
              .insert(subscriptionData);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        
        logStep("Subscription updated", { subscriptionId: subscription.id, status: subscription.status });

        // Find user by customer ID
        const { data: subData } = await supabaseAdmin
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (subData) {
          const productId = subscription.items.data[0].price.product as string;
          const planName = subscriptionProducts[productId] || "premium";

          await supabaseAdmin
            .from("subscriptions")
            .update({
              plan_name: planName,
              status: subscription.status as any,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end,
            })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        
        logStep("Subscription deleted", { subscriptionId: subscription.id });

        await supabaseAdmin
          .from("subscriptions")
          .update({
            status: "canceled",
            plan_name: "free",
          })
          .eq("stripe_customer_id", customerId);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
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
