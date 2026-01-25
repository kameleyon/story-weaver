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

      const stage = (name: string, extra?: Record<string, unknown>) => {
        log("Run", runId, "Stage", name, extra ?? {});
      };

      const safeErrorSummary = (e: unknown) => {
        if (e instanceof Error) {
          return { name: e.name, message: e.message, stack: e.stack };
        }
        return { message: String(e) };
      };

      // Access WebCodecs constructors safely via globalThis
      const AudioEncoderCtor = (globalThis as any).AudioEncoder as typeof AudioEncoder | undefined;
      const AudioDataCtor = (globalThis as any).AudioData as typeof AudioData | undefined;

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      // Check for WebCodecs API support
      const supportsVideo =
        typeof VideoEncoder !== "undefined" &&
        typeof VideoFrame !== "undefined";

      const supportsAudio = !!AudioEncoderCtor && !!AudioDataCtor;

      stage("capabilities", {
        isIOS,
        supportsVideo,
        supportsAudio,
        ua: navigator.userAgent,
      });

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

      stage("video-config", { width, height, fps, targetBitrate });

      setState({ status: "loading", progress: 0 });

      try {
        // --- STEP 1: Configure Audio First (Critical for Muxer Setup) ---
        const wantsAudio = scenes.some((s) => !!s.audioUrl);
        stage("audio-detect", {
          wantsAudio,
          scenesWithAudio: scenes.filter((s) => !!s.audioUrl).length,
        });
        
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
        let audioFirstChunkMetaLogged = false;
        let audioConfigSupportChecked = false;

        if (audioEnabled && AudioEncoderCtor) {
          // Attempt to find a supported config
          let supportedConfigFound = false;
          if (typeof AudioEncoderCtor.isConfigSupported === "function") {
             audioConfigSupportChecked = true;
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

          stage("audio-config", {
            audioEnabled,
            audioConfigSupportChecked,
            supportedConfigFound,
            chosenAudioConfig,
          });

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

                if (!audioFirstChunkMetaLogged) {
                  audioFirstChunkMetaLogged = true;
                  log("Run", runId, "Audio first chunk", {
                    type: (chunk as any)?.type,
                    timestamp: (chunk as any)?.timestamp,
                    duration: (chunk as any)?.duration,
                    byteLength: (chunk as any)?.byteLength,
                    metaKeys: meta ? Object.keys(meta as any) : [],
                    hasDecoderConfig: !!(meta as any)?.decoderConfig,
                    decoderConfigCodec: (meta as any)?.decoderConfig?.codec,
                    descriptionBytes: (meta as any)?.decoderConfig?.description
                      ? (meta as any).decoderConfig.description.byteLength
                      : 0,
                  });
                } else if (audioChunkCount % 100 === 0) {
                  log("Run", runId, "Audio chunks", { audioChunkCount });
                }

                try {
                  muxer.addAudioChunk(chunk, meta);
                } catch (e) {
                  warn("Run", runId, "muxer.addAudioChunk failed", safeErrorSummary(e));
                }
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

        stage("audio-enabled", { audioEnabled, chosenAudioConfig, audioChunkCount });

        // --- STEP 2: Load Assets ---
        // Use a shared decoding context matching the ENCODER'S sample rate.
        // This handles resampling automatically during decode.
        const decodeSampleRate = audioEnabled ? chosenAudioConfig.sampleRate : 48000;
        const sharedDecodeCtx = new OfflineAudioContext(1, 1, decodeSampleRate);

        stage("audio-decode-context", { decodeSampleRate });

        // Serialize decoding to avoid concurrency issues on mobile
        let decodeChain: Promise<unknown> = Promise.resolve();
        const decodeAudioSequentially = async (buf: ArrayBuffer): Promise<AudioBuffer> => {
          const bufCopy = buf.slice(0); // clone for safety
          const p = decodeChain.then(() => sharedDecodeCtx.decodeAudioData(bufCopy));
          decodeChain = p.catch(() => undefined);
          return p;
        };

        stage("assets-load-start", { scenes: scenes.length });
        
        const assets = await Promise.all(
          scenes.map(async (scene, idx) => {
            if (abortRef.current) throw new Error("Export cancelled");

            log("Run", runId, "Scene asset start", {
              idx,
              hasAudioUrl: !!scene.audioUrl,
              hasImageUrl: !!scene.imageUrl,
              imageUrlsCount: scene.imageUrls?.length ?? 0,
              sceneDuration: scene.duration,
            });

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
                const contentType = res.headers.get("content-type");
                if (!res.ok) {
                  warn("Run", runId, `Scene ${idx}: audio fetch not ok`, {
                    status: res.status,
                    statusText: res.statusText,
                    contentType,
                  });
                }
                const arrayBuf = await res.arrayBuffer();
                log("Run", runId, `Scene ${idx}: audio fetched`, {
                  bytes: arrayBuf.byteLength,
                  contentType,
                });
                audioBuffer = await decodeAudioSequentially(arrayBuf);

                log("Run", runId, `Scene ${idx}: audio decoded`, {
                  duration: audioBuffer.duration,
                  length: audioBuffer.length,
                  sampleRate: audioBuffer.sampleRate,
                  numberOfChannels: audioBuffer.numberOfChannels,
                });
              } catch (e) {
                warn("Run", runId, `Scene ${idx}: Audio load/decode failed`, safeErrorSummary(e));
              }
            }

            setState((s) => ({ ...s, progress: Math.round(((idx + 1) / scenes.length) * 15) }));

            // Calculate duration: Audio duration (+ padding) OR Scene duration
            const duration = audioBuffer ? (audioBuffer.duration + 0.3) : scene.duration;

            log("Run", runId, "Scene asset done", {
              idx,
              imagesLoaded: loadedImages.length,
              audioDecoded: !!audioBuffer,
              resolvedDuration: duration,
            });

            return { images: loadedImages, audioBuffer, duration };
          })
        );

        stage("assets-load-done", {
          totalDuration: assets.reduce((sum, a) => sum + a.duration, 0),
          scenesWithDecodedAudio: assets.filter((a) => !!a.audioBuffer).length,
        });

        // --- STEP 3: Encode Audio (Streaming / Sequential) ---
        // Instead of mixing everything at once (OOM risk), we process scene by scene.
        if (audioEnabled && audioEncoder && AudioDataCtor) {
          stage("audio-encode-start", {
            sampleRate: chosenAudioConfig.sampleRate,
            numberOfChannels: chosenAudioConfig.numberOfChannels,
            codec: chosenAudioConfig.codec,
          });
          
          const sampleRate = chosenAudioConfig.sampleRate;
          let globalSampleIndex = 0;
          
          for (let assetIdx = 0; assetIdx < assets.length; assetIdx++) {
            const asset = assets[assetIdx];
            if (abortRef.current) break;

            const sceneTotalSamples = Math.ceil(asset.duration * sampleRate);
            const startedAtSample = globalSampleIndex;
            
            // If we have audio, encode it
            if (asset.audioBuffer) {
              const buffer = asset.audioBuffer;
              const channels = buffer.numberOfChannels;
              const samples = buffer.length;
              const channelData = [];
              for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));
              
              // Process in chunks of 1024 frames (AAC frame size)
              // Use smaller chunks for better encoder compatibility
              const chunkSize = 1024;
              
              for (let i = 0; i < samples; i += chunkSize) {
                const remaining = Math.min(chunkSize, samples - i);
                
                // Use PLANAR format: [L0, L1, L2...] then [R0, R1, R2...]
                // iOS Safari AudioEncoder works better with planar data
                const planarData = new Float32Array(remaining * 2);
                for (let j = 0; j < remaining; j++) {
                  const sampleIdx = i + j;
                  // Mix down to stereo or upmix mono
                  const left = channelData[0][sampleIdx] || 0;
                  const right = channels > 1 ? channelData[1][sampleIdx] : left;
                  
                  // Planar layout: all left samples first, then all right samples
                  planarData[j] = left;
                  planarData[remaining + j] = right;
                }
                
                // Strictly monotonic timestamp calculation
                const timestampUs = Math.floor((globalSampleIndex / sampleRate) * 1_000_000);
                
                const audioData = new AudioDataCtor({
                  format: "f32-planar",  // Use planar format for iOS compatibility
                  sampleRate: sampleRate,
                  numberOfFrames: remaining,
                  numberOfChannels: 2,
                  timestamp: timestampUs,
                  data: planarData,
                });
                
                audioEncoder.encode(audioData);
                audioData.close();
                
                globalSampleIndex += remaining;

                if (globalSampleIndex % (sampleRate * 5) < chunkSize) {
                  // Roughly every ~5s of audio written, emit a heartbeat.
                  log("Run", runId, "Audio encode heartbeat", {
                    writtenSamples: globalSampleIndex,
                    writtenSeconds: Math.round((globalSampleIndex / sampleRate) * 10) / 10,
                    audioChunkCount,
                  });
                }
              }
            }
            
            // If scene is longer than audio (or no audio), fill with silence
            // We calculate how many samples the scene *should* occupy
            const currentSamplesInScene = asset.audioBuffer ? asset.audioBuffer.length : 0;
            const silenceSamplesNeeded = Math.max(0, sceneTotalSamples - currentSamplesInScene);
            
            if (silenceSamplesNeeded > 0) {
              log("Run", runId, "Audio silence fill", {
                assetIdx,
                silenceSamplesNeeded,
                silenceSeconds: Math.round((silenceSamplesNeeded / sampleRate) * 10) / 10,
              });
              const chunkSize = 1024;
              const silenceBuffer = new Float32Array(chunkSize * 2); // Zeros (planar format)
              
              for (let i = 0; i < silenceSamplesNeeded; i += chunkSize) {
                 const remaining = Math.min(chunkSize, silenceSamplesNeeded - i);
                 const chunkData = remaining === chunkSize ? silenceBuffer : new Float32Array(remaining * 2);
                 
                 const timestampUs = Math.floor((globalSampleIndex / sampleRate) * 1_000_000);
                 
                 const audioData = new AudioDataCtor({
                  format: "f32-planar",  // Use planar format for iOS compatibility
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

            log("Run", runId, "Audio scene done", {
              assetIdx,
              startedAtSample,
              endedAtSample: globalSampleIndex,
              wroteSamples: globalSampleIndex - startedAtSample,
              expectedSceneSamples: sceneTotalSamples,
              audioChunkCount,
            });
            
            // Yield to UI occassionally
            await yieldToUI();
          }
          
          // Ensure we don't assume flush happens after video. 
          // We can let it process in background or await here.
          // Since VideoEncoder is also async, we'll flush both at the end.
        }

        stage("audio-encode-done", {
          audioEnabled,
          wantsAudio,
          audioChunkCount,
        });

        // --- STEP 4: Render Video ---
        setState({ status: "rendering", progress: 20 });

        stage("video-encode-start", { fps, width, height });
        
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

            log("Run", runId, "Video scene done", {
              sceneIdx,
              sceneFrames,
              images: assets[sceneIdx].images.length,
              currentFrame,
              totalFrames,
            });
        }

        stage("video-encode-done", { currentFrame, totalFrames });
        
        // --- STEP 5: Finalize ---
        if (abortRef.current) throw new Error("Cancelled");
        setState({ status: "encoding", progress: 95 });
        
        stage("flush-start", { audioEnabled });
        
        const flushPromises = [videoEncoder.flush()];
        if (audioEnabled && audioEncoder) flushPromises.push(audioEncoder.flush());
        
        await Promise.all(flushPromises);

        stage("flush-done", {
          audioChunkCount,
          audioEnabled,
        });
        
        videoEncoder.close();
        if (audioEncoder) audioEncoder.close();
        
        muxer.finalize();
        
        const { buffer } = muxer.target as ArrayBufferTarget;
        const videoBlob = new Blob([buffer], { type: "video/mp4" });
        const videoUrl = URL.createObjectURL(videoBlob);
        
        const totalMs = Math.round(performance.now() - t0);
        if (wantsAudio && audioEnabled && audioChunkCount === 0) {
          warn("Run", runId, "Audio appears to be missing (0 encoded chunks)", {
            wantsAudio,
            audioEnabled,
            chosenAudioConfig,
          });
        }

        log("Run", runId, "Export Complete", {
          size: buffer.byteLength,
          ms: totalMs,
          audioEnabled,
          wantsAudio,
          audioChunkCount,
        });
        setState({ status: "complete", progress: 100, videoUrl });
        
        return videoUrl;

      } catch (error) {
        const msg = error instanceof Error ? error.message : "Export failed";
        err("Run", runId, "Export error", msg, safeErrorSummary(error));
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
