import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Stripe product/price mappings
export const STRIPE_PLANS = {
  premium: {
    monthly: { priceId: "price_1SqNMMGAnMJbBpYYWDNwqgIy", productId: "prod_TnzLdHWPkqAiqr" },
    yearly: { priceId: "price_1SqNMMGAnMJbBpYYWDNwqgIy", productId: "prod_TnzLdHWPkqAiqr" },
  },
  pro: {
    monthly: { priceId: "price_1SqNMSGAnMJbBpYYZyRMcn4u", productId: "prod_TnzLCasreSakEb" },
    yearly: { priceId: "price_1SqNMSGAnMJbBpYYZyRMcn4u", productId: "prod_TnzLCasreSakEb" },
  },
  platinum: {
    monthly: { priceId: "price_1SqNMUGAnMJbBpYYkDOyTmWo", productId: "prod_TnzLP4tQINtak9" },
    yearly: { priceId: "price_1SqNMUGAnMJbBpYYkDOyTmWo", productId: "prod_TnzLP4tQINtak9" },
  },
} as const;

export const CREDIT_PACKS = {
  10: { priceId: "price_1SqNMVGAnMJbBpYY7WeJFkiO", productId: "prod_TnzLJDYSV45eEF", price: 4.99 },
  50: { priceId: "price_1SqNMWGAnMJbBpYYd3SU5e7B", productId: "prod_TnzL0a9nwvoZKm", price: 14.99 },
  150: { priceId: "price_1SqNMYGAnMJbBpYYlwqZdhSJ", productId: "prod_TnzL2ewLWIt1hD", price: 39.99 },
} as const;

export interface SubscriptionState {
  subscribed: boolean;
  plan: "free" | "premium" | "pro" | "platinum";
  subscriptionEnd: string | null;
  cancelAtPeriodEnd: boolean;
  creditsBalance: number;
  isLoading: boolean;
  error: string | null;
}

export function useSubscription() {
  const { user, session } = useAuth();
  const [state, setState] = useState<SubscriptionState>({
    subscribed: false,
    plan: "free",
    subscriptionEnd: null,
    cancelAtPeriodEnd: false,
    creditsBalance: 0,
    isLoading: true,
    error: null,
  });

  const checkSubscription = useCallback(async () => {
    if (!session?.access_token) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const { data, error } = await supabase.functions.invoke("check-subscription", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      setState({
        subscribed: data.subscribed || false,
        plan: data.plan || "free",
        subscriptionEnd: data.subscription_end || null,
        cancelAtPeriodEnd: data.cancel_at_period_end || false,
        creditsBalance: data.credits_balance || 0,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error("Error checking subscription:", error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to check subscription",
      }));
    }
  }, [session?.access_token]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  // Auto-refresh subscription status every 60 seconds
  useEffect(() => {
    if (!session?.access_token) return;
    
    const interval = setInterval(checkSubscription, 60000);
    return () => clearInterval(interval);
  }, [session?.access_token, checkSubscription]);

  const createCheckout = useCallback(async (priceId: string, mode: "subscription" | "payment" = "subscription") => {
    if (!session?.access_token) {
      throw new Error("Please sign in to continue");
    }

    const { data, error } = await supabase.functions.invoke("create-checkout", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: { priceId, mode },
    });

    if (error) throw error;
    if (!data?.url) throw new Error("Failed to create checkout session");

    // Open in new tab
    window.open(data.url, "_blank");
    return data.url;
  }, [session?.access_token]);

  const openCustomerPortal = useCallback(async () => {
    if (!session?.access_token) {
      throw new Error("Please sign in to continue");
    }

    const { data, error } = await supabase.functions.invoke("customer-portal", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) throw error;
    if (!data?.url) throw new Error("Failed to open billing portal");

    window.open(data.url, "_blank");
    return data.url;
  }, [session?.access_token]);

  return {
    ...state,
    checkSubscription,
    createCheckout,
    openCustomerPortal,
  };
}
