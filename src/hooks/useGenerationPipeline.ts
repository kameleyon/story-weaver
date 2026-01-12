import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type GenerationStep = "idle" | "analysis" | "scripting" | "visuals" | "rendering" | "complete" | "error";

export interface Scene {
  number: number;
  voiceover: string;
  visualPrompt: string;
  subVisuals?: string[];       // Additional visual prompts for longer scenes
  duration: number;
  narrativeBeat?: "hook" | "conflict" | "choice" | "solution" | "formula"; // Track story position
  imageUrl?: string;
  imageUrls?: string[];        // Multiple images per scene
  audioUrl?: string;
  title?: string;
  subtitle?: string;
}

export interface GenerationState {
  step: GenerationStep;
  progress: number;
  sceneCount: number;
  currentScene: number;
  isGenerating: boolean;
  projectId?: string;
  generationId?: string;
  title?: string;
  scenes?: Scene[];
  format?: "landscape" | "portrait" | "square";
  error?: string;
}

interface GenerationParams {
  content: string;
  format: string;
  length: string;
  style: string;
  customStyle?: string;
}

export function useGenerationPipeline() {
  const { toast } = useToast();
  const [state, setState] = useState<GenerationState>({
    step: "idle",
    progress: 0,
    sceneCount: 6,
    currentScene: 0,
    isGenerating: false,
  });

  const inferStepFromDb = (dbStatus: string | null | undefined, dbProgress: number): GenerationStep => {
    if (dbStatus === "complete") return "complete";
    if (dbStatus === "error") return "error";
    if (dbProgress < 10) return "analysis";
    if (dbProgress < 40) return "scripting";
    return "visuals";
  };

  const inferCurrentSceneFromDb = (dbProgress: number, sceneCount: number): number => {
    if (sceneCount <= 0) return 0;
    if (dbProgress < 40) return 0;
    const p = Math.min(1, Math.max(0, (dbProgress - 40) / 50));
    return Math.max(1, Math.min(sceneCount, Math.round(p * sceneCount)));
  };

  const startGeneration = useCallback(async (params: GenerationParams) => {
    // Updated scene counts based on minimum duration requirements
    // Short: min 60s, Brief: min 150s, Presentation: min 360s
    const sceneCounts: Record<string, number> = {
      short: 6,
      brief: 12,
      presentation: 24,
    };
    const expectedSceneCount = sceneCounts[params.length] || 12;

    setState({
      step: "analysis",
      progress: 0,
      sceneCount: expectedSceneCount,
      currentScene: 0,
      isGenerating: true,
    });

    try {
      // Get the user's session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("You must be logged in to generate videos");
      }

      // Simulate analysis step while request is made
      setState(prev => ({ ...prev, step: "analysis", progress: 50 }));

      // Call the edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-video`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(params),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        
        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please wait a moment and try again.");
        }
        if (response.status === 402) {
          throw new Error("AI credits exhausted. Please add credits to continue.");
        }
        
        throw new Error(errorData.error || "Generation failed");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Generation failed");
      }

      // Update state with results
      setState({
        step: "complete",
        progress: 100,
        sceneCount: result.scenes?.length || expectedSceneCount,
        currentScene: result.scenes?.length || expectedSceneCount,
        isGenerating: false,
        projectId: result.projectId,
        generationId: result.generationId,
        title: result.title,
        scenes: result.scenes,
        format: params.format as "landscape" | "portrait" | "square",
      });

      toast({
        title: "Video Generated!",
        description: `"${result.title}" is ready with ${result.scenes?.length || 0} scenes.`,
      });
    } catch (error) {
      console.error("Generation error:", error);

      const errorMessage = error instanceof Error ? error.message : "Generation failed";

      // If the request times out / connection is closed, the backend job can still finish.
      // In that case, poll the database for the most recent generation and recover the result.
      const isFailedFetch =
        typeof errorMessage === "string" &&
        (errorMessage.toLowerCase().includes("failed to fetch") ||
          errorMessage.toLowerCase().includes("networkerror"));

      if (isFailedFetch) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          const userId = session?.user?.id;

          if (userId) {
            toast({
              title: "Still generating…",
              description: "Connection dropped, but generation may still complete. Checking status…",
            });

            setState((prev) => ({
              ...prev,
              // Keep the progress UI aligned with backend progress during recovery.
              // "rendering" previously marked every step as complete in the UI.
              step: prev.progress >= 40 ? "visuals" : "scripting",
              progress: Math.max(prev.progress, 40),
              isGenerating: true,
              error: undefined,
            }));

            const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

            const normalizeScenes = (raw: unknown): Scene[] | undefined => {
              if (!Array.isArray(raw)) return undefined;
              return raw.map((s: any, idx: number) => ({
                number: s?.number ?? idx + 1,
                voiceover: s?.voiceover ?? s?.narration ?? "",
                visualPrompt: s?.visualPrompt ?? s?.visual_prompt ?? "",
                subVisuals: Array.isArray(s?.subVisuals) ? s.subVisuals : undefined,
                duration: typeof s?.duration === "number" ? s.duration : 8,
                imageUrl: s?.imageUrl ?? s?.image_url,
                imageUrls: Array.isArray(s?.imageUrls) ? s.imageUrls : undefined,
                audioUrl: s?.audioUrl ?? s?.audio_url,
                title: s?.title,
                subtitle: s?.subtitle,
              }));
            };

            // Poll for up to ~8 minutes (generations can be long, especially with multiple visuals).
            for (let i = 0; i < 240; i++) {
              const { data: project } = await supabase
                .from("projects")
                .select("id,title")
                .eq("user_id", userId)
                .gte("created_at", since)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (project?.id) {
                const { data: generation } = await supabase
                  .from("generations")
                  .select("id,status,progress,scenes,error_message")
                  .eq("project_id", project.id)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (generation?.status === "complete") {
                  const scenes = normalizeScenes(generation.scenes);

                  setState({
                    step: "complete",
                    progress: 100,
                    sceneCount: scenes?.length || 0,
                    currentScene: scenes?.length || 0,
                    isGenerating: false,
                    projectId: project.id,
                    generationId: generation.id,
                    title: project.title ?? "Your video",
                    scenes,
                    format: params.format as "landscape" | "portrait" | "square",
                  });

                  toast({
                    title: "Video Generated!",
                    description: `"${project.title ?? "Your video"}" is ready with ${scenes?.length || 0} scenes.`,
                  });

                  return;
                }

                if (generation?.status === "error") {
                  throw new Error(generation.error_message || "Generation failed");
                }

                const dbProgress = typeof generation?.progress === "number" ? generation.progress : 0;
                const scenes = normalizeScenes(generation.scenes);

                setState((prev) => {
                  const sceneCount = scenes?.length ?? prev.sceneCount;
                  const step = inferStepFromDb(generation?.status, dbProgress);
                  return {
                    ...prev,
                    step,
                    progress: dbProgress,
                    sceneCount,
                    currentScene: inferCurrentSceneFromDb(dbProgress, sceneCount),
                  };
                });
              }

              await new Promise((r) => setTimeout(r, 2000));
            }
          }
        } catch (recoveryError) {
          console.warn("Failed-fetch recovery failed:", recoveryError);
        }
      }

      setState((prev) => ({
        ...prev,
        step: "error",
        isGenerating: false,
        error: errorMessage,
      }));

      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: errorMessage,
      });
    }
  }, [toast]);

  const reset = useCallback(() => {
    setState({
      step: "idle",
      progress: 0,
      sceneCount: 6,
      currentScene: 0,
      isGenerating: false,
    });
  }, []);

  return { state, startGeneration, reset };
}