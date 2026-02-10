import { useState, useCallback, useRef } from "react";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const EXPORT_VERSION = "v8.0"; // Mobile OOM fix — frame-by-frame processing

export type ExportStatus = "idle" | "loading" | "rendering" | "encoding" | "uploading" | "complete" | "error";

interface ExportState {
  status: ExportStatus;
  progress: number;
  error?: string;
  warning?: string;
  videoUrl?: string;
}

interface CinematicScene {
  number: number;
  voiceover: string;
  visualPrompt: string;
  videoUrl?: string;
  audioUrl?: string;
  duration: number;
}

// Helper to generate AAC AudioSpecificConfig (2 bytes)
function generateAACAudioSpecificConfig(sampleRate: number, channels: number): Uint8Array {
  const objectType = 2; // AAC LC
  const frequencyIndex = {
    96000: 0, 88200: 1, 64000: 2, 48000: 3, 44100: 4, 32000: 5, 24000: 6,
    22050: 7, 16000: 8, 12000: 9, 11025: 10, 8000: 11
  }[sampleRate] ?? 4;
  const channelConfig = channels;
  const config = new Uint8Array(2);
  config[0] = (objectType << 3) | ((frequencyIndex >> 1) & 0x07);
  config[1] = ((frequencyIndex & 0x01) << 7) | (channelConfig << 3);
  return config;
}

const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
  ]);
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

/**
 * Load a video as a blob, wait for it to be fully decodable.
 */
async function loadVideoElement(url: string, timeoutMs = 30000): Promise<{ video: HTMLVideoElement; blobUrl: string }> {
  console.log(`[CinematicExport ${EXPORT_VERSION}] Loading video:`, url.substring(0, 80));
  const response = await withTimeout(fetch(url, { mode: "cors" }), timeoutMs, "Video fetch timed out");
  if (!response.ok) throw new Error(`Failed to fetch video: ${response.status}`);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.src = blobUrl;

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      video.onerror = () => reject(new Error("Failed to decode video"));
      const onReady = () => { resolve(); };
      video.addEventListener("canplay", onReady, { once: true });
      video.addEventListener("loadeddata", onReady, { once: true });
    }),
    timeoutMs,
    "Video decode timed out"
  );

  console.log(`[CinematicExport ${EXPORT_VERSION}] Video loaded:`, {
    duration: video.duration, w: video.videoWidth, h: video.videoHeight
  });
  return { video, blobUrl };
}

/**
 * Properly dispose of a video element and its blob URL.
 */
function disposeVideo(video: HTMLVideoElement, blobUrl: string) {
  video.pause();
  URL.revokeObjectURL(blobUrl);
  video.removeAttribute("src");
  video.load();
  video.remove();
}

async function loadAudioBuffer(url: string, decodeCtx: OfflineAudioContext, timeoutMs = 15000): Promise<AudioBuffer | null> {
  try {
    const response = await withTimeout(fetch(url, { mode: "cors" }), timeoutMs, "Audio fetch timed out");
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return await decodeCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.warn("[CinematicExport] Audio load failed:", e);
    return null;
  }
}

/**
 * FRAME-BY-FRAME rendering with backpressure.
 * Instead of caching all frames in memory (which causes OOM on mobile),
 * we seek to each frame position, draw it, encode it, and immediately release it.
 */
