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
  subVisuals?: string[];
  duration: number;
  narrativeBeat?: "hook" | "conflict" | "choice" | "solution" | "formula";
  imageUrl?: string;
  imageUrls?: string[];
  audioUrl?: string;
  title?: string;
  subtitle?: string;
}

export interface CostTracking {
  scriptTokens: number;
  audioSeconds: number;
  imagesGenerated: number;
  estimatedCostUsd: number;
}

export interface PhaseTimings {
  script?: number;
  audio?: number;
  images?: number;
  finalize?: number;
}

export interface GenerationState {
  step: GenerationStep;
  progress: number;
  sceneCount: number;
  currentScene: number;
  totalImages: number;
  completedImages: number;
  isGenerating: boolean;
  projectId?: string;
  generationId?: string;
  title?: string;
  scenes?: Scene[];
  format?: "landscape" | "portrait" | "square";
  error?: string;
  statusMessage?: string;
  costTracking?: CostTracking;
  phaseTimings?: PhaseTimings;
  totalTimeMs?: number;
  projectType?: "doc2video" | "storytelling" | "smartflow";
}

interface GenerationParams {
  content: string;
  format: string;
  length: string;
  style: string;
  customStyle?: string;
  brandMark?: string;
  presenterFocus?: string;
  characterDescription?: string;
  disableExpressions?: boolean;
  characterConsistencyEnabled?: boolean; // Enable Hypereal character reference generation
  // Voice selection
  voiceType?: "standard" | "custom";
  voiceId?: string;
  voiceName?: string;
  // New storytelling fields
  projectType?: "doc2video" | "storytelling" | "smartflow";
  inspirationStyle?: string;
  storyTone?: string;
  storyGenre?: string;
  voiceInclination?: string;
  brandName?: string;
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

  const extractMeta = (scenes: any[]): { 
    totalImages: number; 
    completedImages: number; 
    statusMessage?: string;
    costTracking?: CostTracking;
    phaseTimings?: PhaseTimings;
    totalTimeMs?: number;
  } => {
    if (!Array.isArray(scenes) || scenes.length === 0) {
      return { totalImages: 0, completedImages: 0 };
    }
    const meta = scenes[0]?._meta;
    if (meta && typeof meta.totalImages === "number") {
      return {
        totalImages: meta.totalImages,
        completedImages: typeof meta.completedImages === "number" ? meta.completedImages : 0,
        statusMessage: meta.statusMessage,
        costTracking: meta.costTracking,
        phaseTimings: meta.phaseTimings,
        totalTimeMs: meta.totalTimeMs,
      };
    }
    return { totalImages: scenes.length, completedImages: 0 };
  };

