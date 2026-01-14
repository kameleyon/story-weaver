import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type GenerationStep =
  | "idle"
  | "analysis"
  | "scripting"
  | "visuals"
  | "rendering"
  | "complete"
  | "error";

export interface Scene {
  number: number;
  voiceover: string;
  visualPrompt: string;
  subVisuals?: string[]; // Additional visual prompts for longer scenes
  duration: number;
  narrativeBeat?: "hook" | "conflict" | "choice" | "solution" | "formula"; // Track story position
  imageUrl?: string;
  imageUrls?: string[]; // Multiple images per scene
  audioUrl?: string;
  title?: string;
  subtitle?: string;
}

export interface GenerationState {
  step: GenerationStep;
  progress: number;
  sceneCount: number;
  currentScene: number;
  totalImages: number; // Total image tasks (may be > sceneCount with subVisuals)
  completedImages: number; // How many images have been generated
  isGenerating: boolean;
  projectId?: string;
  generationId?: string;
  title?: string;
  scenes?: Scene[];
  format?: "landscape" | "portrait" | "square";
  error?: string;
  statusMessage?: string; // Verbose status from backend
}

interface GenerationParams {
  content: string;
  format: string;
  length: string;
  style: string;
  customStyle?: string;
}

type ProjectRow = {
  id: string;
  title: string;
  content: string;
  format: string;
  length: string;
  style: string;
};

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

