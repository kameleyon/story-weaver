import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Pause,
  Play,
  Plus,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Scene } from "@/hooks/useGenerationPipeline";
import { useVideoExport } from "@/hooks/useVideoExport";

interface GenerationResultProps {
  title: string;
  scenes: Scene[];
  onNewProject: () => void;
}

export function GenerationResult({ title, scenes, onNewProject }: GenerationResultProps) {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [sceneProgress, setSceneProgress] = useState(0);
  const playAllAudioRef = useRef<HTMLAudioElement | null>(null);

  const { state: exportState, exportVideo, downloadVideo, reset: resetExport } = useVideoExport();

  const currentScene = scenes[currentSceneIndex];

  const goToNextScene = () => {
    if (currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex(currentSceneIndex + 1);
    }
  };

  const goToPrevScene = () => {
    if (currentSceneIndex > 0) {
      setCurrentSceneIndex(currentSceneIndex - 1);
    }
  };

  const stopPlayAll = () => {
    const el = playAllAudioRef.current;
    setIsPlayingAll(false);
    setSceneProgress(0);
    if (el) {
      el.pause();
      el.currentTime = 0;
      // Clearing src stops downloads and prevents replay glitches
      el.removeAttribute("src");
      el.load();
    }
  };

  const playSceneAudio = async (index: number) => {
    const el = playAllAudioRef.current;
    const scene = scenes[index];
    if (!el) return;

    setSceneProgress(0);
    setCurrentSceneIndex(index);

    if (!scene?.audioUrl) {
      // No audio for this scene: advance immediately.
      handlePlayAllEnded(index);
      return;
    }

    try {
      el.src = scene.audioUrl;
      await el.play();
    } catch {
      // Autoplay policies can block; user interaction should allow this, but fall back gracefully.
      handlePlayAllEnded(index);
    }
  };

  const startPlayAll = async (startIndex: number) => {
    setIsPlayingAll(true);
    await playSceneAudio(startIndex);
  };

  const pausePlayAll = () => {
    const el = playAllAudioRef.current;
    if (el) el.pause();
    setIsPlayingAll(false);
  };

  const resumePlayAll = async () => {
    const el = playAllAudioRef.current;
    if (!el) return;

    // If we have an active audio source, resume; otherwise start from the current scene.
    const hasActiveSrc = !!el.getAttribute("src");
    const hasProgress = Number.isFinite(el.currentTime) && el.currentTime > 0;

    if (hasActiveSrc && hasProgress) {
      try {
        await el.play();
        setIsPlayingAll(true);
        return;
      } catch {
        // fall through to restart
      }
    }

    await startPlayAll(currentSceneIndex);
  };

  const handlePlayAllEnded = async (endedIndex?: number) => {
    const idx = typeof endedIndex === "number" ? endedIndex : currentSceneIndex;
    const nextIndex = idx + 1;

    if (nextIndex >= scenes.length) {
      stopPlayAll();
      return;
    }

    await playSceneAudio(nextIndex);
  };

  useEffect(() => {
    setSceneProgress(0);
  }, [currentSceneIndex]);

  useEffect(() => {
    return () => stopPlayAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <div className="space-y-8">
      <audio
        ref={playAllAudioRef}
        onEnded={() => handlePlayAllEnded()}
        onLoadedMetadata={() => {
          const el = playAllAudioRef.current;
          if (!el) return;
          const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : currentScene?.duration ?? 0;
          setSceneProgress(dur > 0 ? Math.min(1, el.currentTime / dur) : 0);
        }}
        onTimeUpdate={() => {
          const el = playAllAudioRef.current;
          if (!el) return;
          const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : currentScene?.duration ?? 0;
          setSceneProgress(dur > 0 ? Math.min(1, el.currentTime / dur) : 0);
        }}
        className="hidden"
      />

      {/* Header */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 mb-4"
        >
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium text-primary">Generation Complete</span>
        </motion.div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-muted-foreground mt-1">{scenes.length} scenes generated</p>

        <div className="mt-4 flex items-center justify-center gap-2">
          {!isPlayingAll ? (
            <Button
              onClick={resumePlayAll}
              className="gap-2"
              disabled={!scenes.some((s) => !!s.audioUrl)}
            >
              <Play className="h-4 w-4" />
              Play Preview
            </Button>
          ) : (
            <Button onClick={pausePlayAll} className="gap-2">
              <Pause className="h-4 w-4" />
              Pause
            </Button>
          )}

          <Button variant="outline" onClick={stopPlayAll} className="gap-2" disabled={!isPlayingAll}>
            <Square className="h-4 w-4" />
            Stop
          </Button>
        </div>
      </div>

      {/* Scene Preview */}
      <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
        {/* Image Preview */}
        <div className="relative aspect-video bg-muted/50 flex items-center justify-center">
          <div className="absolute inset-x-0 top-0 z-10 h-1 bg-background/30">
            <div
              className="h-full bg-primary transition-[width] duration-150"
              style={{ width: `${Math.round(sceneProgress * 100)}%` }}
            />
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {currentScene?.imageUrl ? (
              <motion.img
                key={currentScene.imageUrl}
                src={currentScene.imageUrl}
                alt={`Scene ${currentScene.number}`}
                loading="lazy"
                className="w-full h-full object-cover"
                initial={{ opacity: 0, scale: 1 }}
                animate={{
                  opacity: 1,
                  scale: isPlayingAll ? 1.06 : 1,
                }}
                exit={{ opacity: 0 }}
                transition={{
                  opacity: { duration: 0.35, ease: "easeOut" },
                  scale: { duration: Math.max(1, currentScene?.duration ?? 6), ease: "linear" },
                }}
              />
            ) : (
              <motion.div
                key={`placeholder-${currentScene?.number ?? "none"}`}
                className="text-center text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Play className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Scene {currentScene?.number} preview</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scene Navigation Overlay */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={goToPrevScene}
                disabled={currentSceneIndex === 0}
                className="text-white hover:bg-white/20 disabled:opacity-30"
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              
              <div className="flex items-center gap-2">
                {scenes.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSceneIndex(idx)}
                    className={`h-2 rounded-full transition-all ${
                      idx === currentSceneIndex
                        ? "w-6 bg-white"
                        : "w-2 bg-white/40 hover:bg-white/60"
                    }`}
                  />
                ))}
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={goToNextScene}
                disabled={currentSceneIndex === scenes.length - 1}
                className="text-white hover:bg-white/20 disabled:opacity-30"
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </div>
          </div>
        </div>

        {/* Scene Details */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">Scene {currentScene?.number}</h3>
            <span className="text-sm text-muted-foreground">{currentScene?.duration}s</span>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Volume2 className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                {currentScene?.voiceover}
              </p>
            </div>

            {currentScene?.audioUrl ? (
              <audio
                key={currentScene.audioUrl}
                controls
                preload="none"
                src={currentScene.audioUrl}
                className="w-full"
              />
            ) : null}
          </div>
        </div>
      </Card>

      {/* All Scenes Grid */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-foreground">All Scenes</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {scenes.map((scene, idx) => (
            <button
              key={scene.number}
              onClick={() => setCurrentSceneIndex(idx)}
              className={`relative aspect-video rounded-lg overflow-hidden border transition-all ${
                idx === currentSceneIndex
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border/50 hover:border-border"
              }`}
            >
              {scene.imageUrl ? (
                <img
                  src={scene.imageUrl}
                  alt={`Scene ${scene.number}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-muted/50 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">Scene {scene.number}</span>
                </div>
              )}
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-xs text-white">
                {scene.duration}s
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Export Progress Modal */}
      {exportState.status !== "idle" && exportState.status !== "complete" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">
                {exportState.status === "error" ? "Export Failed" : "Exporting Video..."}
              </h3>
              {exportState.status === "error" && (
                <Button variant="ghost" size="icon" onClick={resetExport}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {exportState.status === "error" ? (
              <p className="text-sm text-destructive">{exportState.error}</p>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>
                      {exportState.status === "loading" && "Loading assets..."}
                      {exportState.status === "rendering" && "Rendering video..."}
                      {exportState.status === "encoding" && "Encoding..."}
                    </span>
                    <span>{exportState.progress}%</span>
                  </div>
                  <Progress value={exportState.progress} className="h-2" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Please keep this tab open. The video is being rendered in your browser.
                </p>
              </>
            )}

            {exportState.status === "error" && (
              <Button onClick={resetExport} variant="outline" className="w-full">
                Close
              </Button>
            )}
          </Card>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        {exportState.status === "complete" && exportState.videoUrl ? (
          <Button
            className="flex-1 gap-2"
            onClick={() => {
              const safeName = title.replace(/[^a-z0-9]/gi, "_").slice(0, 50) || "video";
              downloadVideo(exportState.videoUrl!, `${safeName}.mp4`);
            }}
          >
            <Download className="h-4 w-4" />
            Download Video
          </Button>
        ) : (
          <Button
            className="flex-1 gap-2"
            onClick={() => exportVideo(scenes, "landscape")}
            disabled={
              exportState.status === "loading" ||
              exportState.status === "rendering" ||
              exportState.status === "encoding" ||
              !scenes.some((s) => !!s.imageUrl)
            }
          >
            {exportState.status !== "idle" && exportState.status !== "complete" && exportState.status !== "error" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export Video
              </>
            )}
          </Button>
        )}
        <Button variant="outline" onClick={onNewProject} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Another
        </Button>
      </div>
    </div>
  );
}