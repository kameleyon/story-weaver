import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useAdminAuth() {
  const { user, session, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user || authLoading) {
        setIsAdmin(false);
        setLoading(authLoading);
        return;
      }

      try {
        // Check admin status via the admin-stats edge function
        const { data, error } = await supabase.functions.invoke("admin-stats", {
          body: { action: "dashboard_stats" },
        });

        if (error) {
          // Non-2xx responses (403, etc.) are expected for non-admin users - don't log these
          setIsAdmin(false);
        } else {
          setIsAdmin(true);
        }
      } catch (err) {
        console.error("Error checking admin status:", err);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [user, authLoading]);

  const callAdminApi = useCallback(async (action: string, params?: Record<string, unknown>) => {
    if (!session) {
      throw new Error("Not authenticated");
    }

    const { data, error } = await supabase.functions.invoke("admin-stats", {
      body: { action, params },
    });

    if (error) {
      throw new Error(error.message || "Admin API error");
    }

    return data;
  }, [session]);

  return {
    isAdmin,
    loading,
    callAdminApi,
    user,
  };
}
