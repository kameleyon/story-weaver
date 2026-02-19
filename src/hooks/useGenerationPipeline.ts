import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  videoUrl?: string;
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
  finalVideoUrl?: string;
  error?: string;
  statusMessage?: string;
  costTracking?: CostTracking;
  phaseTimings?: PhaseTimings;
  totalTimeMs?: number;
  projectType?: "doc2video" | "storytelling" | "smartflow" | "cinematic";
}

interface GenerationParams {
  content: string;
  format: string;
  length: string;
  style: string;
  customStyle?: string;
  customStyleImage?: string | null; // Base64 image for custom style reference
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
  projectType?: "doc2video" | "storytelling" | "smartflow" | "cinematic";
  inspirationStyle?: string;
  storyTone?: string;
  storyGenre?: string;
  voiceInclination?: string;
  brandName?: string;
}

export type ProjectRow = {
  id: string;
  title: string;
  content: string;
  format: string;
  length: string;
  style: string;
  presenter_focus?: string | null;
  character_description?: string | null;
  voice_type?: string | null;
  voice_id?: string | null;
  voice_name?: string | null;
  brand_mark?: string | null;
  character_consistency_enabled?: boolean | null;
  inspiration_style?: string | null;
  story_tone?: string | null;
  story_genre?: string | null;
  voice_inclination?: string | null;
  project_type?: string | null;
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
    videoUrl: s?.videoUrl ?? s?.video_url,
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
  const callPhase = useCallback(async (
    body: Record<string, unknown>,
    timeoutMs: number = 120000,
    endpoint: string = "generate-video"
  ): Promise<any> => {
    // Retry transient network failures (these often surface as TypeError: Failed to fetch)
    // so generation doesn't hard-fail on a single dropped connection.
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        // Get fresh token before each phase call to avoid JWT expiration mid-generation
        const accessToken = await getFreshSession();

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`, {
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
          if (response.status === 503 && attempt < MAX_ATTEMPTS) {
            await sleep(800 * attempt);
            continue;
          }

          throw new Error(errorMessage);
        }

        return response.json();
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`Request timed out after ${timeoutMs / 1000}s. Please try again.`);
        }

        const msg = error instanceof Error ? error.message : String(error);
        const isTransientFetch = msg.toLowerCase().includes("failed to fetch");
        if (attempt < MAX_ATTEMPTS && isTransientFetch) {
          const jitter = Math.floor(Math.random() * 250);
          await sleep(750 * attempt + jitter);
          continue;
        }

        throw error;
      }
    }

    throw new Error("Phase call failed after retries");
  }, []);

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

        // ============= CINEMATIC PIPELINE =============
        if (params.projectType === "cinematic") {
          const cinematicEndpoint = "generate-cinematic";

          // Phase 1: Script
          setState((prev) => ({
            ...prev,
            step: "scripting",
            progress: 5,
            statusMessage: "Generating cinematic script...",
          }));

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
            },
            180000,
            cinematicEndpoint
          );

          if (!scriptResult.success) throw new Error(scriptResult.error || "Script generation failed");

          const cProjectId = scriptResult.projectId;
          const cGenerationId = scriptResult.generationId;
          const cTitle = scriptResult.title;
          const cSceneCount = scriptResult.sceneCount;

          setState((prev) => ({
            ...prev,
            step: "visuals",
            progress: 10,
            projectId: cProjectId,
            generationId: cGenerationId,
            title: cTitle,
            sceneCount: cSceneCount,
            statusMessage: "Script complete. Generating audio...",
          }));

          // Phase 2: Audio (scene-by-scene with polling)
          for (let i = 0; i < cSceneCount; i++) {
            setState((prev) => ({
              ...prev,
              statusMessage: `Generating audio (${i + 1}/${cSceneCount})...`,
              progress: 10 + Math.floor(((i + 0.25) / cSceneCount) * 25),
            }));

            let audioComplete = false;
            while (!audioComplete) {
              const audioRes = await callPhase(
                { phase: "audio", projectId: cProjectId, generationId: cGenerationId, sceneIndex: i },
                300000,
                cinematicEndpoint
              );
              if (!audioRes.success) throw new Error(audioRes.error || "Audio generation failed");
              if (audioRes.status === "complete") {
                audioComplete = true;
              } else {
                await sleep(1200);
              }
            }

            setState((prev) => ({
              ...prev,
              progress: 10 + Math.floor(((i + 1) / cSceneCount) * 25),
            }));
          }

          // Phase 3: Images (scene-by-scene)
          setState((prev) => ({
            ...prev,
            progress: 35,
            statusMessage: "Audio complete. Creating scene images...",
          }));

          for (let i = 0; i < cSceneCount; i++) {
            setState((prev) => ({
              ...prev,
              statusMessage: `Creating images (${i + 1}/${cSceneCount})...`,
              progress: 35 + Math.floor(((i + 0.25) / cSceneCount) * 25),
            }));

            const imgRes = await callPhase(
              { phase: "images", projectId: cProjectId, generationId: cGenerationId, sceneIndex: i },
              480000,
              cinematicEndpoint
            );
            if (!imgRes.success) throw new Error(imgRes.error || "Image generation failed");

            setState((prev) => ({
              ...prev,
              progress: 35 + Math.floor(((i + 1) / cSceneCount) * 25),
            }));
          }

          // Phase 4: Video clips (concurrent batches of 3 for speed)
          setState((prev) => ({
            ...prev,
            progress: 60,
            statusMessage: "Images complete. Generating video clips...",
          }));

          const VIDEO_CONCURRENCY = 3;
          let completedVideos = 0;

          const generateVideoForScene = async (sceneIdx: number) => {
            try {
              let videoComplete = false;
              let pollAttempts = 0;
              const MAX_POLL_ATTEMPTS = 180;

              while (!videoComplete) {
                pollAttempts++;
                if (pollAttempts > MAX_POLL_ATTEMPTS) {
                  console.warn(`[VIDEO] Scene ${sceneIdx + 1} timed out after ${MAX_POLL_ATTEMPTS} attempts`);
                  return; // Don't throw – retry pass will handle it
                }

                const vidRes = await callPhase(
                  { phase: "video", projectId: cProjectId, generationId: cGenerationId, sceneIndex: sceneIdx },
                  480000,
                  cinematicEndpoint
                );
                if (!vidRes.success) {
                  console.warn(`[VIDEO] Scene ${sceneIdx + 1} failed: ${vidRes.error}`);
                  return; // Don't throw – let other scenes continue
                }
                if (vidRes.status === "complete") {
                  videoComplete = true;
                } else {
                  await sleep(2000);
                }
              }

              completedVideos++;
              setState((prev) => ({
                ...prev,
                statusMessage: `Generating clips (${completedVideos}/${cSceneCount})...`,
                progress: 60 + Math.floor((completedVideos / cSceneCount) * 35),
              }));
            } catch (err) {
              console.warn(`[VIDEO] Scene ${sceneIdx + 1} failed:`, err);
              // Don't throw – let other scenes in batch continue
            }
          };

          // Process in concurrent batches (fault-tolerant)
          for (let batchStart = 0; batchStart < cSceneCount; batchStart += VIDEO_CONCURRENCY) {
            const batchEnd = Math.min(batchStart + VIDEO_CONCURRENCY, cSceneCount);
            const batch = [];
            for (let i = batchStart; i < batchEnd; i++) {
              batch.push(generateVideoForScene(i));
            }
            await Promise.allSettled(batch);
          }

          // Retry pass: re-attempt any scenes that failed (up to 2 rounds)
          const MAX_RETRY_ROUNDS = 2;
          for (let round = 0; round < MAX_RETRY_ROUNDS; round++) {
            const { data: latestGen } = await supabase
              .from("generations")
              .select("scenes")
              .eq("id", cGenerationId)
              .maybeSingle();
            const latestScenes = normalizeScenes(latestGen?.scenes) ?? [];
            const missing = latestScenes
              .map((s, i) => (!s.videoUrl && s.imageUrl ? i : -1))
              .filter((i) => i >= 0);
            if (missing.length === 0) break;

            console.log(`[VIDEO] Retry round ${round + 1}: ${missing.length} scenes missing video`);
            setState((prev) => ({
              ...prev,
              statusMessage: `Retrying ${missing.length} missing clips (round ${round + 1})...`,
            }));

            for (const idx of missing) {
              await generateVideoForScene(idx);
            }
          }

          // Re-fetch scenes from DB before finalize to pick up async completions
          const { data: preFinalGen } = await supabase
            .from("generations")
            .select("scenes")
            .eq("id", cGenerationId)
            .maybeSingle();
          const preFinalScenes = normalizeScenes(preFinalGen?.scenes) ?? [];
          const stillMissing = preFinalScenes.filter((s) => !s.videoUrl && s.imageUrl).length;
          if (stillMissing > 0) {
            console.warn(`[VIDEO] ${stillMissing} scenes still missing video after retries – proceeding to finalize`);
          }

          // Phase 5: Finalize
          setState((prev) => ({
            ...prev,
            step: "rendering",
            progress: 96,
            statusMessage: "Finalizing cinematic...",
          }));

          const cFinalRes = await callPhase(
            { phase: "finalize", projectId: cProjectId, generationId: cGenerationId },
            120000,
            cinematicEndpoint
          );
          if (!cFinalRes.success) throw new Error(cFinalRes.error || "Finalization failed");

          const cFinalScenes = normalizeScenes(cFinalRes.scenes);

          setState({
            step: "complete",
            progress: 100,
            sceneCount: cFinalScenes?.length || cSceneCount,
            currentScene: cFinalScenes?.length || cSceneCount,
            totalImages: cFinalScenes?.length || cSceneCount,
            completedImages: cFinalScenes?.length || cSceneCount,
            isGenerating: false,
            projectId: cProjectId,
            generationId: cGenerationId,
            title: cFinalRes.title,
            scenes: cFinalScenes,
            format: params.format as "landscape" | "portrait" | "square",
            finalVideoUrl: cFinalRes.finalVideoUrl,
            statusMessage: "Cinematic video generated!",
            projectType: "cinematic",
          });

          toast({
            title: "Cinematic Video Generated!",
            description: `"${cFinalRes.title}" is ready.`,
          });

          return;
        }

        // ============= PHASE 1: SCRIPT =============
        setState((prev) => ({ 
          ...prev, 
          step: "scripting", 
          progress: 5,
          statusMessage: "Generating script with AI..." 
        }));

        // Script phase needs longer timeout due to character analysis
        // Smart Flow without voice should skip audio entirely
        const isSmartFlowNoVoice = params.projectType === "smartflow" && !params.voiceType;

        const scriptResult = await callPhase(
          {
            phase: "script",
            content: params.content,
            format: params.format,
            length: params.length,
            style: params.style,
            customStyle: params.customStyle,
            customStyleImage: params.customStyleImage,
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
            skipAudio: isSmartFlowNoVoice, // Tell backend to skip audio phase
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
          statusMessage: isSmartFlowNoVoice 
            ? "Script complete. Starting images..." 
            : "Script complete. Starting audio...",
          costTracking,
          phaseTimings: { script: scriptResult.phaseTime },
        }));

        // ============= PHASE 2: AUDIO (chunked) =============
        // Skip audio phase entirely for Smart Flow without voice
        if (!isSmartFlowNoVoice) {
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
        }

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
          // Images phase can take 3-5 minutes per chunk with Replicate Pro models
          imagesResult = await callPhase(
            {
              phase: "images",
              generationId,
              projectId,
              imageStartIndex,
            },
            480000 // 8 minutes timeout for images (Replicate Pro can be slow)
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

  // Resume an interrupted cinematic generation from the last completed phase
  const resumeCinematic = useCallback(
    async (
      project: ProjectRow,
      generationId: string,
      existingScenes: Scene[],
      resumeFrom: "audio" | "images" | "video" | "finalize"
    ) => {
      const cinematicEndpoint = "generate-cinematic";
      const cProjectId = project.id;
      const cSceneCount = existingScenes.length;
      const phaseLabels = { audio: "Resuming audio...", images: "Resuming images...", video: "Resuming video clips...", finalize: "Finalizing..." };

      setState((prev) => ({
        ...prev,
        step: "visuals",
        isGenerating: true,
        projectId: cProjectId,
        generationId,
        title: project.title,
        sceneCount: cSceneCount,
        scenes: existingScenes,
        format: project.format as "landscape" | "portrait" | "square",
        statusMessage: phaseLabels[resumeFrom],
        progress: resumeFrom === "audio" ? 10 : resumeFrom === "images" ? 35 : resumeFrom === "video" ? 60 : 96,
        projectType: "cinematic",
      }));

      try {
        // Phase 2: Audio (resume – skip scenes that already have audio)
        if (resumeFrom === "audio" || resumeFrom === "images" || resumeFrom === "video" || resumeFrom === "finalize") {
          if (resumeFrom === "audio") {
            for (let i = 0; i < cSceneCount; i++) {
              if (existingScenes[i]?.audioUrl) continue; // skip completed
              setState((prev) => ({ ...prev, statusMessage: `Resuming audio (${i + 1}/${cSceneCount})...`, progress: 10 + Math.floor(((i + 0.25) / cSceneCount) * 25) }));
              let audioComplete = false;
              while (!audioComplete) {
                const audioRes = await callPhase({ phase: "audio", projectId: cProjectId, generationId, sceneIndex: i }, 300000, cinematicEndpoint);
                if (!audioRes.success) throw new Error(audioRes.error || "Audio generation failed");
                if (audioRes.status === "complete") audioComplete = true;
                else await sleep(1200);
              }
              setState((prev) => ({ ...prev, progress: 10 + Math.floor(((i + 1) / cSceneCount) * 25) }));
            }
          }
        }

        // Phase 3: Images (resume – skip scenes that already have images)
        if (resumeFrom === "audio" || resumeFrom === "images") {
          setState((prev) => ({ ...prev, progress: 35, statusMessage: "Resuming images..." }));
          for (let i = 0; i < cSceneCount; i++) {
            if (existingScenes[i]?.imageUrl) continue;
            setState((prev) => ({ ...prev, statusMessage: `Creating images (${i + 1}/${cSceneCount})...`, progress: 35 + Math.floor(((i + 0.25) / cSceneCount) * 25) }));
            const imgRes = await callPhase({ phase: "images", projectId: cProjectId, generationId, sceneIndex: i }, 480000, cinematicEndpoint);
            if (!imgRes.success) throw new Error(imgRes.error || "Image generation failed");
            setState((prev) => ({ ...prev, progress: 35 + Math.floor(((i + 1) / cSceneCount) * 25) }));
          }
        }

        // Phase 4: Video clips (resume – skip scenes that already have video)
        if (resumeFrom === "audio" || resumeFrom === "images" || resumeFrom === "video") {
          setState((prev) => ({ ...prev, progress: 60, statusMessage: "Resuming video clips..." }));
          const VIDEO_CONCURRENCY = 3;
          let completedVideos = existingScenes.filter((s) => !!s.videoUrl).length;

          const generateVideoForScene = async (sceneIdx: number) => {
            if (existingScenes[sceneIdx]?.videoUrl) return; // skip completed
            try {
              let videoComplete = false;
              let pollAttempts = 0;
              const MAX_POLL_ATTEMPTS = 180;
              while (!videoComplete) {
                pollAttempts++;
                if (pollAttempts > MAX_POLL_ATTEMPTS) {
                  console.warn(`[VIDEO] Scene ${sceneIdx + 1} timed out after ${MAX_POLL_ATTEMPTS} attempts`);
                  return;
                }
                const vidRes = await callPhase({ phase: "video", projectId: cProjectId, generationId, sceneIndex: sceneIdx }, 480000, cinematicEndpoint);
                if (!vidRes.success) {
                  console.warn(`[VIDEO] Scene ${sceneIdx + 1} failed: ${vidRes.error}`);
                  return;
                }
                if (vidRes.status === "complete") videoComplete = true;
                else await sleep(2000);
              }
              completedVideos++;
              setState((prev) => ({ ...prev, statusMessage: `Generating clips (${completedVideos}/${cSceneCount})...`, progress: 60 + Math.floor((completedVideos / cSceneCount) * 35) }));
            } catch (err) {
              console.warn(`[VIDEO] Scene ${sceneIdx + 1} failed:`, err);
            }
          };

          // Process in concurrent batches (fault-tolerant)
          for (let batchStart = 0; batchStart < cSceneCount; batchStart += VIDEO_CONCURRENCY) {
            const batch = [];
            for (let i = batchStart; i < Math.min(batchStart + VIDEO_CONCURRENCY, cSceneCount); i++) {
              batch.push(generateVideoForScene(i));
            }
            await Promise.allSettled(batch);
          }

          // Retry pass: re-attempt any scenes that failed (up to 2 rounds)
          const MAX_RETRY_ROUNDS = 2;
          for (let round = 0; round < MAX_RETRY_ROUNDS; round++) {
            const { data: latestGen } = await supabase
              .from("generations")
              .select("scenes")
              .eq("id", generationId)
              .maybeSingle();
            const latestScenes = normalizeScenes(latestGen?.scenes) ?? [];
            const missing = latestScenes
              .map((s, i) => (!s.videoUrl && s.imageUrl ? i : -1))
              .filter((i) => i >= 0);
            if (missing.length === 0) break;

            console.log(`[VIDEO] Resume retry round ${round + 1}: ${missing.length} scenes missing video`);
            setState((prev) => ({ ...prev, statusMessage: `Retrying ${missing.length} missing clips (round ${round + 1})...` }));

            for (const idx of missing) {
              await generateVideoForScene(idx);
            }
          }
        }

        // Re-fetch scenes from DB before finalize to pick up async completions
        const { data: preFinalGen } = await supabase
          .from("generations")
          .select("scenes")
          .eq("id", generationId)
          .maybeSingle();
        const preFinalScenes = normalizeScenes(preFinalGen?.scenes) ?? [];
        const stillMissing = preFinalScenes.filter((s) => !s.videoUrl && s.imageUrl).length;
        if (stillMissing > 0) {
          console.warn(`[VIDEO] ${stillMissing} scenes still missing video after retries – proceeding to finalize`);
        }

        // Phase 5: Finalize
        setState((prev) => ({ ...prev, step: "rendering", progress: 96, statusMessage: "Finalizing cinematic..." }));
        const cFinalRes = await callPhase({ phase: "finalize", projectId: cProjectId, generationId }, 120000, cinematicEndpoint);
        if (!cFinalRes.success) throw new Error(cFinalRes.error || "Finalization failed");
        const cFinalScenes = normalizeScenes(cFinalRes.scenes);

        setState({
          step: "complete", progress: 100, sceneCount: cFinalScenes?.length || cSceneCount,
          currentScene: cFinalScenes?.length || cSceneCount, totalImages: cFinalScenes?.length || cSceneCount,
          completedImages: cFinalScenes?.length || cSceneCount, isGenerating: false,
          projectId: cProjectId, generationId, title: cFinalRes.title,
          scenes: cFinalScenes, format: project.format as "landscape" | "portrait" | "square",
          finalVideoUrl: cFinalRes.finalVideoUrl, statusMessage: "Cinematic resumed and completed!",
          projectType: "cinematic",
        });

        toast({ title: "Generation Resumed!", description: `"${cFinalRes.title}" is ready.` });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Resume failed";
        setState((prev) => ({ ...prev, step: "error", isGenerating: false, error: errorMessage, statusMessage: errorMessage }));
        toast({ variant: "destructive", title: "Resume Failed", description: errorMessage });
      }
    },
    [toast, callPhase],
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
        .select("id,title,content,format,length,style,presenter_focus,character_description,voice_type,voice_id,voice_name,brand_mark,character_consistency_enabled,inspiration_style,story_tone,story_genre,voice_inclination,project_type")
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
        .select("id,status,progress,scenes,error_message,video_url")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (generation?.status === "complete") {
        const scenes = normalizeScenes(generation.scenes) ?? [];
        const meta = extractMeta(Array.isArray(generation.scenes) ? generation.scenes : []);
        const isCinematic = project.project_type === "cinematic";

        // If cinematic and some scenes are missing videoUrl, auto-resume video phase
        if (isCinematic && scenes.length > 0 && scenes.some((s) => !s.videoUrl && s.imageUrl)) {
          void resumeCinematic(project, generation.id, scenes, "video");
        } else {
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
            finalVideoUrl: isCinematic ? (generation.video_url ?? undefined) : undefined,
            costTracking: meta.costTracking,
            phaseTimings: meta.phaseTimings,
            totalTimeMs: meta.totalTimeMs,
            projectType: (project.project_type as GenerationState["projectType"]) ?? undefined,
          });
        }
      } else if (generation?.status === "error") {
        // For cinematic: if we have partial scene data, attempt to resume instead of just showing error
        const errorScenes = normalizeScenes(generation.scenes) ?? [];
        if (project.project_type === "cinematic" && errorScenes.length > 0) {
          const allHaveAudio = errorScenes.every((s) => !!s.audioUrl);
          const allHaveImages = errorScenes.every((s) => !!s.imageUrl);
          const allHaveVideo = errorScenes.every((s) => !!s.videoUrl);

          // Reset generation status so resume can proceed
          await supabase.from("generations").update({ status: "processing", error_message: null }).eq("id", generation.id);

          if (allHaveVideo) {
            void resumeCinematic(project, generation.id, errorScenes, "finalize");
          } else if (allHaveImages) {
            void resumeCinematic(project, generation.id, errorScenes, "video");
          } else if (allHaveAudio) {
            void resumeCinematic(project, generation.id, errorScenes, "images");
          } else {
            void resumeCinematic(project, generation.id, errorScenes, "audio");
          }
        } else {
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
        }
      } else if (generation && project.project_type === "cinematic") {
        // Cinematic resume: detect last completed phase and resume from there
        const scenes = normalizeScenes(generation.scenes) ?? [];
        const sceneCount = scenes.length;

        if (sceneCount === 0) {
          // Script phase didn't complete, can't resume
          setState({
            step: "error", progress: 0, sceneCount: 0, currentScene: 0,
            totalImages: 0, completedImages: 0, isGenerating: false,
            projectId, generationId: generation.id, title: project.title,
            format: project.format as "landscape" | "portrait" | "square",
            error: "This generation was interrupted before the script completed. Please try again.",
          });
        } else {
          // Determine which phase to resume from by inspecting scene data
          const allHaveAudio = scenes.every((s) => !!s.audioUrl);
          const allHaveImages = scenes.every((s) => !!s.imageUrl);
          const allHaveVideo = scenes.every((s) => !!s.videoUrl);

          if (allHaveVideo) {
            // All done, just needs finalize
            void resumeCinematic(project, generation.id, scenes, "finalize");
          } else if (allHaveImages) {
            void resumeCinematic(project, generation.id, scenes, "video");
          } else if (allHaveAudio) {
            void resumeCinematic(project, generation.id, scenes, "images");
          } else {
            void resumeCinematic(project, generation.id, scenes, "audio");
          }
        }
      } else if (generation) {
        // Non-cinematic interrupted generation
        setState({
          step: "error", progress: 0, sceneCount: state.sceneCount,
          currentScene: 0, totalImages: state.sceneCount, completedImages: 0,
          isGenerating: false, projectId, generationId: generation.id,
          title: project.title, format: project.format as "landscape" | "portrait" | "square",
          error: "This generation was interrupted. Please try again.",
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
    [toast, state.sceneCount, resumeCinematic],
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
