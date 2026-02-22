import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useAdminAuth() {
  const { user, session, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Use ref to track the session for stable callback
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user || authLoading) {
        setIsAdmin(false);
        setLoading(authLoading);
        return;
      }

      try {
        // Use the lightweight is_admin database function instead of calling the edge function
        // This avoids 403 errors for non-admin users
        const { data, error } = await supabase.rpc("is_admin", {
          _user_id: user.id,
        });

        if (error) {
          setIsAdmin(false);
        } else {
          setIsAdmin(!!data);
        }
      } catch (err) {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [user, authLoading]);

  // Stable callback that won't change between renders
  const callAdminApi = useCallback(async (action: string, params?: Record<string, unknown>) => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      throw new Error("Not authenticated");
    }

    const { data, error } = await supabase.functions.invoke("admin-stats", {
      body: { action, params },
    });

    if (error) {
      throw new Error(error.message || "Admin API error");
    }

    return data;
  }, []); // Empty deps = stable reference

  return {
    isAdmin,
    loading,
    callAdminApi,
    user,
  };
}