export function useGenerationPipeline() {
  const { toast } = useToast();
  const [state, setState] = useState<GenerationState>({
    step: "idle",
    progress: 0,
    sceneCount: 6,
    currentScene: 0,
    totalImages: 6,
    completedImages: 0,
    isGenerating: false,
    statusMessage: undefined,
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

  // Extract image progress metadata and status message from scenes if available
  const extractImageMeta = (scenes: any[]): { totalImages: number; completedImages: number; statusMessage?: string } => {
    if (!Array.isArray(scenes) || scenes.length === 0) {
      return { totalImages: 0, completedImages: 0 };
    }
    // Look for _meta in first scene (backend stores it there)
    const meta = scenes[0]?._meta;
    if (meta && typeof meta.totalImages === "number") {
      return {
        totalImages: meta.totalImages,
        completedImages: typeof meta.completedImages === "number" ? meta.completedImages : 0,
        statusMessage: typeof meta.statusMessage === "string" ? meta.statusMessage : undefined,
      };
    }
    return { totalImages: scenes.length, completedImages: 0 };
  };

  const recoverFromRecentGeneration = useCallback(
    async ({
      userId,
      sinceIso,
      format,
    }: {
      userId: string;
      sinceIso: string;
      format: "landscape" | "portrait" | "square";
    }) => {
      toast({
        title: "Still generating…",
        description: "Connection dropped, but generation may still complete. Checking status…",
      });

      setState((prev) => ({
        ...prev,
        step: prev.progress >= 40 ? "visuals" : "scripting",
        progress: Math.max(prev.progress, 40),
        isGenerating: true,
        error: undefined,
      }));

      // Poll for up to ~20 minutes.
      for (let i = 0; i < 600; i++) {
        const { data: generation } = await supabase
          .from("generations")
          .select("id,status,progress,scenes,error_message,project_id")
          .eq("user_id", userId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (generation?.project_id) {
          const { data: project } = await supabase
            .from("projects")
            .select("id,title")
            .eq("id", generation.project_id)
            .maybeSingle();

          if (generation.status === "complete") {
            const scenes = normalizeScenes(generation.scenes);
            const sceneLen = scenes?.length || 0;

            setState({
              step: "complete",
              progress: 100,
              sceneCount: sceneLen,
              currentScene: sceneLen,
              totalImages: sceneLen,
              completedImages: sceneLen,
              isGenerating: false,
              projectId: generation.project_id,
              generationId: generation.id,
              title: project?.title ?? "Your video",
              scenes,
              format,
            });

            toast({
              title: "Video Generated!",
              description: `"${project?.title ?? "Your video"}" is ready with ${sceneLen} scenes.`,
            });

            return true;
          }

          if (generation.status === "error") {
            throw new Error(generation.error_message || "Generation failed");
          }

          const dbProgress = typeof generation.progress === "number" ? generation.progress : 0;
          const scenes = normalizeScenes(generation.scenes);
          const imageMeta = extractImageMeta(Array.isArray(generation.scenes) ? generation.scenes : []);

          setState((prev) => {
            const sceneCount = scenes?.length ?? prev.sceneCount;
            const step = inferStepFromDb(generation.status, dbProgress);
            return {
              ...prev,
              step,
              progress: dbProgress,
              sceneCount,
              currentScene: inferCurrentSceneFromDb(dbProgress, sceneCount),
              totalImages: imageMeta.totalImages || prev.totalImages,
              completedImages: imageMeta.completedImages,
              isGenerating: true,
              projectId: generation.project_id,
              generationId: generation.id,
              title: project?.title ?? prev.title,
              scenes,
              format,
              statusMessage: imageMeta.statusMessage,
            };
          });
        }

        await new Promise((r) => setTimeout(r, 2000));
      }

      // Don’t hard-fail the UI; keep the progress screen visible.
      toast({
        title: "Still working",
        description: "This is taking longer than usual. You can keep this tab open and we’ll keep checking.",
      });

      return false;
    },
    [toast],
  );

  const startGeneration = useCallback(
    async (params: GenerationParams) => {
      // Updated scene counts based on minimum duration requirements
      // Short: min 60s, Brief: min 150s, Presentation: min 360s
      const sceneCounts: Record<string, number> = {
        short: 6,
        brief: 12,
        presentation: 24,
      };
      const expectedSceneCount = sceneCounts[params.length] || 12;

      const startedAt = Date.now();

      setState({
        step: "analysis",
        progress: 0,
        sceneCount: expectedSceneCount,
        currentScene: 0,
        totalImages: expectedSceneCount,
        completedImages: 0,
        isGenerating: true,
      });

      try {
        // Get the user's session
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error("You must be logged in to generate videos");
        }

        // Simulate analysis step while request is made
        setState((prev) => ({ ...prev, step: "analysis", progress: 50 }));

        // Call the backend function
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          let errorMessage = "Generation failed";
          try {
            const errorData = await response.json();
            errorMessage = errorData?.error || errorMessage;
          } catch {
            try {
              const text = await response.text();
              if (text) errorMessage = text.slice(0, 180);
            } catch {
              // ignore
            }
          }

          if (response.status === 429) {
            throw new Error("Rate limit exceeded. Please wait a moment and try again.");
          }
          if (response.status === 402) {
            throw new Error("AI credits exhausted. Please add credits to continue.");
          }

          // 5xx responses often mean the request timed out while the backend kept working.
          const err: any = new Error(errorMessage);
          err.__recoverable = response.status >= 500;
          err.__status = response.status;
          throw err;
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Generation failed");
        }

        // Update state with results
        const finalSceneCount = result.scenes?.length || expectedSceneCount;
        setState({
          step: "complete",
          progress: 100,
          sceneCount: finalSceneCount,
          currentScene: finalSceneCount,
          totalImages: finalSceneCount,
          completedImages: finalSceneCount,
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

        const isNetworkDrop =
          typeof errorMessage === "string" &&
          (errorMessage.toLowerCase().includes("failed to fetch") ||
            errorMessage.toLowerCase().includes("networkerror") ||
            errorMessage.toLowerCase().includes("load failed") ||
            errorMessage.toLowerCase().includes("fetch") ||
            errorMessage.toLowerCase().includes("timeout"));

        const isRecoverable = isNetworkDrop || (error as any)?.__recoverable === true;

        if (isRecoverable) {
          try {
            const {
              data: { session },
            } = await supabase.auth.getSession();

            const userId = session?.user?.id;
            if (userId) {
              const sinceIso = new Date(startedAt - 2 * 60 * 1000).toISOString();
              const ok = await recoverFromRecentGeneration({
                userId,
                sinceIso,
                format: params.format as "landscape" | "portrait" | "square",
              });
              if (ok) return;

              // Keep progress UI alive even if we couldn't confirm completion yet.
              return;
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
    },
    [recoverFromRecentGeneration, toast],
  );

  const loadProject = useCallback(
    async (projectId: string): Promise<ProjectRow | null> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const userId = session?.user?.id;
      if (!userId) {
        toast({
          variant: "destructive",
          title: "Not signed in",
          description: "Please sign in to view your projects.",
        });
        return null;
      }

      setState((prev) => ({
        ...prev,
        step: "analysis",
        progress: 0,
        isGenerating: true,
        error: undefined,
        projectId,
      }));

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id,title,content,format,length,style")
        .eq("id", projectId)
        .eq("user_id", userId)
        .maybeSingle();

      if (projectError) {
        toast({
          variant: "destructive",
          title: "Could not load project",
          description: projectError.message,
        });
        setState((prev) => ({ ...prev, step: "error", isGenerating: false, error: projectError.message }));
        return null;
      }

      if (!project) {
        const msg = "Project not found.";
        toast({ variant: "destructive", title: "Could not load project", description: msg });
        setState((prev) => ({ ...prev, step: "error", isGenerating: false, error: msg }));
        return null;
      }

      const { data: generation } = await supabase
        .from("generations")
        .select("id,status,progress,scenes,error_message")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (generation?.status === "complete") {
        const scenes = normalizeScenes(generation.scenes) ?? [];
        const sceneLen = scenes.length;
        setState({
          step: "complete",
          progress: 100,
          sceneCount: sceneLen,
          currentScene: sceneLen,
          totalImages: sceneLen,
          completedImages: sceneLen,
          isGenerating: false,
          projectId,
          generationId: generation.id,
          title: project.title,
          scenes,
          format: project.format as "landscape" | "portrait" | "square",
        });
      } else if (generation?.status === "error") {
        const msg = generation.error_message || "Generation failed";
        setState((prev) => ({
          ...prev,
          step: "error",
          isGenerating: false,
          error: msg,
          projectId,
          generationId: generation.id,
          title: project.title,
          format: project.format as "landscape" | "portrait" | "square",
        }));
      } else if (generation) {
        const dbProgress = typeof generation.progress === "number" ? generation.progress : 0;
        const scenes = normalizeScenes(generation.scenes);
        const imageMeta = extractImageMeta(Array.isArray(generation.scenes) ? generation.scenes : []);
        const sceneCount = scenes?.length ?? state.sceneCount;
        const step = inferStepFromDb(generation.status, dbProgress);

        setState({
          step,
          progress: dbProgress,
          sceneCount,
          currentScene: inferCurrentSceneFromDb(dbProgress, sceneCount),
          totalImages: imageMeta.totalImages || sceneCount,
          completedImages: imageMeta.completedImages,
          isGenerating: true,
          projectId,
          generationId: generation.id,
          title: project.title,
          scenes,
          format: project.format as "landscape" | "portrait" | "square",
          statusMessage: imageMeta.statusMessage,
        });
      } else {
        // No generation yet — show input UI.
        setState((prev) => ({
          ...prev,
          step: "idle",
          progress: 0,
          isGenerating: false,
          projectId,
          generationId: undefined,
          title: project.title,
          scenes: undefined,
          format: project.format as "landscape" | "portrait" | "square",
        }));
      }

      toast({
        title: "Project loaded",
        description: project.title,
      });

      return project as ProjectRow;
    },
    // Intentionally omit `state` so loading a project doesn't depend on transient generation UI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast],
  );

  const reset = useCallback(() => {
    setState({
      step: "idle",
      progress: 0,
      sceneCount: 6,
      currentScene: 0,
      totalImages: 6,
      completedImages: 0,
      isGenerating: false,
    });
  }, []);

  return { state, startGeneration, reset, loadProject };
}