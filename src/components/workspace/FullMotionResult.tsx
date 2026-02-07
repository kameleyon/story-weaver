import { useState } from "react";
import { Play, Pause, Download, RotateCcw, Film, Clock, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface FullMotionScene {
  number: number;
  voiceover: string;
  duration: number;
  videoUrl?: string;
  audioUrl?: string;
  thumbnailUrl?: string;
}

interface FullMotionResultProps {
  scenes: FullMotionScene[];
  projectTitle?: string;
  onNewProject: () => void;
}

export function FullMotionResult({ scenes, projectTitle, onNewProject }: FullMotionResultProps) {
  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const scene = scenes[currentScene];
  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration || 5), 0);

  const handlePrevScene = () => {
    if (currentScene > 0) setCurrentScene(currentScene - 1);
  };

  const handleNextScene = () => {
    if (currentScene < scenes.length - 1) setCurrentScene(currentScene + 1);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
          <Film className="h-3.5 w-3.5" />
          Full Motion Video
        </div>
        <h2 className="text-xl font-semibold text-foreground">
          {projectTitle || "Your Full Motion Video"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {scenes.length} scenes • ~{Math.round(totalDuration)}s total
        </p>
      </div>

      {/* Video Preview */}
      <div className="rounded-2xl border border-border/50 bg-card/50 overflow-hidden shadow-lg">
        {/* Video Player Area */}
        <div className="relative aspect-video bg-black flex items-center justify-center">
          {scene?.videoUrl ? (
            <video
              src={scene.videoUrl}
              className="w-full h-full object-cover"
              controls
              autoPlay={isPlaying}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/50">
              <Sparkles className="h-12 w-12 animate-pulse" />
              <span className="text-sm">Video generating...</span>
            </div>
          )}

          {/* Scene Navigation Overlay */}
          {scenes.length > 1 && (
            <>
              <button
                onClick={handlePrevScene}
                disabled={currentScene === 0}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white disabled:opacity-30 hover:bg-black/70 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={handleNextScene}
                disabled={currentScene === scenes.length - 1}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white disabled:opacity-30 hover:bg-black/70 transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {/* Scene Indicator */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/50 text-white text-xs font-medium">
            Scene {currentScene + 1} of {scenes.length}
          </div>
        </div>

        {/* Scene Info */}
        <div className="p-4 border-t border-border/30">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h4 className="text-sm font-medium text-foreground mb-1">Scene {scene?.number}</h4>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {scene?.voiceover || "No voiceover text"}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{scene?.duration || 5}s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scene Thumbnails */}
      {scenes.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {scenes.map((s, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentScene(idx)}
              className={`flex-shrink-0 w-24 rounded-lg overflow-hidden border-2 transition-all ${
                idx === currentScene
                  ? "border-primary shadow-md"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <div className="aspect-video bg-muted flex items-center justify-center">
                {s.thumbnailUrl ? (
                  <img src={s.thumbnailUrl} alt={`Scene ${s.number}`} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-muted-foreground">{s.number}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" onClick={onNewProject} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          New Project
        </Button>
        <Button className="gap-2" disabled>
          <Download className="h-4 w-4" />
          Export Video
        </Button>
      </div>
    </motion.div>
  );
}
