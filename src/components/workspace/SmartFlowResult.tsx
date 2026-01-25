import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface SmartFlowResultProps {
  title: string;
  imageUrl: string;
  audioUrl?: string | null;
  script?: string | null;
  format: "landscape" | "portrait" | "square";
  onNewProject: () => void;
  onEditImage: () => void;
  onEditAudio: () => void;
}

export function SmartFlowResult({
  title,
  imageUrl,
  audioUrl,
  script,
  format,
  onNewProject,
  onEditImage,
  onEditAudio,
}: SmartFlowResultProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const hasAudio = !!audioUrl;

  const aspectClass =
    format === "portrait" ? "aspect-[9/16]" : format === "square" ? "aspect-square" : "aspect-video";

  const handlePlay = async () => {
    if (!audioRef.current || !hasAudio) return;
    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (err) {
      console.error("Audio play error:", err);
    }
  };

  const handlePause = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setIsPlaying(false);
  };

  const handleStop = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setAudioProgress(0);
  };

  const handleDownload = async () => {
    if (!imageUrl) return;
    setIsDownloading(true);
    
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, "_").slice(0, 50) || "infographic"}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Download started!" });
    } catch (err) {
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hidden audio element */}
      {hasAudio && (
        <audio
          ref={audioRef}
          src={audioUrl!}
          onEnded={() => {
            setIsPlaying(false);
            setAudioProgress(0);
          }}
          onTimeUpdate={() => {
            const el = audioRef.current;
            if (!el) return;
            const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 1;
            setAudioProgress(el.currentTime / dur);
          }}
          className="hidden"
        />
      )}

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
        <p className="text-muted-foreground mt-1">
          1 infographic • {hasAudio ? "with narration" : "no narration"}
        </p>

        <div className="mt-4 flex items-center justify-center gap-2">
          {!isPlaying ? (
            <Button
              onClick={handlePlay}
              className="gap-2"
              disabled={!hasAudio}
            >
              <Play className="h-4 w-4" />
              Play Preview
            </Button>
          ) : (
            <Button onClick={handlePause} className="gap-2">
              <Pause className="h-4 w-4" />
              Pause
            </Button>
          )}

          <Button variant="outline" onClick={handleStop} className="gap-2" disabled={!isPlaying}>
            <Square className="h-4 w-4" />
            Stop
          </Button>
        </div>
      </div>

      {/* Image Preview */}
      <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
        <div className={cn("relative bg-muted/50 flex items-center justify-center", aspectClass)}>
          {/* Progress bar at top */}
          {hasAudio && (
            <div className="absolute inset-x-0 top-0 z-10 h-1 bg-background/30">
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{ width: `${Math.round(audioProgress * 100)}%` }}
              />
            </div>
          )}

          <motion.img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          />

          {/* Edit overlay on hover */}
          <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button 
              onClick={onEditImage}
              className="bg-primary hover:bg-primary/90 gap-2"
            >
              <Pencil className="h-4 w-4" />
              Edit Image
            </Button>
          </div>
        </div>

        {/* Scene Details */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">
              Infographic
            </h3>
            <Button
              size="sm"
              onClick={onEditImage}
              className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
          
          {/* Narration section */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              {hasAudio ? (
                <Volume2 className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground/50 mt-1 shrink-0" />
              )}
              <p className={cn(
                "text-sm leading-relaxed",
                hasAudio ? "text-muted-foreground" : "text-muted-foreground/50 italic"
              )}>
                {script || (hasAudio ? "No script available" : "No narration generated")}
              </p>
            </div>

            {/* Audio player or grayed out placeholder */}
            {hasAudio ? (
              <div className="flex items-center gap-2">
                <audio
                  controls
                  preload="none"
                  src={audioUrl!}
                  className="w-full flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onEditAudio}
                  className="h-8 w-8 shrink-0"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 opacity-50">
                <div className="flex-1 h-10 rounded-md bg-muted/50 border border-border/30 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">No audio</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          className="flex-1 gap-2"
          onClick={handleDownload}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Downloading...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Download Image
            </>
          )}
        </Button>
        <Button variant="outline" onClick={onNewProject} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Another
        </Button>
      </div>
    </div>
  );
}
