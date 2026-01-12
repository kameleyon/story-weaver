import { useState, useCallback, useRef } from "react";
import type { Scene } from "./useGenerationPipeline";

export type ExportStatus = "idle" | "loading" | "rendering" | "encoding" | "complete" | "error";

interface ExportState {
  status: ExportStatus;
  progress: number; // 0-100
  error?: string;
  videoUrl?: string;
}

/**
 * Client-side MP4 export using Canvas + MediaRecorder.
 * Renders scene images with audio into a downloadable video.
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
                audioCtx.close();
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

        // Step 2: Create canvas and start recording
        setState({ status: "rendering", progress: 20 });

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;

        // Calculate total duration
        const totalDuration = assets.reduce((sum, a) => sum + a.duration, 0);

        // Create audio context for mixing
        const audioCtx = new AudioContext();
        const destination = audioCtx.createMediaStreamDestination();

        // Capture canvas stream
        const videoStream = canvas.captureStream(30);
        const videoTrack = videoStream.getVideoTracks()[0];

        // Combine video and audio streams
        const combinedStream = new MediaStream([
          videoTrack,
          ...destination.stream.getAudioTracks(),
        ]);

        // Setup MediaRecorder with best available codec
        const mimeTypes = [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm",
          "video/mp4",
        ];
        const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm";

        const recorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: 8_000_000,
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        const recordingComplete = new Promise<Blob>((resolve) => {
          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            resolve(blob);
          };
        });

        recorder.start(100); // Collect data every 100ms

        // Step 3: Render each scene
        let elapsedTime = 0;

        for (let i = 0; i < assets.length; i++) {
          if (abortRef.current) {
            recorder.stop();
            audioCtx.close();
            throw new Error("Export cancelled");
          }

          const { img, audioBuffer, duration } = assets[i];
          const startTime = audioCtx.currentTime;

          // Draw image (cover fit)
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, width, height);

          if (img) {
            const imgAspect = img.width / img.height;
            const canvasAspect = width / height;

            let drawWidth = width;
            let drawHeight = height;
            let drawX = 0;
            let drawY = 0;

            if (imgAspect > canvasAspect) {
              drawHeight = height;
              drawWidth = height * imgAspect;
              drawX = (width - drawWidth) / 2;
            } else {
              drawWidth = width;
              drawHeight = width / imgAspect;
              drawY = (height - drawHeight) / 2;
            }

            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
          }

          // Play audio for this scene
          if (audioBuffer) {
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(destination);
            source.connect(audioCtx.destination); // Also play locally for sync
            source.start(0);
          }

          // Wait for scene duration
          await new Promise<void>((resolve) => {
            const frameInterval = 1000 / 30; // 30fps
            let frameCount = 0;
            const totalFrames = Math.ceil((duration * 1000) / frameInterval);

            const drawFrame = () => {
              if (abortRef.current) {
                resolve();
                return;
              }

              frameCount++;

              // Ken Burns effect: slow zoom
              if (img) {
                const progress = frameCount / totalFrames;
                const scale = 1 + progress * 0.05; // 5% zoom over duration

                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, width, height);

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

              if (frameCount >= totalFrames) {
                resolve();
              } else {
                setTimeout(drawFrame, frameInterval);
              }
            };

            drawFrame();
          });

          elapsedTime += duration;
          const progressPct = 20 + Math.round((elapsedTime / totalDuration) * 70);
          setState((s) => ({ ...s, progress: progressPct }));
        }

        // Step 4: Finalize recording
        setState({ status: "encoding", progress: 90 });
        recorder.stop();
        audioCtx.close();

        const videoBlob = await recordingComplete;
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

  const downloadVideo = useCallback((url: string, filename = "video.webm") => {
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
