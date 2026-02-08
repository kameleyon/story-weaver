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

// Timeout wrapper for promises
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
  ]);
}

// Load video with proper error handling
async function loadVideoElement(url: string, timeoutMs = 60000): Promise<HTMLVideoElement> {
  console.log("[CinematicExport] Loading video:", url.substring(0, 100));
  
  // Fetch the video blob with CORS
  const response = await withTimeout(
    fetch(url, { mode: "cors" }),
    timeoutMs,
    "Video fetch timed out"
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
  }
  
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.src = blobUrl;
  
  // Wait for metadata to load
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        console.log("[CinematicExport] Video loaded:", {
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight
        });
        resolve();
      };
      video.onerror = () => reject(new Error("Failed to decode video"));
    }),
    timeoutMs,
    "Video decode timed out"
  );
  
  return video;
}

// Load audio with proper error handling
async function loadAudioBuffer(
  url: string, 
  decodeCtx: OfflineAudioContext,
  timeoutMs = 15000
): Promise<AudioBuffer | null> {
  try {
    console.log("[CinematicExport] Loading audio:", url.substring(0, 100));
    
    const response = await withTimeout(
      fetch(url, { mode: "cors" }),
      timeoutMs,
      "Audio fetch timed out"
    );
    
    if (!response.ok) {
      console.warn("[CinematicExport] Audio fetch failed:", response.status);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
    
    console.log("[CinematicExport] Audio decoded:", {
      duration: audioBuffer.duration,
      channels: audioBuffer.numberOfChannels
    });
    
    return audioBuffer;
  } catch (e) {
    console.warn("[CinematicExport] Audio load failed:", e);
    return null;
  }
}

// 🚀 FAST: Capture frames during real-time playback using requestVideoFrameCallback
async function captureVideoFrames(
  videoElement: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  fps: number,
  onFrame: (timestamp: number, keyFrame: boolean) => void,
  onProgress?: (progress: number) => void
): Promise<void> {
  const targetFrameInterval = 1 / fps;
  const totalDuration = videoElement.duration;
  const totalFrames = Math.ceil(totalDuration * fps);
  
  let frameCount = 0;
  let lastCaptureTime = -1;
  
  const drawFrame = () => {
    const currentTime = videoElement.currentTime;
    
    // Only capture if enough time has passed (throttle to target FPS)
    if (currentTime - lastCaptureTime >= targetFrameInterval * 0.9) {
      // Draw video frame to canvas (scaled to fit)
      const videoAspect = videoElement.videoWidth / videoElement.videoHeight;
      const canvasAspect = canvas.width / canvas.height;
      
      let drawWidth: number, drawHeight: number, drawX: number, drawY: number;
      if (videoAspect > canvasAspect) {
        drawWidth = canvas.width;
        drawHeight = canvas.width / videoAspect;
        drawX = 0;
        drawY = (canvas.height - drawHeight) / 2;
      } else {
        drawHeight = canvas.height;
        drawWidth = canvas.height * videoAspect;
        drawX = (canvas.width - drawWidth) / 2;
        drawY = 0;
      }
      
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(videoElement, drawX, drawY, drawWidth, drawHeight);
      
      // Calculate timestamp in microseconds
      const timestamp = Math.round(frameCount * (1_000_000 / fps));
      const keyFrame = frameCount % (fps * 2) === 0; // Keyframe every 2 seconds
      
      onFrame(timestamp, keyFrame);
      
      frameCount++;
      lastCaptureTime = currentTime;
      
      if (onProgress) {
        onProgress(Math.min(frameCount / totalFrames, 1));
      }
    }
  };

  // Check if requestVideoFrameCallback is available
  const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  
  return new Promise<void>((resolve, reject) => {
    const onEnded = () => {
      console.log(`[CinematicExport] Video ended, captured ${frameCount} frames`);
      cleanup();
      resolve();
    };
    
    const onError = () => {
      cleanup();
      reject(new Error("Video playback error"));
    };
    
    const cleanup = () => {
      videoElement.removeEventListener('ended', onEnded);
      videoElement.removeEventListener('error', onError);
    };
    
    videoElement.addEventListener('ended', onEnded);
    videoElement.addEventListener('error', onError);
    
    if (hasRVFC) {
      // Use requestVideoFrameCallback (Chrome/Edge) - most precise
      const captureLoop = () => {
        if (videoElement.ended || videoElement.paused) {
          console.log(`[CinematicExport] Captured ${frameCount} frames via RVFC`);
          cleanup();
          resolve();
          return;
        }
        
        drawFrame();
        (videoElement as any).requestVideoFrameCallback(captureLoop);
      };
      
      (videoElement as any).requestVideoFrameCallback(captureLoop);
      videoElement.play().catch((e) => {
        cleanup();
        reject(e);
      });
    } else {
      // Fallback: use requestAnimationFrame (less precise but still fast)
      const captureLoop = () => {
        if (videoElement.ended || videoElement.paused) {
          console.log(`[CinematicExport] Captured ${frameCount} frames via RAF`);
          cleanup();
          resolve();
          return;
        }
        
        drawFrame();
        requestAnimationFrame(captureLoop);
      };
      
      requestAnimationFrame(captureLoop);
      videoElement.play().catch((e) => {
        cleanup();
        reject(e);
      });
    }
  });
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
      generationId?: string
    ) => {
      abortRef.current = false;
      
      console.log("[CinematicExport] Starting export", { 
        scenes: scenes.length, 
        format, 
        generationId 
      });
      
      const VideoEncoderCtor = (globalThis as any).VideoEncoder;
      const AudioEncoderCtor = (globalThis as any).AudioEncoder;

      if (!VideoEncoderCtor) {
        const error = "Your browser does not support video export. Please use Chrome, Edge, or Safari 16.4+";
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
        // Determine dimensions
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const dimensions = isIOS 
          ? { landscape: { w: 1280, h: 720 }, portrait: { w: 720, h: 1280 }, square: { w: 960, h: 960 } }
          : { landscape: { w: 1920, h: 1080 }, portrait: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } };
        
        const dim = dimensions[format];
        const fps = isIOS ? 24 : 30;

        console.log("[CinematicExport] Config:", { isIOS, dim, fps });

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

        setState({ status: "loading", progress: 10 });

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
                console.warn("[CinematicExport] muxer.addAudioChunk failed", e);
              }
            },
            error: (e: any) => console.warn("[CinematicExport] Audio encoding error", e)
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

        // Track cumulative timestamp offset for concatenating scenes
        let cumulativeTimestampOffset = 0;

        // Process each scene
        for (let i = 0; i < scenesWithVideo.length; i++) {
          if (abortRef.current) break;
          
          const scene = scenesWithVideo[i];
          const baseProgress = 15 + Math.floor((i / scenesWithVideo.length) * 70);
          
          setState({ status: "rendering", progress: baseProgress });
          console.log(`[CinematicExport] Processing scene ${i + 1}/${scenesWithVideo.length}`);

          // Load video
          let tempVideo: HTMLVideoElement;
          try {
            tempVideo = await loadVideoElement(scene.videoUrl!);
          } catch (e) {
            console.error(`[CinematicExport] Failed to load video for scene ${i + 1}:`, e);
            toast({ 
              title: "Video Load Error", 
              description: `Scene ${i + 1}: ${(e as Error).message}`, 
              variant: "destructive" 
            });
            throw e;
          }

          // Process audio for this scene
          if (audioEncoder && audioTrackConfig && scene.audioUrl) {
            const sceneAudioBuffer = await loadAudioBuffer(scene.audioUrl, decodeCtx);
            
            if (sceneAudioBuffer) {
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
          }

          // 🚀 FAST: Capture frames during real-time playback (NOT frame-by-frame seeking!)
          const sceneStartFrame = globalFrameCount;
          
          await captureVideoFrames(
            tempVideo,
            canvas,
            ctx,
            fps,
            (timestamp, keyFrame) => {
              // Offset timestamp by cumulative duration of previous scenes
              const adjustedTimestamp = cumulativeTimestampOffset + timestamp;
              
              const frame = new VideoFrame(canvas, { 
                timestamp: adjustedTimestamp, 
                duration: Math.round(1e6 / fps) 
              });
              
              // Force keyframe every 2 seconds globally
              const forceKeyFrame = globalFrameCount % (fps * 2) === 0;
              videoEncoder.encode(frame, { keyFrame: keyFrame || forceKeyFrame });
              frame.close();
              
              globalFrameCount++;
            },
            (sceneProgress) => {
              const overallProgress = baseProgress + sceneProgress * (70 / scenesWithVideo.length);
              setState({ status: "rendering", progress: Math.floor(overallProgress) });
            }
          );
          
          // Update cumulative offset for next scene
          cumulativeTimestampOffset += Math.round(tempVideo.duration * 1_000_000);
          
          console.log(`[CinematicExport] Scene ${i + 1} complete: ${globalFrameCount - sceneStartFrame} frames`);

          // Cleanup
          URL.revokeObjectURL(tempVideo.src);
          tempVideo.remove();
          
          await yieldToUI();
        }

        // Finalize
        setState({ status: "encoding", progress: 88 });
        console.log("[CinematicExport] Finalizing video...");
        
        await videoEncoder.flush();
        if (audioEncoder) await audioEncoder.flush();
        
        videoEncoder.close();
        if (audioEncoder) audioEncoder.close();
        
        muxer.finalize();
        
        const { buffer } = muxer.target as ArrayBufferTarget;
        const blob = new Blob([buffer], { type: "video/mp4" });
        
        console.log("[CinematicExport] Video created:", { size: blob.size, frames: globalFrameCount });
        
        let publicUrl: string | undefined;
        
        // Upload to Supabase Storage if generationId provided
        if (generationId) {
          setState({ status: "uploading", progress: 92 });
          console.log("[CinematicExport] Uploading to storage...");
          
          const fileName = `${generationId}/${crypto.randomUUID()}.mp4`;
          
          const { error: uploadError } = await supabase.storage
            .from("scene-videos")
            .upload(fileName, blob, {
              contentType: "video/mp4",
              upsert: true,
            });

          if (uploadError) {
            console.error("[CinematicExport] Upload error:", uploadError);
            toast({ 
              title: "Upload Warning", 
              description: "Video created but cloud save failed. Download will start.", 
              variant: "default" 
            });
          } else {
            setState({ status: "uploading", progress: 96 });

            // Get signed URL (7 days)
            const { data: signedData } = await supabase.storage
              .from("scene-videos")
              .createSignedUrl(fileName, 604800);

            if (signedData?.signedUrl) {
              publicUrl = signedData.signedUrl;

              // Update generations table with video_url
              const { error: dbError } = await supabase
                .from("generations")
                .update({ video_url: publicUrl })
                .eq("id", generationId);

              if (dbError) {
                console.warn("[CinematicExport] Failed to update generation record:", dbError);
              } else {
                console.log("[CinematicExport] Video uploaded and saved:", publicUrl);
              }
            }
          }
        }
        
        const localUrl = URL.createObjectURL(blob);
        
        setState({ status: "complete", progress: 100, videoUrl: publicUrl || localUrl });
        
        toast({ 
          title: "Export Complete", 
          description: "Your video is ready to download!", 
        });
        
        return { localUrl, publicUrl, blob };
      } catch (error) {
        console.error("[CinematicExport] Export failed:", error);
        const errorMsg = error instanceof Error ? error.message : "Export failed";
        setState({ 
          status: "error", 
          progress: 0, 
          error: errorMsg
        });
        toast({ 
          title: "Export Failed", 
          description: errorMsg, 
          variant: "destructive" 
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
      console.error("[CinematicExport] Share failed:", error);
    }
  }, []);

  return { state, exportVideo, downloadVideo, shareVideo, reset };
}
