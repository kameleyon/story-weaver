import { useState, useCallback } from "react";

export type GenerationStep = "idle" | "analysis" | "scripting" | "visuals" | "rendering" | "complete";

export interface GenerationState {
  step: GenerationStep;
  progress: number;
  sceneCount: number;
  currentScene: number;
  isGenerating: boolean;
}

const STEP_DURATIONS: Record<GenerationStep, number> = {
  idle: 0,
  analysis: 2500,
  scripting: 3500,
  visuals: 4500,
  rendering: 2500,
  complete: 0,
};

export function useGenerationPipeline() {
  const [state, setState] = useState<GenerationState>({
    step: "idle",
    progress: 0,
    sceneCount: 8,
    currentScene: 0,
    isGenerating: false,
  });

  const simulateStep = useCallback(
    (step: GenerationStep, duration: number): Promise<void> => {
      return new Promise((resolve) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min((elapsed / duration) * 100, 100);

          setState((prev) => {
            if (step === "visuals") {
              const currentScene = Math.floor((progress / 100) * prev.sceneCount) + 1;
              return { ...prev, step, progress, currentScene: Math.min(currentScene, prev.sceneCount) };
            }
            return { ...prev, step, progress };
          });

          if (elapsed >= duration) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
      });
    },
    []
  );

  const startGeneration = useCallback(async () => {
    setState((prev) => ({ ...prev, isGenerating: true, step: "idle", progress: 0, currentScene: 0 }));

    // Step 1: Analysis
    await simulateStep("analysis", STEP_DURATIONS.analysis);

    // Step 2: Scripting
    setState((prev) => ({ ...prev, progress: 0 }));
    await simulateStep("scripting", STEP_DURATIONS.scripting);

    // Step 3: Visuals
    setState((prev) => ({ ...prev, progress: 0, currentScene: 0 }));
    await simulateStep("visuals", STEP_DURATIONS.visuals);

    // Step 4: Rendering
    setState((prev) => ({ ...prev, progress: 0 }));
    await simulateStep("rendering", STEP_DURATIONS.rendering);

    // Complete
    setState((prev) => ({ ...prev, step: "complete", progress: 100, isGenerating: false }));
  }, [simulateStep]);

  const reset = useCallback(() => {
    setState({
      step: "idle",
      progress: 0,
      sceneCount: 8,
      currentScene: 0,
      isGenerating: false,
    });
  }, []);

  return { state, startGeneration, reset };
}
