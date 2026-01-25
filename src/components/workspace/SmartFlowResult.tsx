import { useState } from "react";
import { Plus, Download, Copy, Check, Play, Pause, Volume2 } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VideoFormat } from "./FormatSelector";
import type { Scene, CostTracking } from "@/hooks/useGenerationPipeline";

interface SmartFlowResultProps {
  title: string;
  scenes: Scene[];
  format: VideoFormat;
  enableVoice: boolean;
  onNewProject: () => void;
  totalTimeMs?: number;
  costTracking?: CostTracking;
  generationId?: string;
  projectId?: string;
}

export function SmartFlowResult({
  title,
  scenes,
  format,
  enableVoice,
  onNewProject,
  totalTimeMs,
  costTracking,
}: SmartFlowResultProps) {
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Get the single scene (Smart Flow always has 1 scene)
  const scene = scenes[0];
  
  if (!scene) {
    return null;
  }

  const aspectRatioClass = format === "portrait" 
    ? "aspect-[9/16]" 
    : format === "square" 
    ? "aspect-square" 
    : "aspect-video";

  const handleCopyScript = async () => {
    if (scene.voiceover) {
      await navigator.clipboard.writeText(scene.voiceover);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadImage = () => {
    if (scene.imageUrl) {
      const link = document.createElement("a");
      link.href = scene.imageUrl;
      link.download = `${title.replace(/\s+/g, "-").toLowerCase()}-infographic.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handlePlayAudio = () => {
    if (!scene.audioUrl) return;

    if (audioElement) {
      if (isPlaying) {
        audioElement.pause();
        setIsPlaying(false);
      } else {
        audioElement.play();
        setIsPlaying(true);
      }
    } else {
      const audio = new Audio(scene.audioUrl);
      audio.onended = () => setIsPlaying(false);
      audio.play();
      setAudioElement(audio);
      setIsPlaying(true);
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">{title}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            {totalTimeMs && (
              <span>Generated in {formatTime(totalTimeMs)}</span>
            )}
            {costTracking && (
              <>
                <span>•</span>
                <span>1 credit used</span>
              </>
            )}
          </div>
        </div>
        <Button onClick={onNewProject} variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          New Infographic
        </Button>
      </div>

      {/* Main Content Grid */}
      <div className={cn(
        "grid gap-6",
        enableVoice ? "lg:grid-cols-2" : "lg:grid-cols-1"
      )}>
        {/* Infographic Preview */}
        <div className="space-y-4">
          <div className={cn(
            "relative overflow-hidden rounded-2xl border border-border/50 bg-muted/30",
            aspectRatioClass,
            format === "portrait" ? "max-w-sm mx-auto" : "w-full"
          )}>
            {scene.imageUrl ? (
              <img
                src={scene.imageUrl}
                alt={title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-muted-foreground">Loading image...</span>
              </div>
            )}
          </div>

          {/* Image Actions */}
          <div className="flex gap-2 justify-center">
            <Button onClick={handleDownloadImage} variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Download Image
            </Button>
          </div>
        </div>

        {/* Script & Audio Section */}
        <div className="space-y-4">
          {/* Audio Player (if voice enabled) */}
          {enableVoice && scene.audioUrl && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-border/50 bg-card/50 p-4"
            >
              <div className="flex items-center gap-4">
                <Button
                  onClick={handlePlayAudio}
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-full"
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5 ml-0.5" />
                  )}
                </Button>
                <div className="flex-1">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-primary" />
                    Audio Narration
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {scene.duration ? `${Math.ceil(scene.duration)}s` : "Listen to the presentation"}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Script Text */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                {enableVoice ? "Narration Script" : "Generated Script"}
              </h3>
              <Button
                onClick={handleCopyScript}
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/30 p-4 max-h-[400px] overflow-y-auto">
              <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {scene.voiceover}
              </p>
            </div>
          </div>

          {/* Export Video (if voice enabled) */}
          {enableVoice && scene.audioUrl && (
            <Button className="w-full gap-2" size="lg">
              <Download className="h-4 w-4" />
              Export Video
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
