import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

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
  Share2,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import { Textarea } from "@/components/ui/textarea";
import { useCinematicExport } from "@/hooks/useCinematicExport";
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
  finalVideoUrl?: string;
  onNewProject: () => void;
  format?: "landscape" | "portrait" | "square";
}

type RegenType = "audio" | "video";

function safeFileBase(name: string) {
  return name.replace(/[^a-z0-9]/gi, "_").slice(0, 50) || "cinematic";
}

async function waitForCanPlay(el: HTMLMediaElement, timeoutMs = 8000) {
  if (el.readyState >= 3) return;

  await new Promise<void>((resolve, reject) => {
    const to = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for media to load"));
    }, timeoutMs);

    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Media failed to load"));
    };

    const cleanup = () => {
      window.clearTimeout(to);
      el.removeEventListener("canplay", onReady);
      el.removeEventListener("canplaythrough", onReady);
      el.removeEventListener("loadeddata", onReady);
      el.removeEventListener("error", onError);
    };

    el.addEventListener("canplay", onReady, { once: true });
    el.addEventListener("canplaythrough", onReady, { once: true });
    el.addEventListener("loadeddata", onReady, { once: true });
    el.addEventListener("error", onError, { once: true });
  });
}

export function CinematicResult({
  title,
  scenes,
  projectId,
  generationId,
  finalVideoUrl,
  onNewProject,
  format = "landscape",
}: CinematicResultProps) {
  const navigate = useNavigate();

  // Compute aspect ratio class from format (and keep preview usable on small screens)
  const aspectClass =
    format === "portrait"
      ? "aspect-[9/16] max-h-[75vh]"
      : format === "square"
        ? "aspect-square max-h-[75vh]"
        : "aspect-video";

  const [localScenes, setLocalScenes] = useState<CinematicScene[]>(scenes);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Download states
  const [isDownloadingClipsZip, setIsDownloadingClipsZip] = useState(false);

  // Export hook for combining all scenes
  const { 
    state: exportState, 
    exportVideo, 
    downloadVideo: downloadExportedVideo, 
    shareVideo, 
    reset: resetExport 
  } = useCinematicExport();

  // Edit dialog
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editVoiceover, setEditVoiceover] = useState("");
  const [editVisualPrompt, setEditVisualPrompt] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Regeneration
  const [isRegenerating, setIsRegenerating] = useState<{
    sceneIndex: number;
    type: RegenType;
  } | null>(null);

  // Share/delete dialogs
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [displayUrl, setDisplayUrl] = useState("");
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  // Media refs
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playRunIdRef = useRef(0);
  const restartRef = useRef(true);
  const advancedFromSceneRef = useRef<number | null>(null);

  // Keep local scenes synced with props
  useEffect(() => {
    setLocalScenes(scenes);
  }, [scenes]);

  const currentScene = localScenes[currentSceneIndex];

  const scenesWithVideo = useMemo(
    () => localScenes.filter((s) => !!s.videoUrl),
    [localScenes]
  );

  const goToNextScene = () => {
    if (currentSceneIndex < localScenes.length - 1) {
      setCurrentSceneIndex((i) => i + 1);
      setSceneProgress(0);
    }
  };

  const goToPrevScene = () => {
    if (currentSceneIndex > 0) {
      setCurrentSceneIndex((i) => i - 1);
      setSceneProgress(0);
    }
  };

  const stop = useCallback(() => {
    const v = previewVideoRef.current;
    const a = audioRef.current;

    if (v) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        // ignore
      }
    }

    if (a) {
      a.pause();
      try {
        a.currentTime = 0;
      } catch {
        // ignore
      }
      a.removeAttribute("src");
      a.load();
    }

    setIsPlayingAll(false);
    setSceneProgress(0);
    restartRef.current = true;
    advancedFromSceneRef.current = null;
  }, []);

  const startPlayAll = useCallback(
    (startIndex: number) => {
      const scene = localScenes[startIndex];
      if (!scene?.videoUrl) {
        toast({
          variant: "destructive",
          title: "No video",
          description: "This scene has no clip to play.",
        });
        return;
      }

      restartRef.current = true;
      advancedFromSceneRef.current = null;
      setSceneProgress(0);
      setCurrentSceneIndex(startIndex);
      setIsPlayingAll(true);
    },
    [localScenes]
  );

  const pause = useCallback(() => {
    previewVideoRef.current?.pause();
    audioRef.current?.pause();
    setIsPlayingAll(false);
  }, []);

  const resume = useCallback(() => {
    if (!currentScene?.videoUrl) return;
    restartRef.current = false;
    setIsPlayingAll(true);
  }, [currentScene?.videoUrl]);

  const toggleMute = useCallback(() => {
    setIsMuted((m) => {
      const next = !m;
      if (audioRef.current) audioRef.current.muted = next;
      return next;
    });
  }, []);

  // Core play loop: whenever isPlayingAll or currentSceneIndex changes, play the visible video + narration audio.
  useEffect(() => {
    if (!isPlayingAll) return;

    const scene = localScenes[currentSceneIndex];
    const video = previewVideoRef.current;
    const audio = audioRef.current;

    if (!scene?.videoUrl || !video) {
      setIsPlayingAll(false);
      return;
    }

    const runId = ++playRunIdRef.current;
    const shouldRestart = restartRef.current;
    restartRef.current = false;

    const run = async () => {
      // Always keep clip muted — narration is a separate audio track.
      video.muted = true;
      video.playsInline = true;

      // Ensure the element is really on the right source.
      if (!video.currentSrc || !video.currentSrc.includes(scene.videoUrl)) {
        video.src = scene.videoUrl;
        video.load();
      }

      if (shouldRestart) {
        try {
          video.currentTime = 0;
        } catch {
          // ignore
        }
      }

      if (audio) {
        if (scene.audioUrl) {
          if (audio.src !== scene.audioUrl) {
            audio.src = scene.audioUrl;
            audio.load();
          }
          audio.muted = isMuted;
          if (shouldRestart) {
            try {
              audio.currentTime = 0;
            } catch {
              // ignore
            }
          }
        } else {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
      }

      try {
        await waitForCanPlay(video);
        if (runId !== playRunIdRef.current) return;

        await video.play();

        if (audio && scene.audioUrl) {
          try {
            await waitForCanPlay(audio);
            if (runId !== playRunIdRef.current) return;
            await audio.play();
          } catch {
            // If audio fails, keep video going.
          }
        }
      } catch (e) {
        console.error("[CinematicResult] Playback failed", e);
        if (runId !== playRunIdRef.current) return;
        setIsPlayingAll(false);
        toast({
          variant: "destructive",
          title: "Playback blocked",
          description: "Tap Play again to start playback.",
        });
      }
    };

    void run();
  }, [isPlayingAll, currentSceneIndex, isMuted, localScenes]);

  const advanceToNextScene = useCallback(() => {
    if (!isPlayingAll) return;

    // Prevent double-advance when both audio + video fire `ended`.
    if (advancedFromSceneRef.current === currentSceneIndex) return;
    advancedFromSceneRef.current = currentSceneIndex;

    const nextIndex = currentSceneIndex + 1;
    if (nextIndex >= localScenes.length) {
      stop();
      return;
    }

    restartRef.current = true;
    setSceneProgress(0);
    setCurrentSceneIndex(nextIndex);
  }, [currentSceneIndex, isPlayingAll, localScenes.length, stop]);

  const handleVideoEnded = useCallback(() => {
    advanceToNextScene();
  }, [advanceToNextScene]);

  const handleAudioEnded = useCallback(() => {
    advanceToNextScene();
  }, [advanceToNextScene]);

  const handleVideoTimeUpdate = useCallback(() => {
    if (!isPlayingAll) return;

    const video = previewVideoRef.current;
    if (!video) return;

    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : currentScene?.duration || 1;
    setSceneProgress(Math.min(1, (video.currentTime || 0) / dur));
  }, [currentScene?.duration, isPlayingAll]);

  // ===== Downloads =====
  const downloadFromUrl = useCallback(async (url: string, filename: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }, []);


  const handleDownloadClipsZip = useCallback(async () => {
    if (scenesWithVideo.length === 0) return;

    setIsDownloadingClipsZip(true);
    try {
      const zip = new JSZip();

      for (const scene of scenesWithVideo) {
        if (!scene.videoUrl) continue;
        const videoResp = await fetch(scene.videoUrl);
        if (videoResp.ok) {
          zip.file(`scene-${scene.number}.mp4`, await videoResp.blob());
        }

        if (scene.audioUrl) {
          const audioResp = await fetch(scene.audioUrl);
          if (audioResp.ok) {
            zip.file(`scene-${scene.number}-audio.wav`, await audioResp.blob());
          }
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeFileBase(title)}-clips.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Download complete", description: "Clips ZIP downloaded." });
    } catch (e) {
      console.error("Clips ZIP download failed", e);
      toast({ variant: "destructive", title: "Download failed", description: "Please try again." });
    } finally {
      setIsDownloadingClipsZip(false);
    }
  }, [scenesWithVideo, title]);

  // ===== Share =====
  const handleShare = useCallback(async () => {
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
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { error } = await supabase.from("project_shares").insert({
          project_id: projectId,
          user_id: user.id,
          share_token: token,
        });
        if (error) throw error;
      }

      const display = `${window.location.origin}/share/${token}`;
      // Copy/share this URL (it actually resolves inside this app)
      setShareUrl(display);
      setDisplayUrl(display);
    } catch (e) {
      console.error("Failed to create share", e);
      toast({ title: "Failed to create share link", description: "Please try again", variant: "destructive" });
      setIsShareDialogOpen(false);
    } finally {
      setIsCreatingShare(false);
    }
  }, [projectId]);

  const handleCopyLink = useCallback(async () => {
    try {
      const text = displayUrl;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Mobile Safari fallback
        window.prompt("Copy link:", text);
      }
      setHasCopied(true);
      toast({ title: "Link copied!", description: "Share this link with anyone" });
      window.setTimeout(() => setHasCopied(false), 2000);
    } catch {
      window.prompt("Copy link:", displayUrl);
    }
  }, [displayUrl]);

  // ===== Delete =====
  const handleDelete = useCallback(async () => {
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
    } catch (e) {
      console.error("Delete failed", e);
      toast({ title: "Failed to delete", description: "Please try again", variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  }, [navigate, projectId]);

  // ===== Edit / Regenerate =====
  const openEdit = useCallback(() => {
    const s = currentScene;
    if (!s) return;
    setEditVoiceover(s.voiceover ?? "");
    setEditVisualPrompt(s.visualPrompt ?? "");
    setIsEditOpen(true);
  }, [currentScene]);

  const persistScenes = useCallback(
    async (nextScenes: CinematicScene[]) => {
      if (!generationId) return;
      const { error } = await supabase.from("generations").update({ scenes: nextScenes as any }).eq("id", generationId);
      if (error) throw error;
    },
    [generationId]
  );

  const saveEdit = useCallback(async () => {
    if (!currentScene) return;

    setIsSavingEdit(true);
    try {
      const nextScenes = localScenes.map((s, idx) =>
        idx === currentSceneIndex
          ? {
              ...s,
              voiceover: editVoiceover,
              visualPrompt: editVisualPrompt,
            }
          : s
      );

      setLocalScenes(nextScenes);
      await persistScenes(nextScenes);

      toast({ title: "Saved", description: "Scene updated." });
      setIsEditOpen(false);
    } catch (e) {
      console.error("Save edit failed", e);
      toast({ variant: "destructive", title: "Save failed", description: "Please try again." });
    } finally {
      setIsSavingEdit(false);
    }
  }, [currentScene, currentSceneIndex, editVoiceover, editVisualPrompt, localScenes, persistScenes]);

  const regenerateScene = useCallback(
    async (idx: number, type: RegenType) => {
      if (!projectId || !generationId) {
        toast({ variant: "destructive", title: "Cannot regenerate", description: "Missing project info." });
        return;
      }

      stop();
      setIsRegenerating({ sceneIndex: idx, type });

      const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

      try {
        while (true) {
          const { data, error } = await supabase.functions.invoke("generate-cinematic", {
            body: {
              phase: type,
              projectId,
              generationId,
              sceneIndex: idx,
            },
          });

          if (error) throw new Error(error.message);
          if (!data?.success) throw new Error(data?.error || "Regeneration failed");

          const nextScene = data.scene as Partial<CinematicScene>;

          setLocalScenes((prev) => {
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...nextScene };
            return copy;
          });

          if (data.status === "complete") break;
          await sleep(type === "audio" ? 1200 : 2000);
        }

        toast({ title: "Updated", description: `Scene ${idx + 1} regenerated.` });
      } catch (e) {
        console.error("Regenerate failed", e);
        toast({ variant: "destructive", title: "Regenerate failed", description: "Please try again." });
      } finally {
        setIsRegenerating(null);
      }
    },
    [generationId, projectId, stop]
  );

  const canEdit = !!generationId;
  const regenBusy = isRegenerating?.sceneIndex === currentSceneIndex;

  return (
    <div className="space-y-6">
      <audio ref={audioRef} className="hidden" preload="auto" onEnded={handleAudioEnded} />

      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
          <Film className="h-4 w-4" />
          Complete • {scenesWithVideo.length} clips
        </div>

        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>

        {/* Playback Controls */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {!isPlayingAll ? (
            <Button onClick={() => startPlayAll(currentSceneIndex)} className="gap-2" disabled={!currentScene?.videoUrl}>
              <Play className="h-4 w-4" />
              Play All
            </Button>
          ) : (
            <Button onClick={pause} className="gap-2">
              <Pause className="h-4 w-4" />
              Pause
            </Button>
          )}

          <Button variant="outline" onClick={resume} className="gap-2" disabled={isPlayingAll || !currentScene?.videoUrl}>
            <Play className="h-4 w-4" />
            Resume
          </Button>

          <Button variant="outline" onClick={stop} className="gap-2" disabled={!isPlayingAll}>
            <Square className="h-4 w-4" />
            Stop
          </Button>

          <Button variant="outline" size="icon" onClick={toggleMute} className="h-10 w-10" title={isMuted ? "Unmute narration" : "Mute narration"}>
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Current Scene Preview */}
      <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm max-w-3xl mx-auto">
        <div className={`relative ${aspectClass} w-full bg-muted/50 flex items-center justify-center`}>
          {/* Progress bar */}
          <div className="absolute inset-x-0 top-0 z-10 h-1 bg-background/30">
            <div
              className="h-full bg-primary transition-[width] duration-150"
              style={{ width: `${Math.round(sceneProgress * 100)}%` }}
            />
          </div>

          {currentScene?.videoUrl ? (
            <video
              key={currentScene.videoUrl}
              ref={previewVideoRef}
              src={currentScene.videoUrl}
              className="w-full h-full object-contain bg-black"
              muted
              playsInline
              autoPlay={false}
              loop={false}
              controls={!isPlayingAll}
              onEnded={handleVideoEnded}
              onTimeUpdate={handleVideoTimeUpdate}
              onError={() => {
                toast({
                  variant: "destructive",
                  title: "Clip failed to load",
                  description: `Scene ${currentScene.number} couldn’t be played. Try switching scenes or re-generating that clip.`,
                });
              }}
              preload="auto"
            />
          ) : (
            <div className="text-center text-muted-foreground">
              <Film className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No video for Scene {currentScene?.number}</p>
            </div>
          )}

          {/* Scene Navigation */}

          {/* Scene Navigation */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 to-transparent p-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={goToPrevScene}
                disabled={currentSceneIndex === 0}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>

              <div className="flex items-center gap-2">
                {localScenes.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSceneIndex(idx)}
                    className={`h-2 rounded-full transition-all ${
                      idx === currentSceneIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/40 hover:bg-muted-foreground/60"
                    }`}
                    aria-label={`Go to scene ${idx + 1}`}
                  />
                ))}
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={goToNextScene}
                disabled={currentSceneIndex === localScenes.length - 1}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </div>
          </div>
        </div>

        {/* Scene Details */}
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium text-foreground">Scene {currentScene?.number}</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{currentScene?.duration}s</span>
              {currentScene?.audioUrl ? (
                <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  <Volume2 className="h-3 w-3" /> Audio
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">No audio</span>
              )}
            </div>
          </div>

          <p className="text-sm text-muted-foreground line-clamp-2">{currentScene?.voiceover}</p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openEdit}
              disabled={!canEdit || isSavingEdit}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => regenerateScene(currentSceneIndex, "audio")}
              disabled={!projectId || !generationId || !!isRegenerating}
              className="gap-1.5"
            >
              {regenBusy && isRegenerating?.type === "audio" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Regenerate audio
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => regenerateScene(currentSceneIndex, "video")}
              disabled={!projectId || !generationId || !!isRegenerating}
              className="gap-1.5"
            >
              {regenBusy && isRegenerating?.type === "video" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Regenerate clip
            </Button>
          </div>
        </div>
      </Card>

      {/* Scene Thumbnails */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 max-w-3xl mx-auto">
        {localScenes.map((scene, idx) => (
          <button
            key={scene.number}
            onClick={() => setCurrentSceneIndex(idx)}
            className={`relative ${aspectClass} rounded-lg overflow-hidden border-2 transition-all ${
              idx === currentSceneIndex
                ? "border-primary ring-2 ring-primary/30"
                : "border-transparent hover:border-border"
            }`}
          >
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <Film className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="absolute bottom-0 inset-x-0 bg-background/70 text-foreground text-xs py-0.5 text-center">
              {scene.number}
            </div>
          </button>
        ))}
      </div>

      {/* Export Progress Modal */}
      {exportState.status !== "idle" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm">
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
                <Button type="button" variant="ghost" size="icon" onClick={resetExport}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {exportState.status === "error" ? (
              <>
                <p className="text-sm text-muted-foreground">{exportState.error}</p>
                <Button type="button" onClick={resetExport} variant="outline" className="w-full mt-4">
                  Close
                </Button>
              </>
            ) : exportState.status === "complete" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Your video with all {scenesWithVideo.length} scenes is ready.</p>
                <div className="space-y-2">
                  <Button
                    type="button"
                    className="w-full gap-2"
                    onClick={() => {
                      const safeName = safeFileBase(title);
                      downloadExportedVideo(exportState.videoUrl!, `${safeName}.mp4`);
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Download to Files
                  </Button>
                  {typeof navigator !== "undefined" && navigator.canShare && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => {
                        const safeName = safeFileBase(title);
                        shareVideo(exportState.videoUrl!, `${safeName}.mp4`);
                      }}
                    >
                      <Share2 className="h-4 w-4" />
                      Share / Save to Photos
                    </Button>
                  )}
                </div>
                <Button type="button" variant="ghost" onClick={resetExport} className="w-full">
                  Close
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>
                      {exportState.status === "loading" && "Loading clips..."}
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

      {/* Action Bar */}
      <TooltipProvider delayDuration={300}>
        <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-3 max-w-3xl mx-auto">
          <div className="flex items-center justify-center gap-2">
            {/* Export Video (all scenes combined) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={() => {
                    void exportVideo(localScenes, format);
                  }}
                  disabled={
                    scenesWithVideo.length === 0 || 
                    exportState.status === "loading" || 
                    exportState.status === "rendering" || 
                    exportState.status === "encoding"
                  }
                  className="h-10 w-10"
                >
                  {exportState.status !== "idle" && exportState.status !== "complete" && exportState.status !== "error" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Film className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export Video (All Scenes)</TooltipContent>
            </Tooltip>

            {/* Download Clips ZIP */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleDownloadClipsZip}
                  disabled={isDownloadingClipsZip || scenesWithVideo.length === 0}
                  className="h-10 w-10"
                >
                  {isDownloadingClipsZip ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <FolderArchive className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download Individual Clips (ZIP)</TooltipContent>
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

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Scene {currentScene?.number}</DialogTitle>
            <DialogDescription>
              Update narration and prompt, then regenerate audio/clip to apply.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">Narration</div>
              <Textarea value={editVoiceover} onChange={(e) => setEditVoiceover(e.target.value)} rows={4} />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">Visual prompt</div>
              <Textarea value={editVisualPrompt} onChange={(e) => setEditVisualPrompt(e.target.value)} rows={4} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setIsEditOpen(false)} disabled={isSavingEdit}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={isSavingEdit}>
              {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Cinematic</DialogTitle>
            <DialogDescription>Anyone with this link can view your video.</DialogDescription>
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
              <p className="text-xs text-muted-foreground">This link will remain active until you delete the project.</p>
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
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
