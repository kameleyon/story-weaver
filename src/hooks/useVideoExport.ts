import { useState, useCallback, useRef } from "react";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { Scene } from "./useGenerationPipeline";

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
  const reset = useCallback(() => {
    abortRef.current = true;
    setState({ status: "idle", progress: 0 });
  }, []);

  const exportVideo = useCallback(
    async (scenes: Scene[], format: "landscape" | "portrait" | "square") => {
      abortRef.current = false;

      // Access WebCodecs constructors safely via globalThis to prevent ReferenceError on iOS Safari
      const AudioEncoderCtor = (globalThis as any).AudioEncoder as typeof AudioEncoder | undefined;
      const AudioDataCtor = (globalThis as any).AudioData as typeof AudioData | undefined;

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      // Check for WebCodecs API support (required for video export)
      const supportsVideo =
        typeof VideoEncoder !== "undefined" &&
        typeof VideoFrame !== "undefined";

      // Audio is optional (some mobile browsers have VideoEncoder but no AudioEncoder)
      const supportsAudio = !!AudioEncoderCtor && !!AudioDataCtor;

      console.log("[VideoExport] Capabilities:", {
        isIOS,
        hasVideoEncoder: typeof VideoEncoder !== "undefined",
        hasAudioEncoder: !!AudioEncoderCtor,
        hasAudioData: !!AudioDataCtor,
        userAgent: navigator.userAgent.slice(0, 100),
      });

      if (!supportsVideo) {
        const errorMsg =
          "Video export is not supported on this device. Please use a desktop browser (Chrome, Edge, or Safari 16.4+) to export videos.";
        setState({ status: "error", progress: 0, error: errorMsg });
        throw new Error(errorMsg);
      }

      const baseDimensions = {
        landscape: { width: 1920, height: 1080 },
        portrait: { width: 1080, height: 1920 },
        square: { width: 1080, height: 1080 },
      } as const;

      // iOS Safari often OOMs on 1080p WebCodecs encoding; use a lighter preset.
      const iosDimensions = {
        landscape: { width: 1280, height: 720 },
        portrait: { width: 720, height: 1280 },
        square: { width: 960, height: 960 },
      } as const;

      const dimensions = isIOS ? iosDimensions : baseDimensions;

      const selected = dimensions[format];
      if (!selected) {
        throw new Error(`Unsupported export format: ${String(format)}`);
      }

      const { width, height } = selected;
      const fps = isIOS ? 24 : 30;
      const targetBitrate = isIOS ? 2_500_000 : 8_000_000;

      setState({ status: "loading", progress: 0 });

      try {
        // Step 1: Preload all images and audio
        // For scenes with multiple images, load all of them
        console.log("[VideoExport] Loading assets for", scenes.length, "scenes");
        
        // Build a flat list of all images to load
        interface SceneAsset {
          images: HTMLImageElement[];
          audioBuffer: AudioBuffer | null;
          duration: number;
        }
        
        const assets: SceneAsset[] = await Promise.all(
          scenes.map(async (scene, idx) => {
            if (abortRef.current) throw new Error("Export cancelled");

            // Get all image URLs for this scene
            const imageUrls = scene.imageUrls && scene.imageUrls.length > 0 
              ? scene.imageUrls 
              : scene.imageUrl 
                ? [scene.imageUrl] 
                : [];
            
            // Load all images for this scene
            const loadedImages: HTMLImageElement[] = [];
            for (const url of imageUrls) {
              try {
                // Try with CORS first, fallback to no-cors
                let loadedImg: HTMLImageElement;
                try {
                  loadedImg = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error("CORS load failed"));
                    img.src = url;
                  });
                } catch {
                  // Retry without crossOrigin
                  loadedImg = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error("Image load failed"));
                    img.src = url;
                  });
                }
                loadedImages.push(loadedImg);
              } catch (e) {
                console.warn(`Scene ${idx + 1}: Failed to load image:`, e);
              }
            }

            let audioBuffer: AudioBuffer | null = null;
            if (scene.audioUrl) {
              try {
                const audioCtx = new AudioContext();
                const res = await fetch(scene.audioUrl);
                const arrayBuf = await res.arrayBuffer();
                audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
                await audioCtx.close();
              } catch (e) {
                console.warn(`Failed to load audio for scene ${idx + 1}:`, e);
              }
            }

            setState((s) => ({
              ...s,
              progress: Math.round(((idx + 1) / scenes.length) * 20),
            }));

            // Use actual audio duration if available (+ small buffer), 
            // otherwise fall back to scene.duration
            const actualDuration = audioBuffer 
              ? audioBuffer.duration + 0.3 
              : scene.duration;
            
            return { 
              images: loadedImages, 
              audioBuffer, 
              duration: actualDuration 
            };
          })
        );

        if (abortRef.current) throw new Error("Export cancelled");

        const totalImagesLoaded = assets.reduce((sum, a) => sum + a.images.length, 0);
        console.log(`[VideoExport] Loaded ${totalImagesLoaded} total images for ${assets.length} scenes`);

        // Step 2: Setup MP4 muxer and video encoder
        setState({ status: "rendering", progress: 20 });

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;

        // Calculate total duration and frames
        const totalDuration = assets.reduce((sum, a) => sum + a.duration, 0);
        const totalFrames = Math.ceil(totalDuration * fps);

        const wantsAudio = scenes.some((s) => !!s.audioUrl);

        // Preflight audio support (some mobile browsers partially implement WebCodecs)
        let audioEnabled = supportsAudio && wantsAudio;
        if (audioEnabled && typeof AudioEncoderCtor?.isConfigSupported === "function") {
          try {
            const support = await AudioEncoderCtor.isConfigSupported({
              codec: "mp4a.40.2",
              numberOfChannels: 2,
              sampleRate: 48000,
              bitrate: 128000,
            });
            if (!support?.supported) audioEnabled = false;
          } catch {
            audioEnabled = false;
          }
        }

        if (wantsAudio && !audioEnabled) {
          setState((s) => ({
            ...s,
            warning: "Audio export isn't supported on this device. Exporting a silent video.",
          }));
        }

        // We create the muxer AFTER we've confirmed audio encoder construction works.
        // This prevents creating an MP4 with an audio track on browsers that claim partial support.
        let muxer!: Muxer<ArrayBufferTarget>;

        // Create audio encoder (optional) - use constructor from globalThis
        let audioEncoder: AudioEncoder | null = null;
        if (audioEnabled && AudioEncoderCtor) {
          try {
            audioEncoder = new AudioEncoderCtor({
              output: (chunk, meta) => {
                muxer.addAudioChunk(chunk, meta);
              },
              error: (e) => {
                console.error("Audio encoder error:", e);
              },
            });
          } catch (e) {
            // Some mobile browsers expose the symbol but fail at runtime.
            console.warn("[VideoExport] AudioEncoder instantiation failed:", e);
            audioEnabled = false;
            audioEncoder = null;
            setState((s) => ({
              ...s,
              warning: "Audio export isn't supported on this device. Exporting a silent video.",
            }));
          }
        }

        // Create MP4 muxer
        muxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: {
            codec: "avc",
            width,
            height,
          },
          ...(audioEnabled
            ? {
                audio: {
                  codec: "aac",
                  numberOfChannels: 2,
                  sampleRate: 48000,
                },
              }
            : {}),
          fastStart: "in-memory",
        });

        // Create video encoder
        let videoChunkCount = 0;
        const videoEncoder = new VideoEncoder({
          output: (chunk, meta) => {
            videoChunkCount++;
            muxer.addVideoChunk(chunk, meta);
          },
          error: (e) => {
            console.error("Video encoder error:", e);
            throw e;
          },
        });

        // Prefer a widely supported H.264 baseline profile first (esp. on iOS Safari)
        const videoConfigCandidates = [
          {
            // Level 4.0 supports up to 1920x1080 @ 30fps (Level 3.0 only supports ~720x480)
            codec: "avc1.42E028", // Baseline Profile, Level 4.0
            width,
            height,
            bitrate: targetBitrate,
            framerate: fps,
          },
          {
            codec: "avc1.4D4028", // Main Profile
            width,
            height,
            bitrate: targetBitrate,
            framerate: fps,
          },
          {
            codec: "avc1.640028", // High Profile (previous default)
            width,
            height,
            bitrate: targetBitrate,
            framerate: fps,
          },
        ];

        let chosenVideoConfig = videoConfigCandidates[0];
        if (typeof (VideoEncoder as any).isConfigSupported === "function") {
          for (const cfg of videoConfigCandidates) {
            try {
              const support = await (VideoEncoder as any).isConfigSupported(cfg);
              if (support?.supported) {
                chosenVideoConfig = cfg;
                break;
              }
            } catch {
              // ignore and try next
            }
          }
        }

        videoEncoder.configure(chosenVideoConfig);

        if (audioEnabled && audioEncoder) {
          audioEncoder.configure({
            codec: "mp4a.40.2", // AAC-LC
            numberOfChannels: 2,
            sampleRate: 48000,
            bitrate: 128000,
          });

          // Merge all audio into a single buffer for encoding
          const audioCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * 48000), 48000);
          let audioOffset = 0;

          for (const asset of assets) {
            if (asset.audioBuffer) {
              const source = audioCtx.createBufferSource();
              source.buffer = asset.audioBuffer;
              source.connect(audioCtx.destination);
              source.start(audioOffset);
            }
            audioOffset += asset.duration;
          }

          const renderedAudio = await audioCtx.startRendering();

          // Encode audio in chunks
          const audioChunkSize = 1024;
          const totalAudioSamples = renderedAudio.length;
          const leftChannel = renderedAudio.getChannelData(0);
          const rightChannel = renderedAudio.getChannelData(1);

          for (let i = 0; i < totalAudioSamples; i += audioChunkSize) {
            if (abortRef.current) throw new Error("Export cancelled");

            const remaining = Math.min(audioChunkSize, totalAudioSamples - i);

            // Create properly formatted planar audio data
            // For f32-planar: left channel samples followed by right channel samples
            const planarData = new Float32Array(remaining * 2);
            for (let j = 0; j < remaining; j++) {
              planarData[j] = leftChannel[i + j]; // Left channel first
              planarData[remaining + j] = rightChannel[i + j]; // Right channel after
            }

            const audioData = new AudioDataCtor!({
              format: "f32-planar",
              sampleRate: 48000,
              numberOfFrames: remaining,
              numberOfChannels: 2,
              timestamp: Math.round((i / 48000) * 1_000_000), // microseconds
              data: planarData,
            });

            audioEncoder.encode(audioData);
            audioData.close();

            // Yield every 50 audio chunks to keep UI responsive
            if ((i / audioChunkSize) % 50 === 0) {
              await yieldToUI();
            }
          }
        }

        // Step 3: Render each frame
        // For scenes with multiple images, divide the scene duration equally among images
        let currentFrame = 0;

        for (let sceneIdx = 0; sceneIdx < assets.length; sceneIdx++) {
          if (abortRef.current) {
            videoEncoder.close();
            audioEncoder?.close();
            throw new Error("Export cancelled");
          }

          const { images, duration } = assets[sceneIdx];
          const sceneFrames = Math.ceil(duration * fps);
          
          // If we have multiple images, divide the scene into segments
          const imageCount = Math.max(1, images.length);
          const framesPerImage = Math.ceil(sceneFrames / imageCount);

          for (let frameInScene = 0; frameInScene < sceneFrames; frameInScene++) {
            if (abortRef.current) throw new Error("Export cancelled");

            // Determine which image to show based on frame position
            const imageIndex = Math.min(
              Math.floor(frameInScene / framesPerImage),
              imageCount - 1
            );
            const img = images[imageIndex] || null;

            // Progress within current image segment for Ken Burns
            const segmentStart = imageIndex * framesPerImage;
            const segmentEnd = Math.min((imageIndex + 1) * framesPerImage, sceneFrames);
            const progressInSegment = (frameInScene - segmentStart) / (segmentEnd - segmentStart);
            
            // Ken Burns effect: slow zoom
            const scale = 1 + progressInSegment * 0.05;

            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, width, height);

            if (img) {
              const imgAspect = img.width / img.height;
              const canvasAspect = width / height;

              let drawWidth = width * scale;
              let drawHeight = height * scale;

              if (imgAspect > canvasAspect) {
                drawHeight = height * scale;
                drawWidth = drawHeight * imgAspect;
              } else {
                drawWidth = width * scale;
                drawHeight = drawWidth / imgAspect;
              }

              const drawX = (width - drawWidth) / 2;
              const drawY = (height - drawHeight) / 2;

              ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
            }

            // Create video frame
            const frame = new VideoFrame(canvas, {
              timestamp: Math.round((currentFrame / fps) * 1_000_000), // microseconds
              duration: Math.round((1 / fps) * 1_000_000),
            });

            // Keyframe at start of each scene and at image transitions
            const isKeyframe = frameInScene === 0 || frameInScene === segmentStart;
            videoEncoder.encode(frame, { keyFrame: isKeyframe });
            frame.close();

            currentFrame++;

            // Update progress and yield every 5 frames to keep UI responsive
            const progressPct = 20 + Math.round((currentFrame / totalFrames) * 70);
            setState((s) => ({ ...s, progress: progressPct }));

            if (currentFrame % 5 === 0) {
              await yieldToUI();
            }
          }
        }

        // Step 4: Finalize encoding
        setState((s) => ({ ...s, status: "encoding", progress: 90 }));

        await videoEncoder.flush();
        if (audioEncoder) await audioEncoder.flush();
        videoEncoder.close();
        audioEncoder?.close();

        if (videoChunkCount === 0) {
          throw new Error(
            "This browser couldn't encode the video (0 chunks produced). Please try exporting on a desktop browser."
          );
        }

        try {
          muxer.finalize();
        } catch (e) {
          console.error("[VideoExport] muxer.finalize failed:", e);
          throw new Error("Failed to finalize MP4 on this device. Try exporting on desktop.");
        }

        const { buffer } = muxer.target as ArrayBufferTarget;
        if (!buffer || buffer.byteLength < 1024) {
          throw new Error("Export produced an empty MP4. Try exporting on a desktop browser.");
        }

        const videoBlob = new Blob([buffer], { type: "video/mp4" });
        const videoUrl = URL.createObjectURL(videoBlob);

        setState((s) => ({ ...s, status: "complete", progress: 100, videoUrl }));

        return videoUrl;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Export failed";
        setState({ status: "error", progress: 0, error: message });
        throw error;
      }
    },
    []
  );

  const downloadVideo = useCallback((url: string, filename = "video.mp4") => {
    if (!url) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    // iOS Safari often blocks "download" for blob URLs unless handled as a navigation.
    if (isIOS) {
      const win = window.open(url, "_blank");
      if (!win) {
        window.location.href = url;
      }
      return;
    }

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";

    document.body.appendChild(a);

    // Some browsers are flaky unless the click happens on the next frame.
    requestAnimationFrame(() => {
      a.click();
      document.body.removeChild(a);
    });
  }, []);

  return {
    state,
    exportVideo,
    downloadVideo,
    reset,
  };
}