async function renderSceneFrameByFrame(
  videoElement: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  videoEncoder: any,
  fps: number,
  sourceDuration: number,
  targetDuration: number,
  timestampOffset: number,
  onProgress?: (rendered: number, total: number) => void
): Promise<number> {
  const totalFrames = Math.ceil(targetDuration * fps);
  const frameDurationMicro = Math.round(1e6 / fps);
  const playbackRate = Math.max(0.25, Math.min(1.0, sourceDuration / targetDuration));

  const videoAspect = videoElement.videoWidth / videoElement.videoHeight;
  const canvasAspect = canvas.width / canvas.height;
  let dw: number, dh: number, dx: number, dy: number;
  if (videoAspect > canvasAspect) {
    dw = canvas.width; dh = canvas.width / videoAspect;
    dx = 0; dy = (canvas.height - dh) / 2;
  } else {
    dh = canvas.height; dw = canvas.height * videoAspect;
    dx = (canvas.width - dw) / 2; dy = 0;
  }

  console.log(`[CinematicExport ${EXPORT_VERSION}] Frame-by-frame: ${totalFrames} frames, rate=${playbackRate.toFixed(3)}x`);

  let rendered = 0;

  for (let frame = 0; frame < totalFrames; frame++) {
    // --- MOBILE CRASH GUARD: BACKPRESSURE ---
    // If encoder has more than 3 frames pending, wait for it to catch up.
    // This is the key fix that prevents OOM crashes on mobile.
    while (videoEncoder.encodeQueueSize > 3) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    // Calculate which source time to seek to
    const outputTimeSec = frame / fps;
    const sourceTimeSec = Math.min(outputTimeSec * playbackRate, sourceDuration - 0.05);

    // Seek to the target time
    videoElement.currentTime = sourceTimeSec;
    await new Promise<void>(r => {
      if (!videoElement.seeking) { r(); return; }
      const t = setTimeout(r, 2000); // 2s timeout for seek
      videoElement.addEventListener("seeked", () => { clearTimeout(t); r(); }, { once: true });
    });

    // Draw frame
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(videoElement, dx, dy, dw, dh);

    // Create bitmap, encode it, and IMMEDIATELY release it
    const bitmap = await createImageBitmap(canvas);
    const timestamp = timestampOffset + Math.round(frame * frameDurationMicro);
    const keyFrame = frame % (fps * 2) === 0;

    const vf = new VideoFrame(bitmap, { timestamp, duration: frameDurationMicro });
    videoEncoder.encode(vf, { keyFrame });
    vf.close();
    bitmap.close(); // CRITICAL: Release GPU memory immediately

    rendered++;
    if (onProgress) onProgress(rendered, totalFrames);

    // Yield to UI periodically to keep the page responsive
    if (frame % 10 === 0) await yieldToUI();
  }

  return rendered;
}

