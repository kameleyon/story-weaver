import { useState, useCallback, useRef } from "react";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { Scene } from "./useGenerationPipeline";
import { appendVideoExportLog } from "@/lib/videoExportDebug";

export type ExportStatus = "idle" | "loading" | "rendering" | "encoding" | "complete" | "error";

interface ExportState {
  status: ExportStatus;
  progress: number; // 0-100
  error?: string;
  warning?: string;
  videoUrl?: string;
}

// Helper to manually create AAC AudioSpecificConfig (2 bytes)
// This fixes the iOS bug where AudioEncoder returns a 39-byte ES_Descriptor instead of the raw ASC.
function generateAACAudioSpecificConfig(sampleRate: number, channels: number): Uint8Array {
  const objectType = 2; // AAC LC
  const frequencyIndex = {
    96000: 0, 88200: 1, 64000: 2, 48000: 3, 44100: 4, 32000: 5, 24000: 6,
    22050: 7, 16000: 8, 12000: 9, 11025: 10, 8000: 11
  }[sampleRate] ?? 4; // Default to 44.1kHz if unknown

  const channelConfig = channels;

  // 5 bits ObjectType, 4 bits FreqIndex, 4 bits ChannelConfig, 3 bits padding
  const config = new Uint8Array(2);
  config[0] = (objectType << 3) | ((frequencyIndex >> 1) & 0x07);
  config[1] = ((frequencyIndex & 0x01) << 7) | (channelConfig << 3);
  
  return config;
}

// Yield helpers for memory management during long exports
const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const longYield = () => new Promise<void>((resolve) => setTimeout(resolve, 16)); // One frame (~16ms)
const gcYield = () => new Promise<void>((resolve) => setTimeout(resolve, 50)); // Allow garbage collection

/**
 * Draw a consistent brand mark watermark on the canvas
 * Uses fixed styling: Montserrat Medium font, 35% black background, 95% white text
 */
