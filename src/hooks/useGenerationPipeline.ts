import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type GenerationStep = "idle" | "analysis" | "scripting" | "visuals" | "rendering" | "complete" | "error";

export interface Scene {
  number: number;
  voiceover: string;
  visualPrompt: string;
  duration: number;
  imageUrl?: string;
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

  const startGeneration = useCallback(async (params: GenerationParams) => {
    // Determine expected scene count based on length
    const sceneCounts: Record<string, number> = {
      short: 4,
      brief: 6,
      presentation: 10,
    };
    const expectedSceneCount = sceneCounts[params.length] || 6;

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
      });

      toast({
        title: "Video Generated!",
        description: `"${result.title}" is ready with ${result.scenes?.length || 0} scenes.`,
      });
    } catch (error) {
      console.error("Generation error:", error);
      
      const errorMessage = error instanceof Error ? error.message : "Generation failed";
      
      setState(prev => ({
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