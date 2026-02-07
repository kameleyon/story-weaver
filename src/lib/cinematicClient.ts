import { supabase } from "@/integrations/supabase/client";

// Helper to get a fresh session token
const getFreshSession = async (): Promise<string> => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshData.session) {
      throw new Error("Session expired. Please refresh the page and try again.");
    }
    return refreshData.session.access_token;
  }
  return session.access_token;
};

interface Scene {
  visualPrompt?: string;
  visual_prompt?: string;
  imageUrl?: string;
  image_url?: string;
  audioUrl?: string;
  audio_url?: string;
  duration?: number;
}

interface GenerateCinematicOptions {
  generationId: string;
  projectId: string;
  scenes: Scene[];
  characterConsistencyEnabled?: boolean;
  onProgress?: (progress: number, message: string) => void;
}

interface CinematicResult {
  success: boolean;
  finalVideoUrl?: string;
  sceneVideoUrls?: string[];
  error?: string;
}

/**
 * Generate cinematic videos using the Glif API via the generate-cinematic edge function.
 * This is an admin-only feature.
 */
export async function generateCinematicVideos(
  options: GenerateCinematicOptions
): Promise<CinematicResult> {
  const { generationId, projectId, scenes, characterConsistencyEnabled, onProgress } = options;

  const accessToken = await getFreshSession();

  onProgress?.(45, "Generating cinematic video scenes...");

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cinematic`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: "generate-all",
        generationId,
        projectId,
        scenes,
        characterConsistencyEnabled,
      }),
    }
  );

  if (!response.ok) {
    let errorMessage = "Cinematic generation failed";
    try {
      const errorData = await response.json();
      errorMessage = errorData?.error || errorMessage;
    } catch {
      // ignore
    }

    if (response.status === 403) {
      throw new Error("Admin access required for Cinematic mode");
    }
    if (response.status === 401) {
      throw new Error("Session expired. Please refresh the page and try again.");
    }

    throw new Error(errorMessage);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Cinematic generation failed");
  }

  return {
    success: true,
    finalVideoUrl: result.finalVideoUrl,
    sceneVideoUrls: result.sceneVideoUrls,
  };
}

/**
 * Generate video for a single scene using Glif
 */
export async function generateCinematicScene(
  generationId: string,
  sceneIndex: number,
  prompt: string,
  options: {
    imageUrl?: string;
    audioUrl?: string;
    duration?: number;
    characterConsistencyEnabled?: boolean;
  }
): Promise<string> {
  const accessToken = await getFreshSession();

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cinematic`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: "generate-scene-video",
        generationId,
        sceneIndex,
        prompt,
        ...options,
      }),
    }
  );

  if (!response.ok) {
    let errorMessage = "Scene video generation failed";
    try {
      const errorData = await response.json();
      errorMessage = errorData?.error || errorMessage;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  const result = await response.json();

  if (!result.success || !result.videoUrl) {
    throw new Error(result.error || "No video URL returned");
  }

  return result.videoUrl;
}

/**
 * Stitch multiple scene videos into a final video
 */
export async function stitchCinematicVideos(
  generationId: string,
  videoUrls: string[]
): Promise<string> {
  const accessToken = await getFreshSession();

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cinematic`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        action: "stitch-videos",
        generationId,
        videoUrls,
      }),
    }
  );

  if (!response.ok) {
    let errorMessage = "Video stitching failed";
    try {
      const errorData = await response.json();
      errorMessage = errorData?.error || errorMessage;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  const result = await response.json();

  if (!result.success || !result.finalVideoUrl) {
    throw new Error(result.error || "No final video URL returned");
  }

  return result.finalVideoUrl;
}