function drawBrandWatermark(
  ctx: CanvasRenderingContext2D,
  brandMark: string,
  canvasWidth: number,
  canvasHeight: number
) {
  const fontSize = Math.max(18, Math.round(canvasWidth * 0.028)); // Bigger: 2.8% of width (was 1.8%)
  const paddingX = Math.round(fontSize * 1.0);
  const paddingY = Math.round(fontSize * 0.5);
  const borderRadius = Math.round(fontSize * 0.5);
  const bottomMargin = Math.round(canvasHeight * 0.035); // 3.5% from bottom

  // Set font to Montserrat Medium and measure text
  ctx.font = `500 ${fontSize}px Montserrat, -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  const textMetrics = ctx.measureText(brandMark);
  const textWidth = textMetrics.width;
  const textHeight = fontSize;
  
  const pillWidth = textWidth + paddingX * 2;
  const pillHeight = textHeight + paddingY * 2;
  const pillX = (canvasWidth - pillWidth) / 2;
  const pillY = canvasHeight - bottomMargin - pillHeight;
  
  // Draw pill background (35% opacity black for better visibility)
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillWidth, pillHeight, borderRadius);
  ctx.fill();
  
  // Draw text (95% opacity white for crisp visibility)
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fillText(brandMark, canvasWidth / 2, pillY + pillHeight / 2);
}

// Wait for video encoder queue to drain to prevent memory buildup
const waitForEncoderDrain = async (encoder: VideoEncoder, maxQueue = 10) => {
  while (encoder.encodeQueueSize > maxQueue) {
    await longYield();
  }
};

export function useVideoExport() {
  const [state, setState] = useState<ExportState>({ status: "idle", progress: 0 });
  const abortRef = useRef(false);
  const exportRunIdRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);

  const log = useCallback((...args: any[]) => {
    appendVideoExportLog("log", ["[VideoExport]", ...args]);
    console.log("[VideoExport]", ...args);
  }, []);

  const warn = useCallback((...args: any[]) => {
    appendVideoExportLog("warn", ["[VideoExport]", ...args]);
    console.warn("[VideoExport]", ...args);
  }, []);

  const err = useCallback((...args: any[]) => {
    appendVideoExportLog("error", ["[VideoExport]", ...args]);
    console.error("[VideoExport]", ...args);
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    if (workerRef.current) {
      workerRef.current.postMessage({ type: "abort" });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setState({ status: "idle", progress: 0 });
  }, []);

  const exportVideo = useCallback(
    async (
      scenes: Scene[], 
      format: "landscape" | "portrait" | "square",
      brandMark?: string
    ) => {
      abortRef.current = false;
      const runId = ++exportRunIdRef.current;
      
      log("Run", runId, "Starting Safe Export (Fixed Audio Headers)", { scenes: scenes.length, format, brandMark: brandMark || "(none)" });

      const AudioEncoderCtor = (globalThis as any).AudioEncoder;
      const VideoEncoderCtor = (globalThis as any).VideoEncoder;

      if (!VideoEncoderCtor) {
        throw new Error("Your browser does not support Video Export. Please use Chrome, Edge, or Safari 16.4+");
      }

      setState({ status: "loading", progress: 0 });

      try {
        // --- 1. SETUP AUDIO ENCODER ---
        const wantsAudio = scenes.some(s => !!s.audioUrl);
        let audioEncoder: AudioEncoder | null = null;
        let audioTrackConfig: any = null;

        // Strict priority: Preferred 48kHz for video, fallback to 44.1kHz
        const audioCandidates = [
          { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 },
          { codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000 },
          { codec: "aac", sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 },
          { codec: "aac", sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000 }
        ];

        let muxer: Muxer<ArrayBufferTarget>;

        if (wantsAudio && AudioEncoderCtor) {
          for (const cfg of audioCandidates) {
            try {
              if (await AudioEncoderCtor.isConfigSupported(cfg)) {
                audioTrackConfig = cfg;
                break;
              }
            } catch (e) { /* ignore */ }
          }
          
          if (!audioTrackConfig) {
             warn("No supported audio configuration found. Exporting silent video.");
             audioTrackConfig = null;
          }
        }

        // --- 2. SETUP DIMENSIONS ---
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isMobile = isIOS || isAndroid;
        const dimensions = isIOS 
          ? { landscape: { w: 1280, h: 720 }, portrait: { w: 720, h: 1280 }, square: { w: 960, h: 960 } }
          : { landscape: { w: 1920, h: 1080 }, portrait: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } };
        
        const dim = dimensions[format];
        const fps = isIOS ? 24 : 30;

        log("Run", runId, "Config", { 
          isIOS, 
          dim, 
          fps, 
          wantsAudio, 
          audioTrackConfig 
        });

        // === WEB WORKER PATH: Offload encoding for image-only exports ===
        const hasVideoScenes = scenes.some(s => !!s.videoUrl);
        const canUseWorker = !hasVideoScenes
          && typeof Worker !== 'undefined'
          && typeof OffscreenCanvas !== 'undefined';

        if (canUseWorker) {
          log("Run", runId, "Using Web Worker path (OffscreenCanvas) for image-only export");
          setState({ status: "loading", progress: 5 });

          // Pre-fetch all unique image URLs as blobs for efficient bitmap creation
          const blobCache = new Map<string, Blob>();
          for (const s of scenes) {
            const urls = s.imageUrls?.length ? s.imageUrls : [s.imageUrl || ""];
            for (const url of urls) {
              if (url && !blobCache.has(url)) {
                try {
                  const resp = await fetch(url, { mode: "cors" });
                  if (resp.ok) blobCache.set(url, await resp.blob());
                } catch { /* skip failed fetches */ }
              }
            }
          }

          // Prepare scene payloads for worker (ImageBitmaps + decoded audio)
          const targetSR = audioTrackConfig?.sampleRate ?? 48000;
          const workerScenes: Array<{
            imageBitmaps: ImageBitmap[];
            nextSceneFirstBitmap: ImageBitmap | null;
            audioSamples: Float32Array | null;
            duration: number;
          }> = [];
          const xfer: Transferable[] = [];

          for (let si = 0; si < scenes.length; si++) {
            if (abortRef.current) break;
            const s = scenes[si];
            setState({ status: "loading", progress: Math.floor(5 + (si / scenes.length) * 20) });

            // Create ImageBitmaps from cached blobs
            const urls = s.imageUrls?.length ? s.imageUrls : [s.imageUrl || ""];
            const bitmaps: ImageBitmap[] = [];
            for (const url of urls) {
              const blob = url ? blobCache.get(url) : null;
              if (blob) {
                try {
                  const bm = await createImageBitmap(blob);
                  bitmaps.push(bm);
                  xfer.push(bm);
                } catch { /* skip */ }
              }
            }

            // Next scene first image for crossfade transition
            let nextBm: ImageBitmap | null = null;
            if (si < scenes.length - 1) {
              const nu = scenes[si + 1].imageUrls?.length
                ? scenes[si + 1].imageUrls!
                : [scenes[si + 1].imageUrl || ""];
              const nb = nu[0] ? blobCache.get(nu[0]) : null;
              if (nb) {
                try { nextBm = await createImageBitmap(nb); xfer.push(nextBm); }
                catch { /* skip */ }
              }
            }

            // Decode + resample audio on main thread (OfflineAudioContext unavailable in workers)
            let audioSamples: Float32Array | null = null;
            let aDur = 0;
            if (s.audioUrl && audioTrackConfig) {
              try {
                const resp = await fetch(s.audioUrl);
                if (resp.ok) {
                  const ab = await resp.arrayBuffer();
                  const dCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(1, 1, targetSR);
                  const decoded = await dCtx.decodeAudioData(ab);
                  aDur = decoded.duration;
                  const rLen = Math.ceil(decoded.duration * targetSR);
                  const oCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(2, rLen, targetSR);
                  const src = oCtx.createBufferSource();
                  src.buffer = decoded;
                  src.connect(oCtx.destination);
                  src.start(0);
                  const rendered = await oCtx.startRendering();
                  audioSamples = new Float32Array(rendered.length * 2);
                  const L = rendered.getChannelData(0);
                  const R = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : L;
                  for (let j = 0; j < rendered.length; j++) {
                    audioSamples[j * 2] = L[j];
                    audioSamples[j * 2 + 1] = R[j];
                  }
                  xfer.push(audioSamples.buffer);
                }
              } catch (e) {
                warn("Run", runId, `Audio decode failed scene ${si + 1}:`, e);
              }
            }

            workerScenes.push({
              imageBitmaps: bitmaps,
              nextSceneFirstBitmap: nextBm,
              audioSamples,
              duration: aDur > 0 ? aDur : (s.duration || 3),
            });
          }

          blobCache.clear();
          setState({ status: "rendering", progress: 25 });

          // Create and communicate with worker
          const worker = new Worker(
            new URL('../workers/videoExportWorker.ts', import.meta.url),
            { type: 'module' }
          );
          workerRef.current = worker;

          const url = await new Promise<string>((resolve, reject) => {
            worker.onmessage = (ev: MessageEvent) => {
              const m = ev.data;
              if (m.type === 'progress') {
                setState({ status: m.status, progress: m.progress, warning: m.warning });
              } else if (m.type === 'complete') {
                const blob = new Blob([m.buffer], { type: 'video/mp4' });
                const vUrl = URL.createObjectURL(blob);
                log("Run", runId, "Worker export complete", { size: m.buffer.byteLength });
                setState({ status: 'complete', progress: 100, videoUrl: vUrl });
                workerRef.current = null;
                worker.terminate();
                resolve(vUrl);
              } else if (m.type === 'error') {
                err("Worker export failed:", m.message);
                setState({ status: 'error', progress: 0, error: m.message });
                workerRef.current = null;
                worker.terminate();
                reject(new Error(m.message));
              } else if (m.type === 'log') {
                appendVideoExportLog(m.level, ["[Worker]", ...m.args]);
              }
            };
            worker.onerror = (ev) => {
              err("Worker crashed:", ev.message);
              setState({ status: 'error', progress: 0, error: 'Export worker crashed' });
              workerRef.current = null;
              worker.terminate();
              reject(new Error('Worker crashed'));
            };

            worker.postMessage({
              type: 'start',
              scenes: workerScenes,
              config: {
                width: dim.w,
                height: dim.h,
                fps,
                brandMark: brandMark?.trim() || null,
                audioCodec: audioTrackConfig?.codec || null,
                audioSampleRate: targetSR,
                audioChannels: audioTrackConfig?.numberOfChannels ?? 2,
                audioBitrate: audioTrackConfig?.bitrate ?? 128_000,
                videoBitrate: isIOS ? 2_500_000 : 6_000_000,
              },
            }, xfer);
          });

          return url;
        }

        // === MAIN THREAD FALLBACK: Video scenes or browsers without OffscreenCanvas ===

        // Initialize Muxer
        muxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: { codec: "avc", width: dim.w, height: dim.h },
          audio: audioTrackConfig ? {
            codec: "aac", 
            numberOfChannels: audioTrackConfig.numberOfChannels,
            sampleRate: audioTrackConfig.sampleRate
          } : undefined,
          fastStart: "in-memory"
        });

        // Pre-calculate the CORRECT AudioSpecificConfig (2 bytes) to fix iOS bug
        let manualAudioDesc: Uint8Array | null = null;
        if (audioTrackConfig) {
           manualAudioDesc = generateAACAudioSpecificConfig(
             audioTrackConfig.sampleRate, 
             audioTrackConfig.numberOfChannels
           );
           log("Run", runId, "Generated manual AAC AudioSpecificConfig", { 
             bytes: manualAudioDesc.length,
             hex: Array.from(manualAudioDesc).map(b => b.toString(16).padStart(2, '0')).join(' ')
           });
        }

        let firstAudioChunk = true;
        let audioChunkCount = 0;

        if (audioTrackConfig) {
          audioEncoder = new AudioEncoderCtor({
            output: (chunk: any, meta: any) => {
              audioChunkCount++;
              
              // WORKAROUND: iOS returns a 39-byte ES_Descriptor in meta.decoderConfig.description.
              // We MUST override this with our manually generated 2-byte AudioSpecificConfig
              // or the MP4 will be silent on players.
              if (firstAudioChunk && manualAudioDesc) {
                const originalDescBytes = meta?.decoderConfig?.description?.byteLength;
                log("Run", runId, "First audio chunk - applying manual description fix", {
                  originalDescBytes,
                  newDescBytes: manualAudioDesc.length
                });
                
                if (meta.decoderConfig) {
                  meta.decoderConfig.description = manualAudioDesc;
                } else {
                  meta.decoderConfig = { description: manualAudioDesc };
                }
                firstAudioChunk = false;
              }
              
              try {
                // Guard against non-monotonic DTS
                const chunkDTS = chunk.timestamp;
                if (chunkDTS !== undefined && chunkDTS !== null && lastAudioDTS >= 0 && chunkDTS <= lastAudioDTS) {
                  // Skip this chunk — DTS went backwards (can happen after flush between scenes)
                  return;
                }
                lastAudioDTS = chunkDTS ?? lastAudioDTS;
                muxer.addAudioChunk(chunk, meta);
              } catch (e) {
                warn("Run", runId, "muxer.addAudioChunk failed", e);
              }
              
              if (audioChunkCount % 500 === 0) {
                log("Run", runId, "Audio chunks progress", { audioChunkCount });
              }
            },
            error: (e: any) => warn("Audio encoding error", e)
          });
          audioEncoder!.configure(audioTrackConfig);
          log("Run", runId, "AudioEncoder configured", audioTrackConfig);
        }

        const videoEncoder = new VideoEncoderCtor({
          output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
          error: (e: any) => { throw e; }
        });

        videoEncoder.configure({
          codec: "avc1.42E028", // Baseline profile (High compatibility)
          width: dim.w,
          height: dim.h,
          bitrate: isIOS ? 2_500_000 : 6_000_000,
          framerate: fps
        });

        // --- 3. PROCESSING LOOP ---
        const canvas = document.createElement("canvas");
        canvas.width = dim.w;
        canvas.height = dim.h;
        const ctx = canvas.getContext("2d", { alpha: false })!;
        
        // Setup Decode Context
        const decodeCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
          1, 1, audioTrackConfig ? audioTrackConfig.sampleRate : 48000
        );

        let globalFrameCount = 0;
        let globalAudioSampleCount = 0;
        let lastAudioDTS = -1; // Track last audio DTS to prevent monotonicity errors

        for (let i = 0; i < scenes.length; i++) {
          if (abortRef.current) break;
          const scene = scenes[i];
          const nextScene = scenes[i + 1];
          
          log("Run", runId, `Processing Scene ${i + 1}/${scenes.length}`);
          setState({ status: "rendering", progress: Math.floor((i / scenes.length) * 80) });

          // A. Load Images for current scene
          const imageUrls = scene.imageUrls?.length ? scene.imageUrls : [scene.imageUrl || ""];
          const loadedImages: HTMLImageElement[] = [];
          
          for (const url of imageUrls) {
            if (!url) continue;
            try {
              const img = new Image();
              img.crossOrigin = "anonymous";
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => {
                   img.crossOrigin = null; // Fallback
                   img.src = url;
                   img.onload = resolve;
                   img.onerror = reject;
                };
                img.src = url;
              });
              loadedImages.push(img);
            } catch (e) {
              warn(`Failed to load image for scene ${i+1}`, e);
            }
          }

          // A2. Pre-load first image of next scene for crossfade transition
          let nextSceneFirstImage: HTMLImageElement | null = null;
          if (nextScene) {
            const nextImageUrls = nextScene.imageUrls?.length ? nextScene.imageUrls : [nextScene.imageUrl || ""];
            const nextFirstUrl = nextImageUrls[0];
            if (nextFirstUrl) {
              try {
                const img = new Image();
                img.crossOrigin = "anonymous";
                await new Promise((resolve, reject) => {
                  img.onload = resolve;
                  img.onerror = () => {
                    img.crossOrigin = null;
                    img.src = nextFirstUrl;
                    img.onload = resolve;
                    img.onerror = reject;
                  };
                  img.src = nextFirstUrl;
                });
                nextSceneFirstImage = img;
              } catch (e) {
                warn(`Failed to pre-load next scene image`, e);
              }
            }
          }

          // B. Decode Audio
          let sceneAudioBuffer: AudioBuffer | null = null;
          if (scene.audioUrl && audioTrackConfig) {
             try {
               const resp = await fetch(scene.audioUrl);
               if (resp.ok) {
                 const arrayBuf = await resp.arrayBuffer();
                 sceneAudioBuffer = await decodeCtx.decodeAudioData(arrayBuf);
                 log("Run", runId, `Scene ${i+1} audio decoded`, {
                   duration: sceneAudioBuffer.duration,
                   sampleRate: sceneAudioBuffer.sampleRate,
                   channels: sceneAudioBuffer.numberOfChannels
                 });
               }
             } catch (e) {
               warn(`Audio load failed for scene ${i+1}`, e);
             }
          }

          const audioDur = sceneAudioBuffer ? sceneAudioBuffer.duration : 0;
          // Use actual audio duration if available, otherwise fall back to scene duration
          const sceneDuration = audioDur > 0 ? audioDur : (scene.duration || 3);
          const sceneFrames = Math.ceil(sceneDuration * fps);

          // C. Mix & Encode Audio
          if (audioEncoder && audioTrackConfig) {
             const sampleRate = audioTrackConfig.sampleRate;
             const renderLen = Math.ceil(sceneDuration * sampleRate);
             
             // Create a mini-mix for this scene
             const offlineCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
                2, renderLen, sampleRate
             );
             
             if (sceneAudioBuffer) {
               const source = offlineCtx.createBufferSource();
               source.buffer = sceneAudioBuffer;
               source.connect(offlineCtx.destination);
               source.start(0);
             }
             
             const renderedBuf = await offlineCtx.startRendering();
             
             // Chunking to safe sizes
             const rawData = new Float32Array(renderedBuf.length * 2);
             const left = renderedBuf.getChannelData(0);
             const right = renderedBuf.numberOfChannels > 1 ? renderedBuf.getChannelData(1) : left;
             
             // Interleave
             for (let s = 0; s < renderedBuf.length; s++) {
               rawData[s*2] = left[s];
               rawData[s*2+1] = right[s];
             }

             const chunkFrames = 4096;
             let audioChunkIndex = 0;
             for (let offset = 0; offset < renderedBuf.length; offset += chunkFrames) {
                const size = Math.min(chunkFrames, renderedBuf.length - offset);
                const chunkData = rawData.subarray(offset * 2, (offset + size) * 2);
                
                // Monotonic timestamp
                const timestampUs = Math.floor((globalAudioSampleCount / sampleRate) * 1_000_000);
                
                const audioData = new AudioData({
                  format: "f32",
                  sampleRate: sampleRate,
                  numberOfFrames: size,
                  numberOfChannels: 2,
                  timestamp: timestampUs,
                  data: chunkData
                });
                
                audioEncoder.encode(audioData);
                audioData.close();
                globalAudioSampleCount += size;
                audioChunkIndex++;
                
                // Yield during audio processing to prevent blocking
                if (audioChunkIndex % 20 === 0) await yieldToUI();
             }
          }

          // D. Render Video Frames
          if (scene.videoUrl) {
            // Shared video load helper
            const video = document.createElement("video");
            video.crossOrigin = "anonymous";
            video.muted = true;
            video.playsInline = true;
            video.preload = "auto";

            const loadVideoWithRetry = async (url: string, maxRetries = 2) => {
              const timeoutMs = isMobile ? 30000 : 120000; // 30s on mobile, 120s on desktop
              for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                  await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                      video.removeAttribute("src");
                      video.load();
                      reject(new Error(`Video load timeout (${timeoutMs/1000}s), attempt ${attempt + 1}`));
                    }, timeoutMs);
                    video.onloadeddata = () => { clearTimeout(timeout); resolve(); };
                    video.onerror = () => { clearTimeout(timeout); reject(new Error("Failed to load video")); };
                    video.src = attempt > 0 ? `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}` : url;
                  });
                  return;
                } catch (loadErr) {
                  log("Run", runId, `Scene ${i + 1}: Video load attempt ${attempt + 1} failed`, { error: (loadErr as Error).message });
                  if (attempt >= maxRetries) throw loadErr;
                  await new Promise(r => setTimeout(r, 2000));
                }
              }
            };
            await loadVideoWithRetry(scene.videoUrl!, isMobile ? 4 : 2); // More retries on mobile

            const sourceDuration = video.duration || 5;

            if (!isMobile) {
              // --- DESKTOP: Frame-by-frame seeking (accurate slow-motion) ---
              log("Run", runId, `Scene ${i + 1}: Using Slow-Motion Stretch (desktop)`, { sourceDuration, sceneDuration });

              video.currentTime = 0;
              await new Promise<void>(r => { video.onseeked = () => r(); });

              for (let f = 0; f < sceneFrames; f++) {
                if (abortRef.current) break;

                const progress = Math.min((f / fps) / sceneDuration, 1);
                let playbackTime = progress * sourceDuration;
                playbackTime = Math.max(0, Math.min(playbackTime, sourceDuration - 0.05));

                video.currentTime = playbackTime;
                await new Promise<void>(r => { video.onseeked = () => r(); });

                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, dim.w, dim.h);
                const vScale = Math.min(dim.w / video.videoWidth, dim.h / video.videoHeight);
                const vw = video.videoWidth * vScale;
                const vh = video.videoHeight * vScale;
                ctx.drawImage(video, (dim.w - vw) / 2, (dim.h - vh) / 2, vw, vh);

                if (brandMark && brandMark.trim()) {
                  drawBrandWatermark(ctx, brandMark.trim(), dim.w, dim.h);
                }

                await waitForEncoderDrain(videoEncoder, 10);
                const timestamp = Math.round((globalFrameCount / fps) * 1_000_000);
                const frame = new VideoFrame(canvas, { timestamp, duration: Math.round(1e6 / fps) });
                const keyFrame = globalFrameCount % (fps * 2) === 0;
                videoEncoder.encode(frame, { keyFrame });
                frame.close();
                globalFrameCount++;

                if (globalFrameCount % 5 === 0) await yieldToUI();
                if (globalFrameCount % 30 === 0) await longYield();
              }

            } else {
              // --- MOBILE: Real-time playback capture (no seeking) ---
              // Play video at reduced playbackRate and capture frames at intervals.
              // This uses hardware-accelerated decoding instead of slow per-frame seeking.
              const rate = Math.max(0.1, Math.min(sourceDuration / sceneDuration, 1));
              log("Run", runId, `Scene ${i + 1}: Using real-time playback capture (mobile)`, {
                sourceDuration, sceneDuration, playbackRate: rate
              });

              video.currentTime = 0;
              video.playbackRate = rate;

              // Wait for video to be ready to play
              await new Promise<void>((resolve) => {
                if (video.readyState >= 3) { resolve(); return; }
                video.oncanplay = () => resolve();
              });

              // Start playback
              try { await video.play(); } catch (e) {
                warn("Run", runId, `Scene ${i + 1}: video.play() failed, falling back to seeking`, e);
                // If autoplay is blocked, fall back to seeking approach
                video.currentTime = 0;
                await new Promise<void>(r => { video.onseeked = () => r(); });
                for (let f = 0; f < sceneFrames; f++) {
                  if (abortRef.current) break;
                  const progress = Math.min((f / fps) / sceneDuration, 1);
                  let playbackTime = Math.max(0, Math.min(progress * sourceDuration, sourceDuration - 0.05));
                  video.currentTime = playbackTime;
                  await new Promise<void>(r => { video.onseeked = () => r(); });
                  ctx.fillStyle = "#000";
                  ctx.fillRect(0, 0, dim.w, dim.h);
                  const vScale = Math.min(dim.w / video.videoWidth, dim.h / video.videoHeight);
                  ctx.drawImage(video, (dim.w - vScale * video.videoWidth) / 2, (dim.h - vScale * video.videoHeight) / 2, video.videoWidth * vScale, video.videoHeight * vScale);
                  if (brandMark && brandMark.trim()) drawBrandWatermark(ctx, brandMark.trim(), dim.w, dim.h);
                  await waitForEncoderDrain(videoEncoder, 10);
                  const timestamp = Math.round((globalFrameCount / fps) * 1_000_000);
                  const frame = new VideoFrame(canvas, { timestamp, duration: Math.round(1e6 / fps) });
                  videoEncoder.encode(frame, { keyFrame: globalFrameCount % (fps * 2) === 0 });
                  frame.close();
                  globalFrameCount++;
                  if (globalFrameCount % 5 === 0) await yieldToUI();
                }
                video.removeAttribute("src");
                video.load();
                log("Run", runId, `Scene ${i + 1} complete (seeking fallback)`);
                await gcYield();
                continue; // Skip to next scene — we already rendered this one
              }

              // Capture frames at the export frame rate interval
              const frameInterval = 1000 / fps; // ms between frames
              let lastDrawTime = performance.now();

              for (let f = 0; f < sceneFrames; f++) {
                if (abortRef.current) break;

                // Wait for next frame timing
                const targetTime = lastDrawTime + frameInterval;
                const now = performance.now();
                if (now < targetTime) {
                  await new Promise<void>(r => setTimeout(r, targetTime - now));
                }
                lastDrawTime = performance.now();

                // Draw current video frame (video is playing in real-time at reduced speed)
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, dim.w, dim.h);
                const vScale = Math.min(dim.w / video.videoWidth, dim.h / video.videoHeight);
                const vw = video.videoWidth * vScale;
                const vh = video.videoHeight * vScale;
                ctx.drawImage(video, (dim.w - vw) / 2, (dim.h - vh) / 2, vw, vh);

                if (brandMark && brandMark.trim()) {
                  drawBrandWatermark(ctx, brandMark.trim(), dim.w, dim.h);
                }

                await waitForEncoderDrain(videoEncoder, 10);
                const timestamp = Math.round((globalFrameCount / fps) * 1_000_000);
                const frame = new VideoFrame(canvas, { timestamp, duration: Math.round(1e6 / fps) });
                const keyFrame = globalFrameCount % (fps * 2) === 0;
                videoEncoder.encode(frame, { keyFrame });
                frame.close();
                globalFrameCount++;
              }

              // Stop playback
              video.pause();
            }

            // Aggressive cleanup: fully destroy video element to free mobile Safari media resources
            video.pause();
            video.onloadeddata = null;
            video.onerror = null;
            video.oncanplay = null;
            video.onseeked = null;
            video.removeAttribute("src");
            video.load();
            // On mobile, wait for Safari to actually release the media resource
            if (isMobile) await new Promise(r => setTimeout(r, 500));

          } else {
            // E. Render Static Images with Fade Transitions (existing logic)
            const imagesPerScene = Math.max(1, loadedImages.length);
            const framesPerImage = Math.ceil(sceneFrames / imagesPerScene);
            const fadeFrames = Math.min(Math.floor(fps * 0.5), Math.floor(framesPerImage * 0.2));
            const sceneCrossfadeFrames = Math.floor(fps * 0.3);

            // Pre-render static frames for each image as bitmaps
            const cachedBitmaps: Map<number, ImageBitmap> = new Map();
            for (let imgIdx = 0; imgIdx < loadedImages.length; imgIdx++) {
              const img = loadedImages[imgIdx];
              if (!img) continue;
              ctx.fillStyle = "#000";
              ctx.fillRect(0, 0, dim.w, dim.h);
              const scale = Math.min(dim.w / img.width, dim.h / img.height);
              const dw = img.width * scale;
              const dh = img.height * scale;
              ctx.drawImage(img, (dim.w - dw) / 2, (dim.h - dh) / 2, dw, dh);
              if (brandMark && brandMark.trim()) {
                drawBrandWatermark(ctx, brandMark.trim(), dim.w, dim.h);
              }
              const bitmap = await createImageBitmap(canvas);
              cachedBitmaps.set(imgIdx, bitmap);
            }

            log("Run", runId, `Scene ${i + 1}: Pre-cached ${cachedBitmaps.size} static bitmaps`);

            for (let f = 0; f < sceneFrames; f++) {
              const imgIndex = Math.min(Math.floor(f / framesPerImage), imagesPerScene - 1);
              const nextImgIndex = Math.min(imgIndex + 1, imagesPerScene - 1);
              const frameInImage = f % framesPerImage;

              const img = loadedImages[imgIndex];
              const nextImg = loadedImages[nextImgIndex];
              const cachedBitmap = cachedBitmaps.get(imgIndex);

              const framesUntilSwitch = framesPerImage - frameInImage;
              const framesUntilSceneEnd = sceneFrames - f;
              const isOnLastImage = imgIndex === imagesPerScene - 1;

              const shouldFadeIntraScene = imagesPerScene > 1 && imgIndex < imagesPerScene - 1 && framesUntilSwitch <= fadeFrames;
              const shouldFadeInterScene = nextSceneFirstImage && isOnLastImage && framesUntilSceneEnd <= sceneCrossfadeFrames;
              const isTransitionFrame = shouldFadeIntraScene || shouldFadeInterScene;

              if (!isTransitionFrame && cachedBitmap) {
                ctx.drawImage(cachedBitmap, 0, 0);
              } else if (img) {
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, dim.w, dim.h);
                const scale = Math.min(dim.w / img.width, dim.h / img.height);
                const dw = img.width * scale;
                const dh = img.height * scale;

                if (shouldFadeInterScene && nextSceneFirstImage) {
                  const fadeProgress = 1 - (framesUntilSceneEnd / sceneCrossfadeFrames);
                  ctx.globalAlpha = 1 - fadeProgress;
                  ctx.drawImage(img, (dim.w - dw) / 2, (dim.h - dh) / 2, dw, dh);
                  const nextScale = Math.min(dim.w / nextSceneFirstImage.width, dim.h / nextSceneFirstImage.height);
                  const nextDw = nextSceneFirstImage.width * nextScale;
                  const nextDh = nextSceneFirstImage.height * nextScale;
                  ctx.globalAlpha = fadeProgress;
                  ctx.drawImage(nextSceneFirstImage, (dim.w - nextDw) / 2, (dim.h - nextDh) / 2, nextDw, nextDh);
                  ctx.globalAlpha = 1;
                } else if (shouldFadeIntraScene && nextImg) {
                  const fadeProgress = 1 - (framesUntilSwitch / fadeFrames);
                  ctx.globalAlpha = 1 - fadeProgress;
                  ctx.drawImage(img, (dim.w - dw) / 2, (dim.h - dh) / 2, dw, dh);
                  const nextScale = Math.min(dim.w / nextImg.width, dim.h / nextImg.height);
                  const nextDw = nextImg.width * nextScale;
                  const nextDh = nextImg.height * nextScale;
                  ctx.globalAlpha = fadeProgress;
                  ctx.drawImage(nextImg, (dim.w - nextDw) / 2, (dim.h - nextDh) / 2, nextDw, nextDh);
                  ctx.globalAlpha = 1;
                } else {
                  ctx.drawImage(img, (dim.w - dw) / 2, (dim.h - dh) / 2, dw, dh);
                }

                if (brandMark && brandMark.trim()) {
                  drawBrandWatermark(ctx, brandMark.trim(), dim.w, dim.h);
                }
              }

              await waitForEncoderDrain(videoEncoder, 10);
              const timestamp = Math.round((globalFrameCount / fps) * 1_000_000);
              const frame = new VideoFrame(canvas, { timestamp, duration: Math.round(1e6 / fps) });
              const keyFrame = globalFrameCount % (fps * 2) === 0;
              videoEncoder.encode(frame, { keyFrame });
              frame.close();
              globalFrameCount++;

              if (globalFrameCount % 10 === 0) await yieldToUI();
              if (globalFrameCount % 60 === 0) await longYield();
            }

            // Clean up cached bitmaps
            for (const bitmap of cachedBitmaps.values()) {
              bitmap.close();
            }
            cachedBitmaps.clear();
          }
          
          // Scene-level cleanup: flush audio encoder and clear references
          if (audioEncoder) {
            await audioEncoder.flush();
          }
          
          // Clear image references to help garbage collection
          loadedImages.length = 0;
          // nextSceneFirstImage will be garbage collected naturally
          
          // Allow garbage collection between scenes
          await gcYield();
          
          log("Run", runId, `Scene ${i + 1} complete, memory checkpoint`);
          
          // Show warning for long exports
          if (i === Math.floor(scenes.length / 2) && scenes.length > 10) {
            setState(prev => ({
              ...prev,
              warning: "Long video export in progress. If browser becomes slow, save your work first."
            }));
          }
        }

        // --- 4. FINALIZE ---
        setState({ status: "encoding", progress: 95 });
        
        log("Run", runId, "Flushing encoders", { audioChunkCount, globalFrameCount });
        
        await videoEncoder.flush();
        if (audioEncoder) await audioEncoder.flush();
        
        videoEncoder.close();
        if (audioEncoder) audioEncoder.close();
        
        muxer.finalize();
        
        const { buffer } = muxer.target as ArrayBufferTarget;
        const blob = new Blob([buffer], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        
        log("Run", runId, "Export Complete", { 
          size: buffer.byteLength, 
          audioChunkCount,
          videoFrames: globalFrameCount
        });
        setState({ status: "complete", progress: 100, videoUrl: url });
        return url;

      } catch (e: any) {
        const msg = e.message || "Unknown export error";
        err("Export Failed", e);
        setState({ status: "error", progress: 0, error: msg });
        throw e;
      }
    },
    [log, warn, err]
  );

  const shareVideo = useCallback(async (url: string, filename = "video.mp4") => {
    if (!url) return false;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: "video/mp4" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return true;
      }
    } catch (e) { console.warn(e); }
    return false;
  }, []);

  const downloadVideo = useCallback(async (url: string, filename = "video.mp4") => {
    if (!url) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isIOSChrome = isIOS && /CriOS/i.test(navigator.userAgent);

    // iOS (Safari & Chrome): blob URLs don't work across tabs and anchor downloads often fail.
    // For iOS Chrome specifically, we need to open the blob URL in a new window for the user to save manually.
    if (isIOS) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: "video/mp4" });

        // Try Web Share API first (works better on Safari than Chrome)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return;
        }
      } catch (e) {
        console.warn("iOS share failed:", e);
      }

      // For iOS Chrome: Open video in new tab for manual save (long-press to save)
      // This avoids the page refresh issue entirely
      if (isIOSChrome) {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          
          // Open in same window to avoid popup blockers, user can save from there
          window.location.href = blobUrl;
          return;
        } catch (e) {
          console.warn("iOS Chrome blob navigation failed:", e);
          alert("To save the video: Long-press on the video above and select 'Save Video'");
          return;
        }
      }

      // iOS Safari fallback: Create a data URL and trigger download
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const a = document.createElement("a");
          a.href = reader.result as string;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        };
        reader.readAsDataURL(blob);
        return;
      } catch (e) {
        console.warn("iOS data URL download failed:", e);
        alert("To save the video: Long-press on the video above and select 'Save Video'");
        return;
      }
    }

    // Android Chrome: Share API is most reliable, blob anchor often causes navigation/refresh
    if (isAndroid) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: "video/mp4" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return;
        }

        // Fallback: Create object URL from fetched blob (more reliable than original blob URL)
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        
        // Clean up after a delay
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        }, 1000);
        return;
      } catch (e) {
        console.warn("Android download failed:", e);
        // Last resort: alert with instructions
        alert("To save the video: Long-press on the video above and select 'Download video'");
        return;
      }
    }

    // Desktop: standard anchor download with proper cleanup
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 100);
    } catch (e) {
      console.warn("Desktop download failed:", e);
      window.open(url, "_blank");
    }
  }, []);

  return { state, exportVideo, downloadVideo, shareVideo, reset };
}
