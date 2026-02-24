import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Scene } from "@/hooks/useGenerationPipeline";

interface RegenerationState {
  isRegenerating: boolean;
  regeneratingType: "audio" | "image" | null;
  sceneIndex: number | null;
}

export function useSceneRegeneration(
  generationId: string | undefined,
  projectId: string | undefined,
  scenes: Scene[] | undefined,
  onScenesUpdate: (scenes: Scene[]) => void
) {
  const { toast } = useToast();
  const [state, setState] = useState<RegenerationState>({
    isRegenerating: false,
    regeneratingType: null,
    sceneIndex: null,
  });

  const regenerateAudio = useCallback(
    async (sceneIndex: number, newVoiceover: string) => {
      if (!generationId || !projectId || !scenes) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Missing generation context",
        });
        return;
      }

      setState({ isRegenerating: true, regeneratingType: "audio", sceneIndex });

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-video`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              phase: "regenerate-audio",
              generationId,
              projectId,
              sceneIndex,
              newVoiceover,
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to regenerate audio");
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Audio regeneration failed");
        }

        // Update local scenes with new audio
        const updatedScenes = [...scenes];
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          voiceover: newVoiceover,
          audioUrl: result.audioUrl,
          duration: result.duration || updatedScenes[sceneIndex].duration,
        };

        onScenesUpdate(updatedScenes);

        toast({
          title: "Audio Regenerated",
          description: `Scene ${sceneIndex + 1} audio has been updated.`,
        });
      } catch (error) {
        console.error("Audio regeneration error:", error);
        toast({
          variant: "destructive",
          title: "Regeneration Failed",
          description: error instanceof Error ? error.message : "Failed to regenerate audio",
        });
      } finally {
        setState({ isRegenerating: false, regeneratingType: null, sceneIndex: null });
      }
    },
    [generationId, projectId, scenes, onScenesUpdate, toast]
  );

  const regenerateImage = useCallback(
    async (sceneIndex: number, imageModification: string, imageIndex?: number) => {
      if (!generationId || !projectId || !scenes) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Missing generation context",
        });
        return;
      }

      setState({ isRegenerating: true, regeneratingType: "image", sceneIndex });

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

      const scene = scenes[sceneIndex];
      const hasNoImages = !scene.imageUrl && (!scene.imageUrls || scene.imageUrls.filter(Boolean).length === 0);
      const expectedImageCount = 3; // primary + 2 sub-visuals

      // If the scene has NO images at all, generate ALL sub-images regardless of imageIndex passed
      const indicesToGenerate = hasNoImages
        ? Array.from({ length: expectedImageCount }, (_, i) => i)
        : [imageIndex ?? 0];

      console.log(`[SceneRegen] Scene ${sceneIndex + 1}: hasNoImages=${hasNoImages}, generating indices`, indicesToGenerate);

        console.log(`[SceneRegen] Scene ${sceneIndex + 1}: generating ${indicesToGenerate.length} image(s)`, indicesToGenerate);

        const updatedScenes = [...scenes];
        const newImageUrls: string[] = [...(scene.imageUrls || [])];

        for (const idx of indicesToGenerate) {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-video`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                phase: "regenerate-image",
                generationId,
                projectId,
                sceneIndex,
                imageModification,
                imageIndex: idx,
              }),
            }
          );

          if (!response.ok) {
            const error = await response.json();
            console.warn(`[SceneRegen] Image ${idx} failed:`, error.error);
            continue; // Try remaining images
          }

          const result = await response.json();
          if (!result.success) {
            console.warn(`[SceneRegen] Image ${idx} failed:`, result.error);
            continue;
          }

          // Update the specific image
          while (newImageUrls.length <= idx) newImageUrls.push("");
          newImageUrls[idx] = result.imageUrl;
          if (idx === 0) {
            updatedScenes[sceneIndex] = {
              ...updatedScenes[sceneIndex],
              imageUrl: result.imageUrl,
            };
          }
        }

        const validUrls = newImageUrls.filter(Boolean);
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          imageUrl: validUrls[0] || updatedScenes[sceneIndex].imageUrl,
          imageUrls: validUrls.length > 0 ? validUrls : updatedScenes[sceneIndex].imageUrls,
        };

        onScenesUpdate(updatedScenes);

        const generatedCount = indicesToGenerate.length;
        toast({
          title: "Image Regenerated",
          description: generatedCount > 1
            ? `Scene ${sceneIndex + 1}: ${validUrls.length} of ${generatedCount} images generated.`
            : `Scene ${sceneIndex + 1}${typeof imageIndex === 'number' ? ` image ${imageIndex + 1}` : ''} has been updated.`,
        });
      } catch (error) {
        console.error("Image regeneration error:", error);
        toast({
          variant: "destructive",
          title: "Regeneration Failed",
          description: error instanceof Error ? error.message : "Failed to regenerate image",
        });
      } finally {
        setState({ isRegenerating: false, regeneratingType: null, sceneIndex: null });
      }
    },
    [generationId, projectId, scenes, onScenesUpdate, toast]
  );

  return {
    ...state,
    regenerateAudio,
    regenerateImage,
  };
}