export function useCinematicExport() {
  const [state, setState] = useState<ExportState>({ status: "idle", progress: 0 });
  const abortRef = useRef(false);

  const reset = useCallback(() => {
    abortRef.current = true;
    setState({ status: "idle", progress: 0 });
  }, []);

  const exportVideo = useCallback(
    async (
      scenes: CinematicScene[],
      format: "landscape" | "portrait" | "square",
      generationId?: string,
      _retryCount = 0
    ) => {
      abortRef.current = false;
      const MAX_RETRIES = 1;

      console.log(`[CinematicExport ${EXPORT_VERSION}] Starting export`, { scenes: scenes.length, format, generationId, retry: _retryCount });

      const VideoEncoderCtor = (globalThis as any).VideoEncoder;
      const AudioEncoderCtor = (globalThis as any).AudioEncoder;

      if (!VideoEncoderCtor) {
        const error = "Your browser does not support video export. Use Chrome, Edge, or Safari 16.4+";
        setState({ status: "error", progress: 0, error });
        toast({ title: "Export Failed", description: error, variant: "destructive" });
        throw new Error(error);
      }

      const scenesWithVideo = scenes.filter(s => !!s.videoUrl);
      if (scenesWithVideo.length === 0) {
        const error = "No video clips to export";
        setState({ status: "error", progress: 0, error });
        toast({ title: "Export Failed", description: error, variant: "destructive" });
        throw new Error(error);
      }

      setState({ status: "loading", progress: 5 });

      try {
        const onIOS = isIOS();
        // Use lower resolution on iOS to prevent OOM
        const dimensions = onIOS
          ? { landscape: { w: 960, h: 540 }, portrait: { w: 540, h: 960 }, square: { w: 720, h: 720 } }
          : { landscape: { w: 1920, h: 1080 }, portrait: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } };
        const dim = dimensions[format];
        const fps = onIOS ? 24 : 30;
        // Lower bitrate on iOS to prevent crashes while keeping quality
        const bitrate = onIOS ? 2_000_000 : 6_000_000;

        // Audio support check
        const wantsAudio = scenesWithVideo.some(s => !!s.audioUrl);
        let audioTrackConfig: any = null;
        if (wantsAudio && AudioEncoderCtor) {
          for (const cfg of [
            { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 },
            { codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000 },
          ]) {
            try { if (await AudioEncoderCtor.isConfigSupported(cfg)) { audioTrackConfig = cfg; break; } } catch { }
          }
        }

        setState({ status: "loading", progress: 10 });

        const muxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: { codec: "avc", width: dim.w, height: dim.h },
          audio: audioTrackConfig ? { codec: "aac", numberOfChannels: audioTrackConfig.numberOfChannels, sampleRate: audioTrackConfig.sampleRate } : undefined,
          fastStart: "in-memory"
        });

        let manualAudioDesc: Uint8Array | null = null;
        if (audioTrackConfig) {
          manualAudioDesc = generateAACAudioSpecificConfig(audioTrackConfig.sampleRate, audioTrackConfig.numberOfChannels);
        }

        const canvas = document.createElement("canvas");
        canvas.width = dim.w;
        canvas.height = dim.h;
        const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true, willReadFrequently: false })!;

        let globalFrameCount = 0;
        let globalAudioSampleCount = 0;
        let firstAudioChunk = true;
        let cumulativeTimestampOffset = 0;

        // Audio encoder
        let audioEncoder: any = null;
        if (audioTrackConfig) {
          audioEncoder = new AudioEncoderCtor({
            output: (chunk: any, meta: any) => {
              if (firstAudioChunk && manualAudioDesc) {
                meta.decoderConfig = { ...(meta.decoderConfig || {}), description: manualAudioDesc };
                firstAudioChunk = false;
              }
              try { muxer.addAudioChunk(chunk, meta); } catch (e) { console.warn("[CinematicExport] audio chunk err", e); }
            },
            error: (e: any) => console.warn("[CinematicExport] Audio encode error", e)
          });
          audioEncoder.configure(audioTrackConfig);
        }

        // Video encoder — Baseline profile on iOS for compatibility
        const videoEncoder = new VideoEncoderCtor({
          output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
          error: (e: any) => console.error("[CinematicExport] Video encode error", e)
        });
        videoEncoder.configure({
          codec: onIOS ? "avc1.42001f" : "avc1.42E028",
          width: dim.w, height: dim.h,
          bitrate,
          framerate: fps,
          latencyMode: "quality",
        });

        const decodeCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(1, 1, audioTrackConfig?.sampleRate || 48000);

        // Process each scene ONE AT A TIME — frame-by-frame (no caching)
        for (let i = 0; i < scenesWithVideo.length; i++) {
          if (abortRef.current) break;
          const scene = scenesWithVideo[i];
          const baseProgress = 15 + Math.floor((i / scenesWithVideo.length) * 70);
          setState({ status: "rendering", progress: baseProgress });

          console.log(`[CinematicExport ${EXPORT_VERSION}] Processing scene ${i + 1}/${scenesWithVideo.length}`);

          // Load video
          const { video: tempVideo, blobUrl } = await loadVideoElement(scene.videoUrl!);

          // Process audio
          let sceneAudioDuration: number | null = null;
          if (audioEncoder && audioTrackConfig && scene.audioUrl) {
            const sceneAudioBuffer = await loadAudioBuffer(scene.audioUrl, decodeCtx);
            if (sceneAudioBuffer) {
              sceneAudioDuration = sceneAudioBuffer.duration;
              const sampleRate = audioTrackConfig.sampleRate;
              const renderLen = Math.ceil(sceneAudioBuffer.duration * sampleRate);
              const offlineCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(2, renderLen, sampleRate);
              const source = offlineCtx.createBufferSource();
              source.buffer = sceneAudioBuffer;
              source.connect(offlineCtx.destination);
              source.start(0);
              const renderedBuf = await offlineCtx.startRendering();

              const rawData = new Float32Array(renderedBuf.length * 2);
              const left = renderedBuf.getChannelData(0);
              const right = renderedBuf.numberOfChannels > 1 ? renderedBuf.getChannelData(1) : left;
              for (let s = 0; s < renderedBuf.length; s++) {
                rawData[s * 2] = left[s];
                rawData[s * 2 + 1] = right[s];
              }

              const chunkFrames = 4096;
              for (let offset = 0; offset < renderedBuf.length; offset += chunkFrames) {
                const size = Math.min(chunkFrames, renderedBuf.length - offset);
                const chunkData = rawData.subarray(offset * 2, (offset + size) * 2);
                const audioData = new AudioData({
                  format: "f32", sampleRate, numberOfFrames: size, numberOfChannels: 2,
                  timestamp: Math.floor((globalAudioSampleCount / sampleRate) * 1_000_000),
                  data: chunkData
                });
                audioEncoder.encode(audioData);
                audioData.close();
                globalAudioSampleCount += size;
              }
            }
          }

          // Audio duration drives video length
          const targetDuration = sceneAudioDuration || scene.duration || tempVideo.duration || 5;
          const sourceDuration = tempVideo.duration || 5;
          console.log(`[CinematicExport ${EXPORT_VERSION}] Scene ${i + 1}: target=${targetDuration.toFixed(2)}s, source=${sourceDuration.toFixed(2)}s`);

          // FRAME-BY-FRAME rendering with backpressure (no caching = no OOM)
          const framesRendered = await renderSceneFrameByFrame(
            tempVideo, canvas, ctx, videoEncoder, fps, sourceDuration, targetDuration, cumulativeTimestampOffset,
            (rendered, total) => {
              const pct = baseProgress + (rendered / total) * (70 / scenesWithVideo.length);
              setState({ status: "rendering", progress: Math.floor(pct) });
            }
          );

          globalFrameCount += framesRendered;
          cumulativeTimestampOffset += Math.round(targetDuration * 1_000_000);

          // Dispose video element and free memory
          disposeVideo(tempVideo, blobUrl);

          // GC yield between scenes
          await new Promise(r => setTimeout(r, 200));
          await yieldToUI();
        }

        // Finalize
        setState({ status: "encoding", progress: 88 });
        await videoEncoder.flush();
        if (audioEncoder) await audioEncoder.flush();
        videoEncoder.close();
        if (audioEncoder) audioEncoder.close();
        muxer.finalize();

        const { buffer } = muxer.target as ArrayBufferTarget;
        const blob = new Blob([buffer], { type: "video/mp4" });
        console.log(`[CinematicExport ${EXPORT_VERSION}] Done:`, { size: blob.size, frames: globalFrameCount });

        let publicUrl: string | undefined;
        if (generationId) {
          setState({ status: "uploading", progress: 92 });
          const fileName = `${generationId}/${crypto.randomUUID()}.mp4`;
          const { error: uploadError } = await supabase.storage
            .from("scene-videos").upload(fileName, blob, { contentType: "video/mp4", upsert: true });
          if (uploadError) {
            console.error("[CinematicExport] Upload error:", uploadError);
          } else {
            const { data: signedData } = await supabase.storage
              .from("scene-videos").createSignedUrl(fileName, 604800);
            if (signedData?.signedUrl) {
              publicUrl = signedData.signedUrl;
              await supabase.from("generations").update({ video_url: publicUrl }).eq("id", generationId);
            }
          }
        }

        const localUrl = URL.createObjectURL(blob);
        setState({ status: "complete", progress: 100, videoUrl: publicUrl || localUrl });
        toast({ title: "Export Complete", description: "Your video is ready!" });
        return { localUrl, publicUrl, blob };

      } catch (error) {
        console.error(`[CinematicExport ${EXPORT_VERSION}] Export failed:`, error);
        if (_retryCount < MAX_RETRIES) {
          console.log(`[CinematicExport ${EXPORT_VERSION}] Auto-retrying (${_retryCount + 1}/${MAX_RETRIES})...`);
          toast({ title: "Retrying export...", description: `Attempt ${_retryCount + 2}` });
          await new Promise(r => setTimeout(r, 1500));
          return exportVideo(scenes, format, generationId, _retryCount + 1);
        }
        const errorMsg = error instanceof Error ? error.message : "Export failed";
        setState({ status: "error", progress: 0, error: errorMsg });
        toast({ title: "Export Failed", description: errorMsg, variant: "destructive" });
        throw error;
      }
    },
    []
  );

  const downloadVideo = useCallback(async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: "video/mp4" });

      // On mobile: use native share (enables "Save to Photos")
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename.replace(".mp4", "") });
        return;
      }

      // Desktop fallback
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (error: any) {
      if (error?.name === "AbortError") return;
      window.open(url, "_blank");
    }
  }, []);

  const shareVideo = useCallback(async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: "video/mp4" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename.replace(".mp4", "") });
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        toast({ title: "Saved", description: "Video downloaded to your device" });
      }
    } catch (error: any) {
      if (error?.name === "AbortError") return;
      console.error("[CinematicExport] Share failed:", error);
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        toast({ title: "Saved", description: "Video downloaded to your device" });
      } catch {
        toast({ title: "Share Failed", description: "Could not share or download the video", variant: "destructive" });
      }
    }
  }, []);

  return { state, exportVideo, downloadVideo, shareVideo, reset };
}
