import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Stripe product/price mappings - Updated pricing structure
export const STRIPE_PLANS = {
  starter: {
    monthly: { priceId: "price_1StHnZGAnMJbBpYY1MvGw8gO", productId: "prod_TqznNZmUhevHh4" },
    yearly: { priceId: "price_1StHnZGAnMJbBpYY1MvGw8gO", productId: "prod_TqznNZmUhevHh4" },
  },
  creator: {
    monthly: { priceId: "price_1StHnaGAnMJbBpYYBqST0fKp", productId: "prod_TqznlgT1Jl6Re7" },
    yearly: { priceId: "price_1StHnaGAnMJbBpYYBqST0fKp", productId: "prod_TqznlgT1Jl6Re7" },
  },
  professional: {
    monthly: { priceId: "price_1StHncGAnMJbBpYYjz8ywAKx", productId: "prod_TqznqQYYG4UUY8" },
    yearly: { priceId: "price_1StHncGAnMJbBpYYjz8ywAKx", productId: "prod_TqznqQYYG4UUY8" },
  },
} as const;

export const CREDIT_PACKS = {
  15: { priceId: "price_1SuJk36hfVkBDzkSCbSorQJY", productId: "prod_Ts3r9EBXzzKKfU", price: 11.99 },
  50: { priceId: "price_1SqN2q6hfVkBDzkSNbEXBWTL", productId: "prod_Tnz0B2aJPD895y", price: 14.99 },
  150: { priceId: "price_1SqN316hfVkBDzkSVq77cGDd", productId: "prod_Tnz1CygtJnMhUz", price: 39.99 },
  500: { priceId: "price_1SuJk46hfVkBDzkSSkkal5QG", productId: "prod_Ts3rl1zDT9oLVt", price: 249.99 },
} as const;

export interface SubscriptionState {
  subscribed: boolean;
  plan: "free" | "starter" | "creator" | "professional";
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

      // Handle token expiration - try to refresh the session
      if (error?.message?.includes("401") || data?.code === "TOKEN_EXPIRED") {
        console.log("Token expired, attempting session refresh...");
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          // Refresh failed, user needs to re-login
          setState(prev => ({ ...prev, isLoading: false, error: "Session expired. Please log in again." }));
          return;
        }
        // Retry with new token - will be picked up on next interval or manual call
        return;
      }

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
    
    // Handle manual enterprise subscriptions
    if (data?.error === "MANUAL_SUBSCRIPTION") {
      throw new Error(data.message || "Your subscription is managed directly. Please contact support for billing inquiries.");
    }
    
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