  // Helper to get a fresh session token (avoids using stale tokens during long generations)
  const getFreshSession = async (): Promise<string> => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      // Try to refresh the session
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        throw new Error("Session expired. Please refresh the page and try again.");
      }
      return refreshData.session.access_token;
    }
    return session.access_token;
  };

  // Helper to call a phase with configurable timeout and fresh auth
  const callPhase = async (
    body: Record<string, unknown>,
    timeoutMs: number = 120000 // Default 2 minutes
  ): Promise<any> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Get fresh token before each phase call to avoid JWT expiration mid-generation
      const accessToken = await getFreshSession();
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = "Phase failed";
        try {
          const errorData = await response.json();
          errorMessage = errorData?.error || errorMessage;
        } catch {
          // ignore
        }

        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please wait and try again.");
        }
        if (response.status === 402) {
          throw new Error("AI credits exhausted. Please add credits.");
        }
        if (response.status === 401) {
          throw new Error("Session expired. Please refresh the page and try again.");
        }
        throw new Error(errorMessage);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs / 1000}s. Please try again.`);
      }
      throw error;
    }
  };

  const startGeneration = useCallback(
    async (params: GenerationParams) => {
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
        totalImages: expectedSceneCount,
        completedImages: 0,
        isGenerating: true,
        statusMessage: "Starting generation...",
        costTracking: undefined,
        phaseTimings: undefined,
        projectType: params.projectType,
      });

      try {
        // Verify user is logged in before starting (fresh token will be fetched per-phase)
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!initialSession) throw new Error("You must be logged in to generate videos");

        // ============= PHASE 1: SCRIPT =============
        setState((prev) => ({ 
          ...prev, 
          step: "scripting", 
          progress: 5,
          statusMessage: "Generating script with AI..." 
        }));

        // Script phase needs longer timeout due to character analysis
        const scriptResult = await callPhase(
          {
            phase: "script",
            content: params.content,
            format: params.format,
            length: params.length,
            style: params.style,
            customStyle: params.customStyle,
            brandMark: params.brandMark,
            presenterFocus: params.presenterFocus,
            characterDescription: params.characterDescription,
            disableExpressions: params.disableExpressions,
            characterConsistencyEnabled: params.characterConsistencyEnabled,
            voiceType: params.voiceType,
            voiceId: params.voiceId,
            voiceName: params.voiceName,
            projectType: params.projectType,
            inspirationStyle: params.inspirationStyle,
            storyTone: params.storyTone,
            storyGenre: params.storyGenre,
            voiceInclination: params.voiceInclination,
            brandName: params.brandName,
          },
          180000 // 3 minutes for script + character analysis
        );

        if (!scriptResult.success) throw new Error(scriptResult.error || "Script generation failed");

        const { projectId, generationId, title, sceneCount, totalImages, costTracking } = scriptResult;

        setState((prev) => ({
          ...prev,
          step: "scripting",
          progress: 10,
          projectId,
          generationId,
          title,
          sceneCount,
          totalImages,
          statusMessage: "Script complete. Starting audio...",
          costTracking,
          phaseTimings: { script: scriptResult.phaseTime },
        }));

        // ============= PHASE 2: AUDIO (chunked) =============
        setState((prev) => ({ 
          ...prev, 
          step: "visuals", 
          progress: 15,
          statusMessage: "Generating voiceover audio..." 
        }));

        // Audio is chunked in the backend to avoid long-running requests/timeouts.
        // Each call generates up to a small batch of scene audios.
        let audioStartIndex = 0;
        let audioResult: any;

        do {
          audioResult = await callPhase(
            {
              phase: "audio",
              generationId,
              projectId,
              audioStartIndex,
            },
            300000 // 5 minutes (safety buffer)
          );

          if (!audioResult.success) throw new Error(audioResult.error || "Audio generation failed");

          setState((prev) => ({
            ...prev,
            progress: typeof audioResult.progress === "number" ? audioResult.progress : prev.progress,
            statusMessage: audioResult.hasMore
              ? `Generating voiceover... (${audioResult.audioGenerated || 0}/${prev.sceneCount})`
              : `Audio complete (${audioResult.audioSeconds?.toFixed(1) || 0}s). Starting images...`,
            costTracking: audioResult.costTracking,
            phaseTimings: { ...prev.phaseTimings, audio: audioResult.phaseTime },
          }));

          if (audioResult.hasMore && typeof audioResult.nextStartIndex === "number") {
            audioStartIndex = audioResult.nextStartIndex;
          }
        } while (audioResult.hasMore);

        // ============= PHASE 3: IMAGES (chunked) =============
        setState((prev) => ({ 
          ...prev, 
          progress: 45,
          statusMessage: "Generating images..." 
        }));

        let imageStartIndex = 0;
        let imagesResult: any;
        
        // Loop until all images are generated
        do {
          // Images phase can take 2-3 minutes per chunk (8 images), especially with Hypereal
          imagesResult = await callPhase(
            {
              phase: "images",
              generationId,
              projectId,
              imageStartIndex,
            },
            300000 // 5 minutes timeout for images (matches audio phase)
          );

          if (!imagesResult.success) throw new Error(imagesResult.error || "Image generation failed");

          setState((prev) => ({
            ...prev,
            progress: imagesResult.progress,
            completedImages: imagesResult.imagesGenerated,
            totalImages: imagesResult.totalImages,
            statusMessage: `Images ${imagesResult.imagesGenerated}/${imagesResult.totalImages}...`,
            costTracking: imagesResult.costTracking,
            phaseTimings: { ...prev.phaseTimings, images: (prev.phaseTimings?.images || 0) + (imagesResult.phaseTime || 0) },
          }));

          if (imagesResult.hasMore && imagesResult.nextStartIndex !== undefined) {
            imageStartIndex = imagesResult.nextStartIndex;
          }
        } while (imagesResult.hasMore);

        setState((prev) => ({
          ...prev,
          progress: 90,
          completedImages: imagesResult.imagesGenerated,
          totalImages: imagesResult.totalImages,
          statusMessage: `Images complete (${imagesResult.imagesGenerated}/${imagesResult.totalImages}). Finalizing...`,
          costTracking: imagesResult.costTracking,
        }));

        // ============= PHASE 4: FINALIZE =============
        const finalResult = await callPhase({
          phase: "finalize",
          generationId,
          projectId,
        });

        if (!finalResult.success) throw new Error(finalResult.error || "Finalization failed");

        const finalScenes = normalizeScenes(finalResult.scenes);

        setState({
          step: "complete",
          progress: 100,
          sceneCount: finalScenes?.length || sceneCount,
          currentScene: finalScenes?.length || sceneCount,
          totalImages: imagesResult.totalImages,
          completedImages: imagesResult.imagesGenerated,
          isGenerating: false,
          projectId,
          generationId,
          title: finalResult.title,
          scenes: finalScenes,
          format: params.format as "landscape" | "portrait" | "square",
          statusMessage: "Generation complete!",
          costTracking: finalResult.costTracking,
          phaseTimings: finalResult.phaseTimings,
          totalTimeMs: finalResult.totalTimeMs,
        });

        toast({
          title: "Video Generated!",
          description: `"${finalResult.title}" is ready with ${finalScenes?.length || 0} scenes.`,
        });
      } catch (error) {
        console.error("Generation error:", error);
        const errorMessage = error instanceof Error ? error.message : "Generation failed";

        setState((prev) => ({
          ...prev,
          step: "error",
          isGenerating: false,
          error: errorMessage,
          statusMessage: errorMessage,
        }));

        toast({
          variant: "destructive",
          title: "Generation Failed",
          description: errorMessage,
        });
      }
    },
    [toast],
  );

  const loadProject = useCallback(
    async (projectId: string): Promise<ProjectRow | null> => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      if (!userId) {
        toast({ variant: "destructive", title: "Not signed in", description: "Please sign in." });
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

      if (projectError || !project) {
        const msg = projectError?.message || "Project not found.";
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
        const meta = extractMeta(Array.isArray(generation.scenes) ? generation.scenes : []);
        
        setState({
          step: "complete",
          progress: 100,
          sceneCount: scenes.length,
          currentScene: scenes.length,
          totalImages: meta.totalImages || scenes.length,
          completedImages: meta.completedImages || scenes.length,
          isGenerating: false,
          projectId,
          generationId: generation.id,
          title: project.title,
          scenes,
          format: project.format as "landscape" | "portrait" | "square",
          costTracking: meta.costTracking,
          phaseTimings: meta.phaseTimings,
          totalTimeMs: meta.totalTimeMs,
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
        const meta = extractMeta(Array.isArray(generation.scenes) ? generation.scenes : []);
        const sceneCount = scenes?.length ?? state.sceneCount;
        const step = inferStepFromDb(generation.status, dbProgress);

        setState({
          step,
          progress: dbProgress,
          sceneCount,
          currentScene: inferCurrentSceneFromDb(dbProgress, sceneCount),
          totalImages: meta.totalImages || sceneCount,
          completedImages: meta.completedImages,
          isGenerating: true,
          projectId,
          generationId: generation.id,
          title: project.title,
          scenes,
          format: project.format as "landscape" | "portrait" | "square",
          statusMessage: meta.statusMessage,
          costTracking: meta.costTracking,
          phaseTimings: meta.phaseTimings,
        });
      } else {
        setState((prev) => ({
          ...prev,
          step: "idle",
          progress: 0,
          isGenerating: false,
          projectId,
          title: project.title,
          format: project.format as "landscape" | "portrait" | "square",
        }));
      }

      return project;
    },
    [toast, state.sceneCount],
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
