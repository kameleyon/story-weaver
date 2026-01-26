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

const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function useVideoExport() {
  const [state, setState] = useState<ExportState>({ status: "idle", progress: 0 });
  const abortRef = useRef(false);
  const exportRunIdRef = useRef(0);

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
    setState({ status: "idle", progress: 0 });
  }, []);

  const exportVideo = useCallback(
    async (scenes: Scene[], format: "landscape" | "portrait" | "square") => {
      abortRef.current = false;
      const runId = ++exportRunIdRef.current;
      
      log("Run", runId, "Starting Safe Export (Fixed Audio Headers)", { scenes: scenes.length, format });

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

        for (let i = 0; i < scenes.length; i++) {
          if (abortRef.current) break;
          const scene = scenes[i];
          
          log("Run", runId, `Processing Scene ${i + 1}/${scenes.length}`);
          setState({ status: "rendering", progress: Math.floor((i / scenes.length) * 80) });

          // A. Load Images
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
          const sceneDuration = Math.max(audioDur, scene.duration || 3);
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
             }
          }

          // D. Render Video with Fade Transitions
          const imagesPerScene = Math.max(1, loadedImages.length);
          const framesPerImage = Math.ceil(sceneFrames / imagesPerScene);
          const fadeFrames = Math.min(Math.floor(fps * 0.5), Math.floor(framesPerImage * 0.2)); // 0.5s or 20% of image duration

          for (let f = 0; f < sceneFrames; f++) {
             const imgIndex = Math.min(Math.floor(f / framesPerImage), imagesPerScene - 1);
             const nextImgIndex = Math.min(imgIndex + 1, imagesPerScene - 1);
             const frameInImage = f % framesPerImage;
             
             const img = loadedImages[imgIndex];
             const nextImg = loadedImages[nextImgIndex];

             ctx.fillStyle = "#000";
             ctx.fillRect(0, 0, dim.w, dim.h);

             // Calculate fade-out transition
             const framesUntilSwitch = framesPerImage - frameInImage;
             const shouldFade = imagesPerScene > 1 && imgIndex < imagesPerScene - 1 && framesUntilSwitch <= fadeFrames;
             
             if (img) {
               const scale = Math.min(dim.w / img.width, dim.h / img.height);
               const dw = img.width * scale;
               const dh = img.height * scale;
               
               if (shouldFade && nextImg) {
                 // Fade transition: blend current and next image
                 const fadeProgress = 1 - (framesUntilSwitch / fadeFrames); // 0 to 1
                 
                 // Draw current image with decreasing opacity
                 ctx.globalAlpha = 1 - fadeProgress;
                 ctx.drawImage(img, (dim.w - dw) / 2, (dim.h - dh) / 2, dw, dh);
                 
                 // Draw next image with increasing opacity
                 const nextScale = Math.min(dim.w / nextImg.width, dim.h / nextImg.height);
                 const nextDw = nextImg.width * nextScale;
                 const nextDh = nextImg.height * nextScale;
                 ctx.globalAlpha = fadeProgress;
                 ctx.drawImage(nextImg, (dim.w - nextDw) / 2, (dim.h - nextDh) / 2, nextDw, nextDh);
                 
                 ctx.globalAlpha = 1; // Reset
               } else {
                 ctx.drawImage(img, (dim.w - dw) / 2, (dim.h - dh) / 2, dw, dh);
               }
             }

             const timestamp = Math.round((globalFrameCount / fps) * 1_000_000);
             const frame = new VideoFrame(canvas, { timestamp, duration: Math.round(1e6/fps) });
             
             const keyFrame = globalFrameCount % (fps * 2) === 0;
             videoEncoder.encode(frame, { keyFrame });
             frame.close();
             
             globalFrameCount++;

             if (globalFrameCount % 10 === 0) await yieldToUI();
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

  const downloadVideo = useCallback((url: string, filename = "video.mp4") => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }, []);

  return { state, exportVideo, downloadVideo, shareVideo, reset };
}
