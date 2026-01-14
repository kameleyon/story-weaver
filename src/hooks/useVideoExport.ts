import { useState, useCallback, useRef } from "react";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { Scene } from "./useGenerationPipeline";

export type ExportStatus = "idle" | "loading" | "rendering" | "encoding" | "complete" | "error";

interface ExportState {
  status: ExportStatus;
  progress: number; // 0-100
  error?: string;
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

      const dimensions = {
        landscape: { width: 1920, height: 1080 },
        portrait: { width: 1080, height: 1920 },
        square: { width: 1080, height: 1080 },
      } as const;

      const selected = dimensions[format];
      if (!selected) {
        throw new Error(`Unsupported export format: ${String(format)}`);
      }

      const { width, height } = selected;
      const fps = 30;

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

        // Create MP4 muxer
        const muxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: {
            codec: "avc",
            width,
            height,
          },
          audio: {
            codec: "aac",
            numberOfChannels: 2,
            sampleRate: 48000,
          },
          fastStart: "in-memory",
        });

        // Create video encoder
        const videoEncoder = new VideoEncoder({
          output: (chunk, meta) => {
            muxer.addVideoChunk(chunk, meta);
          },
          error: (e) => {
            console.error("Video encoder error:", e);
            throw e;
          },
        });

        videoEncoder.configure({
          codec: "avc1.640028", // H.264 High Profile
          width,
          height,
          bitrate: 8_000_000,
          framerate: fps,
        });

        // Create audio encoder
        const audioEncoder = new AudioEncoder({
          output: (chunk, meta) => {
            muxer.addAudioChunk(chunk, meta);
          },
          error: (e) => {
            console.error("Audio encoder error:", e);
          },
        });

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
          const interleavedData = new Float32Array(remaining * 2);

          for (let j = 0; j < remaining; j++) {
            interleavedData[j * 2] = leftChannel[i + j];
            interleavedData[j * 2 + 1] = rightChannel[i + j];
          }

          const audioData = new AudioData({
            format: "f32-planar",
            sampleRate: 48000,
            numberOfFrames: remaining,
            numberOfChannels: 2,
            timestamp: Math.round((i / 48000) * 1_000_000), // microseconds
            data: new Float32Array([
              ...leftChannel.slice(i, i + remaining),
              ...rightChannel.slice(i, i + remaining),
            ]),
          });

          audioEncoder.encode(audioData);
          audioData.close();

          // Yield every 50 audio chunks to keep UI responsive
          if ((i / audioChunkSize) % 50 === 0) {
            await yieldToUI();
          }
        }

        // Step 3: Render each frame
        // For scenes with multiple images, divide the scene duration equally among images
        let currentFrame = 0;

        for (let sceneIdx = 0; sceneIdx < assets.length; sceneIdx++) {
          if (abortRef.current) {
            videoEncoder.close();
            audioEncoder.close();
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
        setState({ status: "encoding", progress: 90 });

        await videoEncoder.flush();
        await audioEncoder.flush();
        videoEncoder.close();
        audioEncoder.close();

        muxer.finalize();
        const { buffer } = muxer.target as ArrayBufferTarget;

        const videoBlob = new Blob([buffer], { type: "video/mp4" });
        const videoUrl = URL.createObjectURL(videoBlob);

        setState({ status: "complete", progress: 100, videoUrl });

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
