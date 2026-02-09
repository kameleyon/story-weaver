import { useState, useCallback, useRef } from "react";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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

async function loadVideoElement(url: string, timeoutMs = 30000): Promise<HTMLVideoElement> {
  console.log("[CinematicExport] Loading video:", url.substring(0, 80));
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
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Failed to decode video"));
    }),
    timeoutMs,
    "Video decode timed out"
  );
  console.log("[CinematicExport] Video loaded:", { duration: video.duration, w: video.videoWidth, h: video.videoHeight });
  return video;
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

// 🚀 Pre-cache all unique frames ONCE, then encode from memory (no per-frame seeking)
async function preCacheVideoFrames(
  videoElement: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  fps: number
): Promise<ImageBitmap[]> {
  const sourceDuration = videoElement.duration || 5;
  const sourceFrameCount = Math.ceil(sourceDuration * fps);
  const frameDuration = 1 / fps;

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

  ctx.fillStyle = "#000";

  const waitSeek = () => new Promise<void>((resolve) => {
    if (!videoElement.seeking) { resolve(); return; }
    videoElement.addEventListener("seeked", () => resolve(), { once: true });
  });

  const frames: ImageBitmap[] = [];
  console.log(`[CinematicExport] Pre-caching ${sourceFrameCount} frames from ${sourceDuration.toFixed(2)}s video`);

  for (let i = 0; i < sourceFrameCount; i++) {
    const seekTime = Math.min(i * frameDuration, sourceDuration - 0.05);
    videoElement.currentTime = seekTime;
    await waitSeek();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(videoElement, dx, dy, dw, dh);
    frames.push(await createImageBitmap(canvas));
    // Yield occasionally during caching
    if (i % 30 === 0) await yieldToUI();
  }

  console.log(`[CinematicExport] Cached ${frames.length} frames`);
  return frames;
}

// Encode frames using forward-only looping (no reverse boomerang)
async function encodeLoopedFrames(
  cachedFrames: ImageBitmap[],
  videoEncoder: any,
  fps: number,
  targetDuration: number,
  cumulativeTimestampOffset: number,
  onProgress?: (framesRendered: number) => void
): Promise<number> {
  const totalFrames = Math.ceil(targetDuration * fps);
  const frameDuration = Math.round(1e6 / fps);
  const sourceFrameCount = cachedFrames.length;

  console.log(`[CinematicExport] Forward-loop: ${sourceFrameCount} cached → ${totalFrames} output frames (${targetDuration.toFixed(2)}s)`);

  let framesRendered = 0;
  for (let frame = 0; frame < totalFrames; frame++) {
    // Backpressure
    if (videoEncoder.encodeQueueSize > 10) {
      await new Promise<void>(r => setTimeout(r, 1));
    }

    // Forward-only loop: wraps around to start when source ends
    const sourceIdx = frame % sourceFrameCount;
    const bitmap = cachedFrames[sourceIdx];

    const timestamp = cumulativeTimestampOffset + Math.round(frame * frameDuration);
    const keyFrame = frame % (fps * 2) === 0;

    const vf = new VideoFrame(bitmap, { timestamp, duration: frameDuration });
    videoEncoder.encode(vf, { keyFrame });
    vf.close();

    framesRendered++;
    if (onProgress) onProgress(framesRendered);

    // Yield every 200 frames — encoding from cache is fast, yield less
    if (frame % 200 === 0) await yieldToUI();
  }

  console.log(`[CinematicExport] Encoding done: ${framesRendered} frames`);
  return framesRendered;
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
      const MAX_RETRIES = 2;

      console.log("[CinematicExport] Starting export", { scenes: scenes.length, format, generationId, retry: _retryCount });

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
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const dimensions = isIOS
          ? { landscape: { w: 1280, h: 720 }, portrait: { w: 720, h: 1280 }, square: { w: 960, h: 960 } }
          : { landscape: { w: 1920, h: 1080 }, portrait: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } };
        const dim = dimensions[format];
        const fps = isIOS ? 24 : 30;

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
        const ctx = canvas.getContext("2d", { alpha: false })!;

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

        // Video encoder
        const videoEncoder = new VideoEncoderCtor({
          output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
          error: (e: any) => { throw e; }
        });
        videoEncoder.configure({
          codec: "avc1.42E028",
          width: dim.w, height: dim.h,
          bitrate: isIOS ? 2_500_000 : 6_000_000,
          framerate: fps
        });

        const decodeCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(1, 1, audioTrackConfig?.sampleRate || 48000);

        // Process each scene
        for (let i = 0; i < scenesWithVideo.length; i++) {
          if (abortRef.current) break;
          const scene = scenesWithVideo[i];
          const baseProgress = 15 + Math.floor((i / scenesWithVideo.length) * 70);
          setState({ status: "rendering", progress: baseProgress });

          // Load video
          const tempVideo = await loadVideoElement(scene.videoUrl!);

          // Process audio & get actual duration
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

          // CRITICAL: audio duration drives video length
          const targetDuration = sceneAudioDuration || scene.duration || tempVideo.duration || 5;
          console.log(`[CinematicExport] Scene ${i + 1}: target=${targetDuration.toFixed(2)}s (audio=${sceneAudioDuration?.toFixed(2) ?? "none"}, video=${tempVideo.duration?.toFixed(2)}s)`);

          // Step 1: Pre-cache all unique frames from video (FAST — only seeks once per unique frame)
          const cachedFrames = await preCacheVideoFrames(tempVideo, canvas, ctx, fps);

          // Step 2: Encode using forward-only looping from cache (INSTANT — no seeking)
          const framesRendered = await encodeLoopedFrames(
            cachedFrames, videoEncoder, fps, targetDuration, cumulativeTimestampOffset,
            (rendered) => {
              const pct = baseProgress + (rendered / Math.ceil(targetDuration * fps)) * (70 / scenesWithVideo.length);
              setState({ status: "rendering", progress: Math.floor(pct) });
            }
          );

          // Cleanup cached frames
          cachedFrames.forEach(b => b.close());

          globalFrameCount += framesRendered;
          cumulativeTimestampOffset += Math.round(targetDuration * 1_000_000);

          // Cleanup video element
          URL.revokeObjectURL(tempVideo.src);
          tempVideo.remove();
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
        console.log("[CinematicExport] Done:", { size: blob.size, frames: globalFrameCount });

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
        console.error("[CinematicExport] Export failed:", error);
        // Auto-retry up to MAX_RETRIES
        if (_retryCount < MAX_RETRIES) {
          console.log(`[CinematicExport] Auto-retrying (${_retryCount + 1}/${MAX_RETRIES})...`);
          toast({ title: "Retrying export...", description: `Attempt ${_retryCount + 2}` });
          await new Promise(r => setTimeout(r, 1000));
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

  const downloadVideo = useCallback((url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const shareVideo = useCallback(async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: "video/mp4" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename.replace(".mp4", "") });
      }
    } catch (error) {
      console.error("[CinematicExport] Share failed:", error);
    }
  }, []);

  return { state, exportVideo, downloadVideo, shareVideo, reset };
}
