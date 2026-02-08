import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  FolderArchive,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import JSZip from "jszip";

interface CinematicScene {
  number: number;
  voiceover: string;
  visualPrompt: string;
  videoUrl?: string;
  audioUrl?: string;
  duration: number;
}

interface CinematicResultProps {
  title: string;
  scenes: CinematicScene[];
  projectId?: string;
  generationId?: string;
  onNewProject: () => void;
}

export function CinematicResult({
  title,
  scenes,
  projectId,
  generationId,
  onNewProject,
}: CinematicResultProps) {
  const navigate = useNavigate();
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  
  // Dialogs
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [displayUrl, setDisplayUrl] = useState("");
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentScene = scenes[currentSceneIndex];
  const scenesWithVideo = scenes.filter((s) => s.videoUrl);

  const goToNextScene = () => {
    if (currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex(currentSceneIndex + 1);
      setSceneProgress(0);
    }
  };

  const goToPrevScene = () => {
    if (currentSceneIndex > 0) {
      setCurrentSceneIndex(currentSceneIndex - 1);
      setSceneProgress(0);
    }
  };

  // Play All functionality - plays video + audio synced
  const startPlayAll = async (startIndex: number) => {
    setIsPlayingAll(true);
    setCurrentSceneIndex(startIndex);
    setSceneProgress(0);

    const scene = scenes[startIndex];
    const video = videoRef.current;
    const audio = audioRef.current;

    if (video && scene?.videoUrl) {
      video.src = scene.videoUrl;
      video.muted = isMuted || !scene.audioUrl; // Mute video if we have separate audio
      video.load();
      
      if (audio && scene.audioUrl) {
        audio.src = scene.audioUrl;
        audio.muted = isMuted;
        audio.load();
      }

      try {
        await video.play();
        if (audio && scene.audioUrl) {
          await audio.play();
        }
      } catch (e) {
        console.error("Playback failed:", e);
        setIsPlayingAll(false);
      }
    }
  };

  const pausePlayAll = () => {
    videoRef.current?.pause();
    audioRef.current?.pause();
    setIsPlayingAll(false);
  };

  const resumePlayAll = async () => {
    try {
      await videoRef.current?.play();
      await audioRef.current?.play();
      setIsPlayingAll(true);
    } catch {
      // Restart from current scene
      await startPlayAll(currentSceneIndex);
    }
  };

  const stopPlayAll = () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    
    setIsPlayingAll(false);
    setSceneProgress(0);
  };

  const handleVideoEnded = async () => {
    const nextIndex = currentSceneIndex + 1;
    if (nextIndex >= scenes.length) {
      stopPlayAll();
      return;
    }
    await startPlayAll(nextIndex);
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (audioRef.current) {
      audioRef.current.muted = newMuted;
    }
    if (videoRef.current) {
      // Only unmute video if there's no separate audio track
      const scene = scenes[currentSceneIndex];
      videoRef.current.muted = newMuted || !!scene?.audioUrl;
    }
  };

  // Download all clips as ZIP
  const handleDownloadAll = async () => {
    if (scenesWithVideo.length === 0) return;
    
    setIsDownloadingAll(true);
    
    try {
      const zip = new JSZip();
      
      for (let i = 0; i < scenesWithVideo.length; i++) {
        const scene = scenesWithVideo[i];
        if (!scene.videoUrl) continue;
        
        const response = await fetch(scene.videoUrl);
        const blob = await response.blob();
        zip.file(`scene-${scene.number}.mp4`, blob);
        
        // Also include audio if available
        if (scene.audioUrl) {
          const audioResponse = await fetch(scene.audioUrl);
          const audioBlob = await audioResponse.blob();
          zip.file(`scene-${scene.number}-audio.wav`, audioBlob);
        }
      }
      
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, "_").slice(0, 30) || "cinematic"}-clips.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Download Complete", description: `${scenesWithVideo.length} clips downloaded` });
    } catch (error) {
      console.error("Download failed:", error);
      toast({ variant: "destructive", title: "Download Failed", description: "Please try again" });
    } finally {
      setIsDownloadingAll(false);
    }
  };

  // Share functionality
  const handleShare = async () => {
    if (!projectId) {
      toast({ title: "Cannot share", description: "Project must be saved first", variant: "destructive" });
      return;
    }

    setIsShareDialogOpen(true);
    setIsCreatingShare(true);
    setHasCopied(false);

    try {
      const { data: existingShare } = await supabase
        .from("project_shares")
        .select("share_token")
        .eq("project_id", projectId)
        .maybeSingle();

      let token = existingShare?.share_token;

      if (!token) {
        token = crypto.randomUUID();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { error } = await supabase.from("project_shares").insert({
          project_id: projectId,
          user_id: user.id,
          share_token: token,
        });
        if (error) throw error;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const metaUrl = `${supabaseUrl}/functions/v1/share-meta?token=${token}&v=${Date.now()}`;
      setShareUrl(metaUrl);
      setDisplayUrl(`https://motionmax.io/share/${token}`);
    } catch (error) {
      console.error("Failed to create share:", error);
      toast({ title: "Failed to create share link", description: "Please try again", variant: "destructive" });
      setIsShareDialogOpen(false);
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(displayUrl);
      setHasCopied(true);
      toast({ title: "Link copied!", description: "Share this link with anyone" });
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", description: "Please copy the link manually", variant: "destructive" });
    }
  };

  // Delete project
  const handleDelete = async () => {
    if (!projectId) return;
    setIsDeleting(true);

    try {
      await supabase.from("generations").delete().eq("project_id", projectId);
      await supabase.from("project_shares").delete().eq("project_id", projectId);
      await supabase.from("project_characters").delete().eq("project_id", projectId);
      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;

      navigate("/projects", { replace: true });
      toast({ title: "Project deleted", description: "Your project has been permanently deleted" });
    } catch (error) {
      console.error("Failed to delete project:", error);
      toast({ title: "Failed to delete", description: "Please try again", variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  // Sync scene change with playback
  useEffect(() => {
    setSceneProgress(0);
  }, [currentSceneIndex]);

  return (
    <div className="space-y-6">
      {/* Hidden media elements for playback */}
      <video
        ref={videoRef}
        onEnded={handleVideoEnded}
        onTimeUpdate={() => {
          const video = videoRef.current;
          if (!video) return;
          const dur = video.duration || currentScene?.duration || 1;
          setSceneProgress(Math.min(1, video.currentTime / dur));
        }}
        className="hidden"
        playsInline
      />
      <audio ref={audioRef} className="hidden" />

      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 text-green-500 text-sm font-medium mb-4">
          <Film className="h-4 w-4" />
          Complete - {scenesWithVideo.length} Clips Generated
        </div>
        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>

        {/* Playback Controls */}
        <div className="mt-4 flex items-center justify-center gap-2">
          {!isPlayingAll ? (
            <Button
              onClick={() => resumePlayAll()}
              className="gap-2 bg-amber-500 hover:bg-amber-600"
              disabled={scenesWithVideo.length === 0}
            >
              <Play className="h-4 w-4" />
              Play All
            </Button>
          ) : (
            <Button onClick={pausePlayAll} className="gap-2 bg-amber-500 hover:bg-amber-600">
              <Pause className="h-4 w-4" />
              Pause
            </Button>
          )}

          <Button variant="outline" onClick={stopPlayAll} className="gap-2" disabled={!isPlayingAll}>
            <Square className="h-4 w-4" />
            Stop
          </Button>

          <Button variant="outline" size="icon" onClick={toggleMute} className="h-10 w-10">
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Current Scene Preview */}
      <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="relative aspect-video bg-muted/50 flex items-center justify-center">
          {/* Progress bar */}
          <div className="absolute inset-x-0 top-0 z-10 h-1 bg-background/30">
            <div
              className="h-full bg-amber-500 transition-[width] duration-150"
              style={{ width: `${Math.round(sceneProgress * 100)}%` }}
            />
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {currentScene?.videoUrl ? (
              <motion.video
                key={currentScene.videoUrl}
                src={currentScene.videoUrl}
                className="w-full h-full object-cover"
                muted={isMuted || !!currentScene.audioUrl}
                playsInline
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                controls={!isPlayingAll}
              />
            ) : (
              <div className="text-center text-muted-foreground">
                <Film className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No video for Scene {currentScene?.number}</p>
              </div>
            )}
          </AnimatePresence>

          {/* Scene Navigation */}
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
                        ? "w-6 bg-amber-500"
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
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">Scene {currentScene?.number}</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{currentScene?.duration}s</span>
              {currentScene?.audioUrl && (
                <span className="inline-flex items-center gap-1 text-xs text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                  <Volume2 className="h-3 w-3" /> Audio
                </span>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{currentScene?.voiceover}</p>
        </div>
      </Card>

      {/* Scene Thumbnails */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {scenes.map((scene, idx) => (
          <button
            key={scene.number}
            onClick={() => setCurrentSceneIndex(idx)}
            className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
              idx === currentSceneIndex
                ? "border-amber-500 ring-2 ring-amber-500/30"
                : "border-transparent hover:border-border"
            }`}
          >
            {scene.videoUrl ? (
              <video src={scene.videoUrl} className="w-full h-full object-cover" muted playsInline />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <Film className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-xs py-0.5 text-center">
              {scene.number}
            </div>
          </button>
        ))}
      </div>

      {/* Action Bar */}
      <TooltipProvider delayDuration={300}>
        <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-3">
          <div className="flex items-center justify-center gap-2">
            {/* Download All */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={handleDownloadAll}
                  disabled={isDownloadingAll || scenesWithVideo.length === 0}
                  className="h-10 w-10 bg-amber-500 hover:bg-amber-600"
                >
                  {isDownloadingAll ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <FolderArchive className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download All Clips</TooltipContent>
            </Tooltip>

            {/* Share */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleShare}
                  disabled={!projectId}
                  className="h-10 w-10"
                >
                  <Link2 className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Share</TooltipContent>
            </Tooltip>

            {/* New Project */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={onNewProject} className="h-10 w-10">
                  <Plus className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New Project</TooltipContent>
            </Tooltip>

            {/* Delete */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsDeleteDialogOpen(true)}
                  disabled={!projectId}
                  className="h-10 w-10 text-muted-foreground hover:text-destructive hover:border-destructive/50"
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete Project</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>

      {/* Share Dialog */}
      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Cinematic</DialogTitle>
            <DialogDescription>
              Anyone with this link can view your cinematic video.
            </DialogDescription>
          </DialogHeader>

          {isCreatingShare ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input value={displayUrl} readOnly className="flex-1 text-sm" />
                <Button onClick={handleCopyLink} className="shrink-0">
                  {hasCopied ? "Copied!" : "Copy Link"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This link will remain active until you delete the project.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete Project"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
