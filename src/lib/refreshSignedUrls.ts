/**
 * Refreshes expired Supabase signed URLs by extracting storage paths
 * and creating new signed URLs with fresh tokens.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Scene } from "@/hooks/generation/types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SIGNED_PATH_REGEX = /\/storage\/v1\/object\/sign\/([^?]+)/;
const PUBLIC_PATH_REGEX = /\/storage\/v1\/object\/public\/([^?]+)/;
const SIGN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Extract bucket and path from a Supabase storage signed/public URL.
 * Returns null if the URL isn't a Supabase storage URL.
 */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url || !url.includes(SUPABASE_URL)) return null;

  const signedMatch = url.match(SIGNED_PATH_REGEX);
  if (signedMatch) {
    const fullPath = decodeURIComponent(signedMatch[1]);
    const slashIdx = fullPath.indexOf("/");
    if (slashIdx === -1) return null;
    return { bucket: fullPath.slice(0, slashIdx), path: fullPath.slice(slashIdx + 1) };
  }

  const publicMatch = url.match(PUBLIC_PATH_REGEX);
  if (publicMatch) {
    // Public URLs don't expire – skip
    return null;
  }

  return null;
}

/** Re-sign a single URL; returns original if not a signed URL or on error */
async function refreshUrl(url: string): Promise<string> {
  const parsed = parseStorageUrl(url);
  if (!parsed) return url;

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, SIGN_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    console.warn("[refreshSignedUrls] Failed to refresh URL:", parsed.path, error?.message);
    return url;
  }
  return data.signedUrl;
}

/** Refresh all signed URLs in a scene's imageUrl, imageUrls, audioUrl, and videoUrl */
async function refreshScene(scene: Scene): Promise<Scene> {
  const refreshed = { ...scene };

  // Batch all URL refresh promises
  const promises: Promise<void>[] = [];

  if (scene.imageUrl) {
    promises.push(refreshUrl(scene.imageUrl).then((u) => { refreshed.imageUrl = u; }));
  }

  if (scene.imageUrls?.length) {
    const urlPromises = scene.imageUrls.map((u) => refreshUrl(u));
    promises.push(Promise.all(urlPromises).then((urls) => { refreshed.imageUrls = urls; }));
  }

  if (scene.audioUrl) {
    promises.push(refreshUrl(scene.audioUrl).then((u) => { refreshed.audioUrl = u; }));
  }

  if (scene.videoUrl) {
    promises.push(refreshUrl(scene.videoUrl).then((u) => { refreshed.videoUrl = u; }));
  }

  await Promise.all(promises);
  return refreshed;
}

/**
 * Given an array of scenes, refresh all expired signed URLs.
 * Processes scenes in parallel for speed.
 */
export async function refreshScenesSignedUrls(scenes: Scene[]): Promise<Scene[]> {
  if (!scenes.length) return scenes;

  // Quick check: if the first scene's imageUrl doesn't look like a signed URL, skip
  const firstUrl = scenes[0]?.imageUrl || scenes[0]?.imageUrls?.[0];
  if (!firstUrl || !parseStorageUrl(firstUrl)) {
    return scenes; // Not signed URLs, nothing to refresh
  }

  console.log("[refreshSignedUrls] Refreshing signed URLs for", scenes.length, "scenes");
  const refreshed = await Promise.all(scenes.map(refreshScene));
  console.log("[refreshSignedUrls] Done refreshing URLs");
  return refreshed;
}
