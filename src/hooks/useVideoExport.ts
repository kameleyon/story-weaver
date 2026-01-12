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
    async (scenes: Scene[], format: "landscape" | "portrait" | "square" = "landscape") => {
      abortRef.current = false;

      const dimensions = {
        landscape: { width: 1920, height: 1080 },
        portrait: { width: 1080, height: 1920 },
        square: { width: 1080, height: 1080 },
      };

      const { width, height } = dimensions[format];
      const fps = 30;

      setState({ status: "loading", progress: 0 });

      try {
        // Step 1: Preload all images and audio
        const assets = await Promise.all(
          scenes.map(async (scene, idx) => {
            if (abortRef.current) throw new Error("Export cancelled");

            const img = new Image();
            img.crossOrigin = "anonymous";

            const imgPromise = new Promise<HTMLImageElement>((resolve, reject) => {
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error(`Failed to load image for scene ${idx + 1}`));
              img.src = scene.imageUrl || "";
            });

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

            const loadedImg = scene.imageUrl ? await imgPromise : null;

            setState((s) => ({
              ...s,
              progress: Math.round(((idx + 1) / scenes.length) * 20),
            }));

            return { img: loadedImg, audioBuffer, duration: scene.duration };
          })
        );

        if (abortRef.current) throw new Error("Export cancelled");

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
        }

        // Step 3: Render each frame
        let currentFrame = 0;
        let sceneStartFrame = 0;

        for (let sceneIdx = 0; sceneIdx < assets.length; sceneIdx++) {
          if (abortRef.current) {
            videoEncoder.close();
            audioEncoder.close();
            throw new Error("Export cancelled");
          }

          const { img, duration } = assets[sceneIdx];
          const sceneFrames = Math.ceil(duration * fps);

          for (let frameInScene = 0; frameInScene < sceneFrames; frameInScene++) {
            if (abortRef.current) throw new Error("Export cancelled");

            // Ken Burns effect: slow zoom
            const progress = frameInScene / sceneFrames;
            const scale = 1 + progress * 0.05;

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

            const isKeyframe = frameInScene === 0; // Keyframe at start of each scene
            videoEncoder.encode(frame, { keyFrame: isKeyframe });
            frame.close();

            currentFrame++;

            // Update progress
            const progressPct = 20 + Math.round((currentFrame / totalFrames) * 70);
            setState((s) => ({ ...s, progress: progressPct }));
          }

          sceneStartFrame += sceneFrames;
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
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  return {
    state,
    exportVideo,
    downloadVideo,
    reset,
  };
}
