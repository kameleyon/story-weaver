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

// Yield to the event loop to allow UI updates
const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Client-side MP4 export using Canvas + VideoEncoder + mp4-muxer.
 * Renders scene images with audio into a downloadable MP4 video.
 */
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
      const t0 = performance.now();

      log("Run", runId, "Start export", { scenes: scenes.length, format });

      // Access WebCodecs constructors safely via globalThis
      const AudioEncoderCtor = (globalThis as any).AudioEncoder as typeof AudioEncoder | undefined;
      const AudioDataCtor = (globalThis as any).AudioData as typeof AudioData | undefined;

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      // Check for WebCodecs API support
      const supportsVideo =
        typeof VideoEncoder !== "undefined" &&
        typeof VideoFrame !== "undefined";

      const supportsAudio = !!AudioEncoderCtor && !!AudioDataCtor;

      if (!supportsVideo) {
        const errorMsg = "Video export is not supported on this device. Please use a desktop browser.";
        err("Run", runId, "Unsupported device (missing WebCodecs)");
        setState({ status: "error", progress: 0, error: errorMsg });
        throw new Error(errorMsg);
      }

      const baseDimensions = {
        landscape: { width: 1920, height: 1080 },
        portrait: { width: 1080, height: 1920 },
        square: { width: 1080, height: 1080 },
      } as const;

      // iOS Safari optimization: use lower resolution to avoid OOM
      const iosDimensions = {
        landscape: { width: 1280, height: 720 },
        portrait: { width: 720, height: 1280 },
        square: { width: 960, height: 960 },
      } as const;

      const dimensions = isIOS ? iosDimensions : baseDimensions;
      const selected = dimensions[format];
      const { width, height } = selected;
      const fps = isIOS ? 24 : 30;
      const targetBitrate = isIOS ? 2_500_000 : 8_000_000;

      setState({ status: "loading", progress: 0 });

      try {
        // --- STEP 1: Configure Audio First (Critical for Muxer Setup) ---
        const wantsAudio = scenes.some((s) => !!s.audioUrl);
        
        // Priority order for Audio Config:
        // 1. mp4a.40.2 (Standard AAC LC) - Preferred by mp4-muxer
        // 2. aac (Generic string) - Required by some Safari versions
        const audioConfigCandidates: Array<{ codec: string; sampleRate: number; numberOfChannels: number; bitrate: number }> = [
          { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 },
          { codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000 },
          { codec: "aac", sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 },
          { codec: "aac", sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000 },
        ];

        let audioEnabled = supportsAudio && wantsAudio;
        let chosenAudioConfig = audioConfigCandidates[0]; // Default
        let audioEncoder: AudioEncoder | null = null;
        let muxer!: Muxer<ArrayBufferTarget>;
        let audioChunkCount = 0;

        if (audioEnabled && AudioEncoderCtor) {
          // Attempt to find a supported config
          let supportedConfigFound = false;
          if (typeof AudioEncoderCtor.isConfigSupported === "function") {
             for (const cfg of audioConfigCandidates) {
               try {
                 const support = await AudioEncoderCtor.isConfigSupported(cfg);
                 if (support?.supported) {
                   chosenAudioConfig = cfg;
                   supportedConfigFound = true;
                   break;
                 }
               } catch (e) { /* ignore */ }
             }
          }

          // Create the muxer NOW using the chosen config sample rate.
          // mp4-muxer needs the AudioEncoder to be configured with the same settings
          // it expects, or for the first chunk to contain the description.
          muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: { codec: "avc", width, height },
            audio: {
              codec: "aac", // mp4-muxer expects 'aac' for the track box
              numberOfChannels: 2,
              sampleRate: chosenAudioConfig.sampleRate,
            },
            fastStart: "in-memory",
          });

          try {
            audioEncoder = new AudioEncoderCtor({
              output: (chunk, meta) => {
                audioChunkCount++;
                muxer.addAudioChunk(chunk, meta);
              },
              error: (e) => {
                warn("Run", runId, "Audio encoder error", e);
              },
            });

            audioEncoder.configure(chosenAudioConfig);
            log("Run", runId, "Audio Configured", chosenAudioConfig);
          } catch (e) {
            warn("Run", runId, "Failed to configure AudioEncoder", e);
            audioEnabled = false;
            // If audio setup failed, we must recreate muxer without audio track
            // or it will produce a corrupt file expecting an empty track.
            muxer = new Muxer({
              target: new ArrayBufferTarget(),
              video: { codec: "avc", width, height },
              fastStart: "in-memory",
            });
          }
        } else {
           // No audio support or not requested
           muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: { codec: "avc", width, height },
            fastStart: "in-memory",
          });
        }

        // --- STEP 2: Load Assets ---
        // Use a shared decoding context matching the ENCODER'S sample rate.
        // This handles resampling automatically during decode.
        const decodeSampleRate = audioEnabled ? chosenAudioConfig.sampleRate : 48000;
        const sharedDecodeCtx = new OfflineAudioContext(1, 1, decodeSampleRate);

        // Serialize decoding to avoid concurrency issues on mobile
        let decodeChain: Promise<unknown> = Promise.resolve();
        const decodeAudioSequentially = async (buf: ArrayBuffer): Promise<AudioBuffer> => {
          const bufCopy = buf.slice(0); // clone for safety
          const p = decodeChain.then(() => sharedDecodeCtx.decodeAudioData(bufCopy));
          decodeChain = p.catch(() => undefined);
          return p;
        };

        log("Run", runId, "Loading assets...");
        
        const assets = await Promise.all(
          scenes.map(async (scene, idx) => {
            if (abortRef.current) throw new Error("Export cancelled");

            // Load Images
            const imageUrls = scene.imageUrls?.length ? scene.imageUrls : (scene.imageUrl ? [scene.imageUrl] : []);
            const loadedImages: HTMLImageElement[] = [];
            
            for (const url of imageUrls) {
              try {
                const img = new Image();
                img.crossOrigin = "anonymous";
                await new Promise((resolve, reject) => {
                  img.onload = resolve;
                  img.onerror = () => {
                     // Retry without CORS as fallback
                     img.crossOrigin = null; 
                     img.src = url; 
                     img.onload = resolve;
                     img.onerror = reject;
                  };
                  img.src = url;
                });
                loadedImages.push(img);
              } catch (e) {
                warn(`Scene ${idx}: Image load failed`, url);
              }
            }

            // Load Audio
            let audioBuffer: AudioBuffer | null = null;
            if (scene.audioUrl) {
              try {
                const res = await fetch(scene.audioUrl);
                const arrayBuf = await res.arrayBuffer();
                audioBuffer = await decodeAudioSequentially(arrayBuf);
              } catch (e) {
                warn(`Scene ${idx}: Audio load failed`, e);
              }
            }

            setState((s) => ({ ...s, progress: Math.round(((idx + 1) / scenes.length) * 15) }));

            // Calculate duration: Audio duration (+ padding) OR Scene duration
            const duration = audioBuffer ? (audioBuffer.duration + 0.3) : scene.duration;

            return { images: loadedImages, audioBuffer, duration };
          })
        );

        // --- STEP 3: Encode Audio (Streaming / Sequential) ---
        // Instead of mixing everything at once (OOM risk), we process scene by scene.
        if (audioEnabled && audioEncoder && AudioDataCtor) {
          log("Run", runId, "Encoding Audio...");
          
          const sampleRate = chosenAudioConfig.sampleRate;
          let globalSampleIndex = 0;
          
          for (const asset of assets) {
            if (abortRef.current) break;

            const sceneTotalSamples = Math.ceil(asset.duration * sampleRate);
            
            // If we have audio, encode it
            if (asset.audioBuffer) {
              const buffer = asset.audioBuffer;
              const channels = buffer.numberOfChannels;
              const samples = buffer.length;
              const channelData = [];
              for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));
              
              // Process in chunks of 4096 frames (standard-ish size, safer than 1024 for JS loops)
              const chunkSize = 4096;
              
              for (let i = 0; i < samples; i += chunkSize) {
                const remaining = Math.min(chunkSize, samples - i);
                
                // Prepare Interleaved Buffer (L, R, L, R...)
                const interleaved = new Float32Array(remaining * 2);
                for (let j = 0; j < remaining; j++) {
                  const sampleIdx = i + j;
                  // Mix down to stereo or upmix mono
                  const left = channelData[0][sampleIdx] || 0;
                  const right = channels > 1 ? channelData[1][sampleIdx] : left;
                  
                  interleaved[j * 2] = left;
                  interleaved[j * 2 + 1] = right;
                }
                
                // Strictly monotonic timestamp calculation
                const timestampUs = Math.floor((globalSampleIndex / sampleRate) * 1_000_000);
                
                const audioData = new AudioDataCtor({
                  format: "f32",
                  sampleRate: sampleRate,
                  numberOfFrames: remaining,
                  numberOfChannels: 2,
                  timestamp: timestampUs,
                  data: interleaved,
                });
                
                audioEncoder.encode(audioData);
                audioData.close();
                
                globalSampleIndex += remaining;
              }
            }
            
            // If scene is longer than audio (or no audio), fill with silence
            // We calculate how many samples the scene *should* occupy
            const currentSamplesInScene = asset.audioBuffer ? asset.audioBuffer.length : 0;
            const silenceSamplesNeeded = Math.max(0, sceneTotalSamples - currentSamplesInScene);
            
            if (silenceSamplesNeeded > 0) {
              const chunkSize = 4096;
              const silenceBuffer = new Float32Array(chunkSize * 2); // Zeros
              
              for (let i = 0; i < silenceSamplesNeeded; i += chunkSize) {
                 const remaining = Math.min(chunkSize, silenceSamplesNeeded - i);
                 const chunkData = remaining === chunkSize ? silenceBuffer : new Float32Array(remaining * 2);
                 
                 const timestampUs = Math.floor((globalSampleIndex / sampleRate) * 1_000_000);
                 
                 const audioData = new AudioDataCtor({
                  format: "f32",
                  sampleRate: sampleRate,
                  numberOfFrames: remaining,
                  numberOfChannels: 2,
                  timestamp: timestampUs,
                  data: chunkData,
                });
                
                audioEncoder.encode(audioData);
                audioData.close();
                globalSampleIndex += remaining;
              }
            }
            
            // Yield to UI occassionally
            await yieldToUI();
          }
          
          // Ensure we don't assume flush happens after video. 
          // We can let it process in background or await here.
          // Since VideoEncoder is also async, we'll flush both at the end.
        }

        // --- STEP 4: Render Video ---
        setState({ status: "rendering", progress: 20 });
        
        const videoEncoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => { throw e; },
        });

        const videoConfig = {
          codec: "avc1.42E028", // Baseline Profile (High Compat)
          width,
          height,
          bitrate: targetBitrate,
          framerate: fps,
        };
        videoEncoder.configure(videoConfig);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { alpha: false })!;
        
        // --- Draw Loop ---
        let currentFrame = 0;
        const totalDuration = assets.reduce((sum, a) => sum + a.duration, 0);
        const totalFrames = Math.ceil(totalDuration * fps);
        
        for (let sceneIdx = 0; sceneIdx < assets.length; sceneIdx++) {
           if (abortRef.current) break;
           
           const { images, duration } = assets[sceneIdx];
           const sceneFrames = Math.ceil(duration * fps);
           const imageCount = Math.max(1, images.length);
           const framesPerImage = Math.ceil(sceneFrames / imageCount);
           
           for (let frameInScene = 0; frameInScene < sceneFrames; frameInScene++) {
             // Draw Image
             const imageIndex = Math.min(Math.floor(frameInScene / framesPerImage), imageCount - 1);
             const img = images[imageIndex];
             
             ctx.fillStyle = "#000";
             ctx.fillRect(0, 0, width, height);
             
             if (img) {
               const scale = 1;
               const imgAspect = img.width / img.height;
               const canvasAspect = width / height;
               let drawW = width, drawH = height;
               
               if (imgAspect > canvasAspect) {
                 drawH = height;
                 drawW = drawH * imgAspect;
               } else {
                 drawW = width;
                 drawH = drawW / imgAspect;
               }
               
               ctx.drawImage(img, (width - drawW)/2, (height - drawH)/2, drawW, drawH);
             }
             
             // Encode Frame
             const timestamp = Math.round((currentFrame / fps) * 1_000_000);
             const frame = new VideoFrame(canvas, { timestamp, duration: Math.round(1e6/fps) });
             
             const isKeyFrame = frameInScene === 0 || (frameInScene % framesPerImage === 0);
             videoEncoder.encode(frame, { keyFrame: isKeyFrame });
             frame.close();
             
             currentFrame++;
             
             // Progress update
             if (currentFrame % 5 === 0) {
               const pct = 20 + Math.round((currentFrame / totalFrames) * 70);
               setState(s => ({ ...s, progress: pct }));
               await yieldToUI();
             }
           }
        }
        
        // --- STEP 5: Finalize ---
        if (abortRef.current) throw new Error("Cancelled");
        setState({ status: "encoding", progress: 95 });
        
        log("Run", runId, "Flushing encoders...");
        
        const flushPromises = [videoEncoder.flush()];
        if (audioEnabled && audioEncoder) flushPromises.push(audioEncoder.flush());
        
        await Promise.all(flushPromises);
        
        videoEncoder.close();
        if (audioEncoder) audioEncoder.close();
        
        muxer.finalize();
        
        const { buffer } = muxer.target as ArrayBufferTarget;
        const videoBlob = new Blob([buffer], { type: "video/mp4" });
        const videoUrl = URL.createObjectURL(videoBlob);
        
        log("Run", runId, "Export Complete", { size: buffer.byteLength });
        setState({ status: "complete", progress: 100, videoUrl });
        
        return videoUrl;

      } catch (error) {
        const msg = error instanceof Error ? error.message : "Export failed";
        err("Export error", msg);
        setState({ status: "error", progress: 0, error: msg });
        throw error;
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
