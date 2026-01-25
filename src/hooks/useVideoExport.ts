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
    // Keep a consistent prefix to make filtering easier.
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

      log("Run", runId, "Capabilities", {
        isIOS,
        hasVideoEncoder: typeof VideoEncoder !== "undefined",
        hasAudioEncoder: !!AudioEncoderCtor,
        hasAudioData: !!AudioDataCtor,
        userAgent: navigator.userAgent.slice(0, 100),
      });

      if (!supportsVideo) {
        const errorMsg =
          "Video export is not supported on this device. Please use a desktop browser (Chrome, Edge, or Safari 16.4+) to export videos.";
        err("Run", runId, "Unsupported device/browser (missing WebCodecs video)");
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

      log("Run", runId, "Export settings", { width, height, fps, targetBitrate, isIOS });

      setState({ status: "loading", progress: 0 });

      try {
        // Step 1: Preload all images and audio
        // For scenes with multiple images, load all of them
        log("Run", runId, "Loading assets for", scenes.length, "scenes");
        
        // FIX: Create ONE shared OfflineAudioContext for decoding all audio
        // Mobile browsers limit active AudioContext instances (usually 4-6).
        // Using OfflineAudioContext avoids hardware resource locks.
        const sharedDecodeCtx = new OfflineAudioContext(1, 1, 48000);

        // IMPORTANT (mobile Safari): `decodeAudioData` can be flaky when called concurrently
        // on the same context. Since we load scenes with `Promise.all`, we serialize the
        // actual decode step while still allowing fetches/image loads to run in parallel.
        let decodeChain: Promise<unknown> = Promise.resolve();

        const decodeAudioSequentially = async (buf: ArrayBuffer): Promise<AudioBuffer> => {
          // Some browsers detach/transfer the underlying buffer during decoding.
          // Use a copy to be safe.
          const bufCopy = buf.slice(0);

          const decodePromise = decodeChain.then(() => sharedDecodeCtx.decodeAudioData(bufCopy));
          // Keep the chain alive even if a decode fails.
          decodeChain = decodePromise.catch(() => undefined);
          return decodePromise;
        };
        
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
                warn("Run", runId, `Scene ${idx + 1}: Failed to load image`, e);
              }
            }

            // Load audio using the SHARED context to avoid mobile AudioContext limits
            let audioBuffer: AudioBuffer | null = null;
            if (scene.audioUrl) {
              try {
                const res = await fetch(scene.audioUrl);
                const arrayBuf = await res.arrayBuffer();
                audioBuffer = await decodeAudioSequentially(arrayBuf);
              } catch (e) {
                warn("Run", runId, `Failed to load audio for scene ${idx + 1}`, e);
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
        log("Run", runId, `Loaded ${totalImagesLoaded} total images for ${assets.length} scenes`);

        // Step 2: Setup MP4 muxer and video encoder
        setState({ status: "rendering", progress: 20 });

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;

        // Calculate total duration and frames
        const totalDuration = assets.reduce((sum, a) => sum + a.duration, 0);
        const totalFrames = Math.ceil(totalDuration * fps);

        log("Run", runId, "Timeline", { totalDuration, totalFrames, fps });

        const wantsAudio = scenes.some((s) => !!s.audioUrl);

        // iOS Safari WebCodecs audio support is inconsistent across versions.
        // Some builds accept only certain codec strings and/or sample rates.
        // We'll pick a supported config and use it consistently for:
        // - AudioEncoder.configure
        // - OfflineAudioContext rendering sampleRate
        // - AudioData timestamps/sampleRate
        // - MP4 muxer audio track sampleRate
        const audioConfigCandidates = [
          { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 },
          { codec: "mp4a.40.2", sampleRate: 44100, numberOfChannels: 2, bitrate: 128000 },
          // Safari sometimes accepts "aac" as a codec string even when it rejects mp4a.40.2.
          { codec: "aac", sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 },
          { codec: "aac", sampleRate: 44100, numberOfChannels: 2, bitrate: 128000 },
        ] as const;

        // Preflight audio support (some mobile browsers partially implement WebCodecs)
        let audioEnabled = supportsAudio && wantsAudio;
        let chosenAudioConfig:
          | {
              codec: (typeof audioConfigCandidates)[number]["codec"];
              sampleRate: (typeof audioConfigCandidates)[number]["sampleRate"];
              numberOfChannels: 2;
              bitrate: number;
            }
          | null = null;

        if (audioEnabled && typeof AudioEncoderCtor?.isConfigSupported === "function") {
          try {
            for (const cfg of audioConfigCandidates) {
              try {
                const support = await AudioEncoderCtor.isConfigSupported(cfg);
                log("Run", runId, "AudioEncoder.isConfigSupported", {
                  codec: cfg.codec,
                  sampleRate: cfg.sampleRate,
                  supported: !!support?.supported,
                });
                if (support?.supported) {
                  chosenAudioConfig = cfg;
                  break;
                }
              } catch {
                // Ignore and try next.
              }
            }

            if (!chosenAudioConfig) audioEnabled = false;
          } catch {
            audioEnabled = false;
          }
        }

        // If isConfigSupported is not available, we'll still attempt to configure later.
        if (audioEnabled && !chosenAudioConfig) {
          chosenAudioConfig = audioConfigCandidates[0];
        }

        if (wantsAudio && !audioEnabled) {
          setState((s) => ({
            ...s,
            warning: "Audio export isn't supported on this device. Exporting a silent video.",
          }));

          warn("Run", runId, "Audio requested but disabled; exporting silent video");
        }

        // We create the muxer AFTER we've confirmed audio encoder construction works.
        // This prevents creating an MP4 with an audio track on browsers that claim partial support.
        let muxer!: Muxer<ArrayBufferTarget>;

        // Create audio encoder (optional) - use constructor from globalThis
        let audioEncoder: AudioEncoder | null = null;
        let audioChunkCount = 0;
        if (audioEnabled && AudioEncoderCtor) {
          try {
            audioEncoder = new AudioEncoderCtor({
              output: (chunk, meta) => {
                audioChunkCount++;
                muxer.addAudioChunk(chunk, meta);
              },
              error: (e) => {
                err("Run", runId, "Audio encoder error", e);
              },
            });

            log("Run", runId, "AudioEncoder instantiated");

            // Configure audio encoder with fallback across candidate configs.
            // Some iOS builds throw during configure even when isConfigSupported is missing/incorrect.
            let configured = false;
            const configureCandidates = chosenAudioConfig
              ? [
                  chosenAudioConfig,
                  ...audioConfigCandidates.filter(
                    (c) => c.codec !== chosenAudioConfig!.codec || c.sampleRate !== chosenAudioConfig!.sampleRate
                  ),
                ]
              : [...audioConfigCandidates];

            for (const cfg of configureCandidates) {
              try {
                audioEncoder.configure(cfg);
                chosenAudioConfig = cfg;
                configured = true;
                log("Run", runId, "AudioEncoder configured", {
                  codec: cfg.codec,
                  sampleRate: cfg.sampleRate,
                  numberOfChannels: cfg.numberOfChannels,
                  bitrate: cfg.bitrate,
                });
                break;
              } catch (e) {
                warn("Run", runId, "AudioEncoder.configure failed", {
                  codec: cfg.codec,
                  sampleRate: cfg.sampleRate,
                  message: e instanceof Error ? e.message : String(e),
                });
              }
            }

            if (!configured) {
              warn("Run", runId, "No supported audio config worked; exporting silent video");
              audioEnabled = false;
              audioEncoder.close();
              audioEncoder = null;
              chosenAudioConfig = null;
              setState((s) => ({
                ...s,
                warning: "Audio export isn't supported on this device. Exporting a silent video.",
              }));
            }
          } catch (e) {
            // Some mobile browsers expose the symbol but fail at runtime.
            warn("Run", runId, "AudioEncoder instantiation failed", e);
            audioEnabled = false;
            audioEncoder = null;
            chosenAudioConfig = null;
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
                  sampleRate: chosenAudioConfig?.sampleRate ?? 48000,
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
            err("Run", runId, "Video encoder error", e);
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
              log("Run", runId, "VideoEncoder.isConfigSupported", {
                codec: cfg.codec,
                supported: !!support?.supported,
              });
              if (support?.supported) {
                chosenVideoConfig = cfg;
                break;
              }
            } catch {
              // ignore and try next
            }
          }
        }

        log("Run", runId, "Configuring VideoEncoder", chosenVideoConfig);
        videoEncoder.configure(chosenVideoConfig);
        log("Run", runId, "VideoEncoder configured");

        if (audioEnabled && audioEncoder && chosenAudioConfig) {
          // Merge all audio into a single buffer for encoding
          const audioSampleRate = chosenAudioConfig.sampleRate;
          const audioCtx = new OfflineAudioContext(
            2,
            Math.ceil(totalDuration * audioSampleRate),
            audioSampleRate
          );
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

          log("Run", runId, "OfflineAudioContext rendered", {
            length: renderedAudio.length,
            duration: renderedAudio.duration,
            sampleRate: renderedAudio.sampleRate,
          });

          // Encode audio in chunks
          const audioChunkSize = 1024;
          const totalAudioSamples = renderedAudio.length;
          const leftChannel = renderedAudio.getChannelData(0);
          const rightChannel = renderedAudio.getChannelData(1);

          for (let i = 0; i < totalAudioSamples; i += audioChunkSize) {
            if (abortRef.current) throw new Error("Export cancelled");

            const remaining = Math.min(audioChunkSize, totalAudioSamples - i);

            // Create interleaved audio data (L0, R0, L1, R1...)
            // Some mobile WebCodecs implementations (iOS) don't accept planar data.
            const interleavedData = new Float32Array(remaining * 2);
            for (let j = 0; j < remaining; j++) {
              const leftSample = leftChannel[i + j] ?? 0;
              const rightSample = rightChannel[i + j] ?? leftSample;
              const baseIndex = j * 2;
              interleavedData[baseIndex] = leftSample;
              interleavedData[baseIndex + 1] = rightSample;
            }

            // Use Math.floor for strict timestamp monotonicity (iOS Safari is strict)
            const timestampUs = Math.floor((i / audioSampleRate) * 1_000_000);
            const audioData = new AudioDataCtor!({
              format: "f32",
              sampleRate: audioSampleRate,
              numberOfFrames: remaining,
              numberOfChannels: 2,
              timestamp: timestampUs,
              data: interleavedData,
            });

            audioEncoder.encode(audioData);
            audioData.close();

            // Yield every 50 audio chunks to keep UI responsive
            if ((i / audioChunkSize) % 50 === 0) {
              await yieldToUI();
            }
          }

          log("Run", runId, "Audio encoding queued", {
            totalAudioSamples,
            audioChunkSize,
          });
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

          log("Run", runId, "Render scene", {
            sceneIdx: sceneIdx + 1,
            duration,
            sceneFrames,
            images: images.length,
          });
          
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

            // Track segment position for keyframe insertion at image transitions
            const segmentStart = imageIndex * framesPerImage;
            
            // Static image (no zoom/Ken Burns effect to keep brand mark stable)
            const scale = 1;

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
            try {
              videoEncoder.encode(frame, { keyFrame: isKeyframe });
            } catch (e) {
              err("Run", runId, "videoEncoder.encode failed", {
                sceneIdx: sceneIdx + 1,
                frameInScene,
                currentFrame,
                isKeyframe,
                message: e instanceof Error ? e.message : String(e),
              });
              throw e;
            }
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

        log("Run", runId, "Flushing encoders...");

        await videoEncoder.flush();
        log("Run", runId, "VideoEncoder flushed", { videoChunkCount });
        
        if (audioEncoder) {
          await audioEncoder.flush();
          log("Run", runId, "AudioEncoder flushed", { audioChunkCount });
        }
        
        videoEncoder.close();
        audioEncoder?.close();

        log("Run", runId, "Encoders closed", { videoChunkCount, audioChunkCount });

        if (videoChunkCount === 0) {
          throw new Error(
            "This browser couldn't encode the video (0 chunks produced). Please try exporting on a desktop browser."
          );
        }

        // Warn if audio was expected but no chunks were produced (silent export)
        if (wantsAudio && audioEnabled && audioChunkCount === 0) {
          warn("Run", runId, "Audio was requested and encoder configured, but 0 audio chunks were produced. Video will be silent.");
          setState((s) => ({
            ...s,
            warning: "Audio encoding failed on this device. Video exported without sound.",
          }));
        }

        try {
          log("Run", runId, "Finalizing muxer...");
          muxer.finalize();
        } catch (e) {
          err("Run", runId, "muxer.finalize failed", e);
          throw new Error("Failed to finalize MP4 on this device. Try exporting on desktop.");
        }

        const { buffer } = muxer.target as ArrayBufferTarget;
        log("Run", runId, "Muxed buffer", { byteLength: buffer?.byteLength ?? 0 });
        if (!buffer || buffer.byteLength < 1024) {
          throw new Error("Export produced an empty MP4. Try exporting on a desktop browser.");
        }

        const videoBlob = new Blob([buffer], { type: "video/mp4" });
        const videoUrl = URL.createObjectURL(videoBlob);

        log("Run", runId, "Complete", {
          ms: Math.round(performance.now() - t0),
          urlCreated: !!videoUrl,
        });
        setState((s) => ({ ...s, status: "complete", progress: 100, videoUrl }));

        return videoUrl;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Export failed";
        err("Run", runId, "Export failed", {
          message,
          name: error instanceof Error ? error.name : undefined,
          stack: error instanceof Error ? error.stack : undefined,
        });
        setState({ status: "error", progress: 0, error: message });
        throw error;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Share video for iOS "Save to Photos" via native share sheet
  const shareVideo = useCallback(async (url: string, filename = "video.mp4") => {
    if (!url) return false;

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: "video/mp4" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
        });
        return true;
      }
    } catch (e) {
      console.warn("[VideoExport] Sharing failed:", e);
    }
    return false;
  }, []);

  const downloadVideo = useCallback((url: string, filename = "video.mp4") => {
    if (!url) return;

    // FIX: Removed iOS-specific window.open workaround.
    // Modern iOS Safari supports standard download attributes better.
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
    shareVideo,
    reset,
  };
}
