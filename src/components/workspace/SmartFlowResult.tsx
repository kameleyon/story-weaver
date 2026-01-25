import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Download,
  FolderArchive,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Share2,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useVideoExport } from "@/hooks/useVideoExport";
import type { Scene } from "@/hooks/useGenerationPipeline";

interface SmartFlowResultProps {
  title: string;
  imageUrl: string;
  audioUrl?: string | null;
  script?: string | null;
  format: "landscape" | "portrait" | "square";
  audioDuration?: number;
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
  audioDuration,
  onNewProject,
  onEditImage,
  onEditAudio,
}: SmartFlowResultProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Video export hook
  const { state: exportState, exportVideo, downloadVideo, shareVideo, reset: resetExport } = useVideoExport();

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

  const handleDownloadImage = async () => {
    if (!imageUrl) return;
    setIsDownloadingImage(true);
    
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
      
      toast({ title: "Image downloaded!" });
    } catch (err) {
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setIsDownloadingImage(false);
    }
  };

  const handleExportVideo = async () => {
    // Create a single "scene" from the infographic data
    const scene: Scene = {
      number: 1,
      voiceover: script || "",
      visualPrompt: title, // Required by Scene interface
      imageUrl: imageUrl,
      audioUrl: audioUrl || undefined,
      duration: audioDuration || 30, // Default to 30s if no duration
    };
    
    try {
      await exportVideo([scene], format);
    } catch (err) {
      console.error("Video export error:", err);
    }
  };

  const safeName = title.replace(/[^a-z0-9]/gi, "_").slice(0, 50) || "infographic";

  return (
    <div className="space-y-8">
      {/* Hidden audio element with preload for better playback */}
      {hasAudio && (
        <audio
          ref={audioRef}
          src={audioUrl!}
          preload="auto"
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
              {audioDuration && (
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  ({Math.round(audioDuration)}s)
                </span>
              )}
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
                  preload="auto"
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

      {/* Export Progress Modal */}
      {exportState.status !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">
                {exportState.status === "error"
                  ? "Export Failed"
                  : exportState.status === "complete"
                  ? "Export Complete!"
                  : "Exporting Video..."}
              </h3>
              {(exportState.status === "error" || exportState.status === "complete") && (
                <Button variant="ghost" size="icon" onClick={resetExport}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {exportState.status === "error" ? (
              <>
                <p className="text-sm text-muted-foreground">{exportState.error}</p>
                <Button onClick={resetExport} variant="outline" className="w-full mt-4">
                  Close
                </Button>
              </>
            ) : exportState.status === "complete" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Your video is ready.
                </p>
                <div className="space-y-2">
                  <Button
                    className="w-full gap-2"
                    onClick={() => downloadVideo(exportState.videoUrl!, `${safeName}.mp4`)}
                  >
                    <Download className="h-4 w-4" />
                    Download to Files
                  </Button>
                  {typeof navigator !== "undefined" && navigator.canShare && (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => shareVideo(exportState.videoUrl!, `${safeName}.mp4`)}
                    >
                      <Share2 className="h-4 w-4" />
                      Share / Save to Photos
                    </Button>
                  )}
                </div>
                <Button variant="ghost" onClick={resetExport} className="w-full">
                  Close
                </Button>
              </div>
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

                {exportState.warning && (
                  <p className="text-xs text-muted-foreground">{exportState.warning}</p>
                )}

                <p className="text-xs text-muted-foreground">
                  Please keep this tab open. The video is being rendered in your browser.
                </p>
              </>
            )}
          </Card>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Export Video Button (primary if audio exists) */}
        {hasAudio ? (
          exportState.status === "complete" && exportState.videoUrl ? (
            <>
              <Button
                className="flex-1 gap-2"
                onClick={() => downloadVideo(exportState.videoUrl!, `${safeName}.mp4`)}
              >
                <Download className="h-4 w-4" />
                Download Video
              </Button>
              {typeof navigator !== "undefined" && navigator.canShare && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => shareVideo(exportState.videoUrl!, `${safeName}.mp4`)}
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
              )}
            </>
          ) : (
            <Button
              className="flex-1 gap-2"
              onClick={handleExportVideo}
              disabled={
                exportState.status === "loading" ||
                exportState.status === "rendering" ||
                exportState.status === "encoding"
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
          )
        ) : null}

        {/* Download Image Button */}
        <Button
          variant={hasAudio ? "outline" : "default"}
          className={cn("gap-2", !hasAudio && "flex-1")}
          onClick={handleDownloadImage}
          disabled={isDownloadingImage}
        >
          {isDownloadingImage ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Downloading...
            </>
          ) : (
            <>
              <FolderArchive className="h-4 w-4" />
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
