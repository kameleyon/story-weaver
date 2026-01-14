import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface GenerationStats {
  totalGenerations: number;
  totalApiCost: number;
  isLoading: boolean;
}

interface SceneMeta {
  costTracking?: {
    estimatedCostUsd?: number;
  };
}

interface SceneWithMeta {
  _meta?: SceneMeta;
}

export function useGenerationStats(): GenerationStats {
  const [stats, setStats] = useState<GenerationStats>({
    totalGenerations: 0,
    totalApiCost: 0,
    isLoading: true,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) {
          setStats({ totalGenerations: 0, totalApiCost: 0, isLoading: false });
          return;
        }

        // Fetch all completed generations for this user
        const { data: generations, error } = await supabase
          .from("generations")
          .select("id, scenes, status")
          .eq("user_id", session.user.id)
          .eq("status", "complete");

        if (error) {
          console.error("Error fetching generation stats:", error);
          setStats({ totalGenerations: 0, totalApiCost: 0, isLoading: false });
          return;
        }

        // Calculate total cost from scenes metadata
        let totalCost = 0;
        
        if (generations) {
          for (const gen of generations) {
            if (Array.isArray(gen.scenes) && gen.scenes.length > 0) {
              // Cost is stored in the _meta of the first scene
              const firstScene = gen.scenes[0] as SceneWithMeta;
              const cost = firstScene?._meta?.costTracking?.estimatedCostUsd;
              if (typeof cost === "number") {
                totalCost += cost;
              }
            }
          }
        }

        setStats({
          totalGenerations: generations?.length || 0,
          totalApiCost: totalCost,
          isLoading: false,
        });
      } catch (error) {
        console.error("Error fetching generation stats:", error);
        setStats({ totalGenerations: 0, totalApiCost: 0, isLoading: false });
      }
    };

    fetchStats();

    // Subscribe to changes in generations table
    const channel = supabase
      .channel("generation-stats")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "generations",
        },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return stats;
}
