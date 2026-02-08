import { useState, useCallback, useRef } from "react";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export type ExportStatus = "idle" | "loading" | "rendering" | "encoding" | "complete" | "error";

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
const longYield = () => new Promise<void>((resolve) => setTimeout(resolve, 16));

function isSmallDevice() {
  // A pragmatic heuristic to avoid 1080p exports on phones/tablets (performance + memory).
  const minScreen = Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999);
  return minScreen < 900;
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
      format: "landscape" | "portrait" | "square"
    ) => {
      abortRef.current = false;

      // Show the modal immediately so mobile/tablet users see what’s happening.
      setState({ status: "loading", progress: 0 });

      try {
        const VideoDecoderCtor = (globalThis as any).VideoDecoder;
        const VideoEncoderCtor = (globalThis as any).VideoEncoder;
        const AudioEncoderCtor = (globalThis as any).AudioEncoder;

        if (!VideoDecoderCtor || !VideoEncoderCtor) {
          throw new Error(
            "Video export isn’t supported on this device/browser. Try Chrome/Edge (Android) or Safari 16.4+ (iOS)."
          );
        }

        const scenesWithVideo = scenes.filter((s) => !!s.videoUrl);
        if (scenesWithVideo.length === 0) {
          throw new Error("No video clips to export");
        }

        // Determine dimensions
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const smallDevice = isSmallDevice();

        const dimensions = (isIOS || smallDevice)
          ? {
              landscape: { w: 1280, h: 720 },
              portrait: { w: 720, h: 1280 },
              square: { w: 960, h: 960 },
            }
          : {
              landscape: { w: 1920, h: 1080 },
              portrait: { w: 1080, h: 1920 },
              square: { w: 1080, h: 1080 },
            };

        const dim = dimensions[format];
        const fps = isIOS || smallDevice ? 24 : 30;

        // Check audio support
        const wantsAudio = scenesWithVideo.some(s => !!s.audioUrl);
        let audioTrackConfig: any = null;

        if (wantsAudio && AudioEncoderCtor) {
          const audioCandidates = [
            { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 },
            { codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 2, bitrate: 128_000 },
          ];

          for (const cfg of audioCandidates) {
            try {
              if (await AudioEncoderCtor.isConfigSupported(cfg)) {
                audioTrackConfig = cfg;
                break;
              }
            } catch { /* ignore */ }
          }
        }

        // Initialize Muxer
        const muxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: { codec: "avc", width: dim.w, height: dim.h },
          audio: audioTrackConfig ? {
            codec: "aac", 
            numberOfChannels: audioTrackConfig.numberOfChannels,
            sampleRate: audioTrackConfig.sampleRate
          } : undefined,
          fastStart: "in-memory"
        });

        let manualAudioDesc: Uint8Array | null = null;
        if (audioTrackConfig) {
          manualAudioDesc = generateAACAudioSpecificConfig(
            audioTrackConfig.sampleRate, 
            audioTrackConfig.numberOfChannels
          );
        }

        // Setup canvas for re-encoding
        const canvas = document.createElement("canvas");
        canvas.width = dim.w;
        canvas.height = dim.h;
        const ctx = canvas.getContext("2d", { alpha: false })!;

        let globalFrameCount = 0;
        let globalAudioSampleCount = 0;
        let firstAudioChunk = true;

        // Audio encoder
        let audioEncoder: AudioEncoder | null = null;
        if (audioTrackConfig) {
          audioEncoder = new AudioEncoderCtor({
            output: (chunk: any, meta: any) => {
              if (firstAudioChunk && manualAudioDesc) {
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
                console.warn("muxer.addAudioChunk failed", e);
              }
            },
            error: (e: any) => console.warn("Audio encoding error", e)
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
          width: dim.w,
          height: dim.h,
          bitrate: isIOS ? 2_500_000 : 6_000_000,
          framerate: fps
        });

        // Setup Decode Context for audio
        const decodeCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
          1, 1, audioTrackConfig ? audioTrackConfig.sampleRate : 48000
        );

        // Process each scene
        for (let i = 0; i < scenesWithVideo.length; i++) {
          if (abortRef.current) break;

          const scene = scenesWithVideo[i];

          // Keep UI responsive + show some progress immediately on the first clip.
          setState({
            status: "rendering",
            progress: Math.max(1, Math.floor((i / scenesWithVideo.length) * 80)),
          });

          let lastProgress = -1;

          // Load and decode video clip
          const videoResp = await fetch(scene.videoUrl!);
          const videoBlob = await videoResp.blob();
          
          // Create a temporary video element to decode frames
          const tempVideo = document.createElement("video");
          tempVideo.muted = true;
          tempVideo.playsInline = true;
          tempVideo.preload = "auto";
          tempVideo.src = URL.createObjectURL(videoBlob);
          
           await new Promise<void>((resolve, reject) => {
             const to = window.setTimeout(() => reject(new Error("Timed out loading video metadata")), 15000);
             tempVideo.onloadedmetadata = () => {
               window.clearTimeout(to);
               resolve();
             };
             tempVideo.onerror = () => {
               window.clearTimeout(to);
               reject(new Error("Failed to load video clip"));
             };
           });

          const clipDuration = tempVideo.duration;
          const clipFrames = Math.ceil(clipDuration * fps);

          // Process audio for this scene
          if (audioEncoder && audioTrackConfig && scene.audioUrl) {
            try {
              const audioResp = await fetch(scene.audioUrl);
              if (audioResp.ok) {
                const arrayBuf = await audioResp.arrayBuffer();
                const sceneAudioBuffer = await decodeCtx.decodeAudioData(arrayBuf);
                
                const sampleRate = audioTrackConfig.sampleRate;
                const renderLen = Math.ceil(sceneAudioBuffer.duration * sampleRate);
                
                const offlineCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
                  2, renderLen, sampleRate
                );
                
                const source = offlineCtx.createBufferSource();
                source.buffer = sceneAudioBuffer;
                source.connect(offlineCtx.destination);
                source.start(0);
                
                const renderedBuf = await offlineCtx.startRendering();
                
                const rawData = new Float32Array(renderedBuf.length * 2);
                const left = renderedBuf.getChannelData(0);
                const right = renderedBuf.numberOfChannels > 1 ? renderedBuf.getChannelData(1) : left;
                
                for (let s = 0; s < renderedBuf.length; s++) {
                  rawData[s*2] = left[s];
                  rawData[s*2+1] = right[s];
                }

                const chunkFrames = 4096;
                for (let offset = 0; offset < renderedBuf.length; offset += chunkFrames) {
                  const size = Math.min(chunkFrames, renderedBuf.length - offset);
                  const chunkData = rawData.subarray(offset * 2, (offset + size) * 2);
                  
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
                  
                  if (offset % (chunkFrames * 20) === 0) await yieldToUI();
                }
              }
            } catch (e) {
              console.warn(`Audio load failed for scene ${i+1}`, e);
            }
          }

          // Helper to seek with retries (iOS is notoriously flaky with video seeking)
          const seekWithRetry = async (video: HTMLVideoElement, time: number, maxRetries = 3): Promise<void> => {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
              try {
                video.currentTime = time;
                await new Promise<void>((resolve, reject) => {
                  const timeoutMs = attempt === 0 ? 8000 : 12000; // Longer timeout on retries
                  const to = window.setTimeout(() => reject(new Error("seek_timeout")), timeoutMs);
                  
                  const onSeeked = () => {
                    window.clearTimeout(to);
                    video.removeEventListener("seeked", onSeeked);
                    video.removeEventListener("error", onError);
                    resolve();
                  };
                  
                  const onError = () => {
                    window.clearTimeout(to);
                    video.removeEventListener("seeked", onSeeked);
                    video.removeEventListener("error", onError);
                    reject(new Error("seek_error"));
                  };
                  
                  video.addEventListener("seeked", onSeeked, { once: true });
                  video.addEventListener("error", onError, { once: true });
                });
                return; // Success
              } catch (e) {
                if (attempt < maxRetries - 1) {
                  // Wait before retry
                  await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
                  continue;
                }
                throw new Error("Timed out seeking video - try a smaller video or use a desktop browser");
              }
            }
          };

          // Extract and encode video frames
          tempVideo.currentTime = 0;
          await seekWithRetry(tempVideo, 0);

          for (let f = 0; f < clipFrames; f++) {
            if (abortRef.current) break;

            const targetTime = f / fps;
            if (Math.abs(tempVideo.currentTime - targetTime) > 0.01) {
              await seekWithRetry(tempVideo, targetTime);
            }

            // Draw video frame to canvas (scaled to fit)
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, dim.w, dim.h);
            
            const videoAspect = tempVideo.videoWidth / tempVideo.videoHeight;
            const canvasAspect = dim.w / dim.h;
            
            let drawWidth, drawHeight, drawX, drawY;
            if (videoAspect > canvasAspect) {
              drawWidth = dim.w;
              drawHeight = dim.w / videoAspect;
              drawX = 0;
              drawY = (dim.h - drawHeight) / 2;
            } else {
              drawHeight = dim.h;
              drawWidth = dim.h * videoAspect;
              drawX = (dim.w - drawWidth) / 2;
              drawY = 0;
            }
            
            ctx.drawImage(tempVideo, drawX, drawY, drawWidth, drawHeight);

            const timestamp = Math.round((globalFrameCount / fps) * 1_000_000);
            const frame = new VideoFrame(canvas, { timestamp, duration: Math.round(1e6/fps) });
            
            const keyFrame = globalFrameCount % (fps * 2) === 0;
            videoEncoder.encode(frame, { keyFrame });
            frame.close();
            
            globalFrameCount++;

             if (globalFrameCount % 5 === 0) await yieldToUI();
             if (globalFrameCount % 30 === 0) await longYield();

             // Update progress occasionally (mobile can spend a long time on clip #1)
             if (globalFrameCount % 12 === 0) {
               const overall = (i + (f + 1) / clipFrames) / scenesWithVideo.length;
               const p = Math.min(90, 10 + Math.floor(overall * 80));
               if (p !== lastProgress) {
                 lastProgress = p;
                 setState({ status: "rendering", progress: p });
               }
             }
          }

          // Cleanup
          URL.revokeObjectURL(tempVideo.src);
          tempVideo.remove();
        }

        // Finalize
        setState({ status: "encoding", progress: 95 });

        await videoEncoder.flush();
        if (audioEncoder) await audioEncoder.flush();
        
        videoEncoder.close();
        if (audioEncoder) audioEncoder.close();
        
        muxer.finalize();
        
        const { buffer } = muxer.target as ArrayBufferTarget;
        const blob = new Blob([buffer], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        
        setState({ status: "complete", progress: 100, videoUrl: url });
        
        return url;
      } catch (error) {
        console.error("Cinematic export failed:", error);
        setState({ 
          status: "error", 
          progress: 0, 
          error: error instanceof Error ? error.message : "Export failed" 
        });
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
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename.replace(".mp4", ""),
        });
      }
    } catch (error) {
      console.error("Share failed:", error);
    }
  }, []);

  return { state, exportVideo, downloadVideo, shareVideo, reset };
}
