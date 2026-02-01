import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Loader2, Play, Pause, Volume2, VolumeX, Maximize, CircleUserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ThemedLogo } from "@/components/ThemedLogo";
import { ThemeProvider } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface Scene {
  imageUrl?: string;
  imageUrls?: string[];
  audioUrl?: string;
  duration?: number;
  narration?: string;
}

// Header CTA component - Get Started button (icon on mobile/tablet)
function HeaderCTA() {
  const isMobile = useIsMobile();
  
  return (
    <Button asChild size={isMobile ? "icon" : "sm"} variant="default">
      <Link to="/">
        {isMobile ? (
          <CircleUserRound className="h-5 w-5" />
        ) : (
          "Get Started"
        )}
      </Link>
    </Button>
  );
}

export default function PublicShare() {
  const { token } = useParams<{ token: string }>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch share data using edge function for fresh signed URLs
  const { data: shareData, isLoading, error } = useQuery({
    queryKey: ["public-share", token],
    queryFn: async () => {
      if (!token) throw new Error("Invalid share link");

      // Call edge function to get share data with refreshed URLs
      const { data, error } = await supabase.functions.invoke("get-shared-project", {
        body: { token },
      });

      if (error) throw error;
      if (!data) throw new Error("Share not found or expired");

      return {
        project: data.project,
        scenes: data.scenes || [],
        share: data.share,
      };
    },
    enabled: !!token,
    retry: false,
  });

  const scenes = shareData?.scenes || [];
  const project = shareData?.project;
  const currentScene = scenes[currentSceneIndex];

  // Calculate total duration
  useEffect(() => {
    if (scenes.length > 0) {
      const total = scenes.reduce((acc, scene) => acc + (scene.duration || 3), 0);
      setTotalDuration(total);
    }
  }, [scenes]);

  // Playback logic
  useEffect(() => {
    if (!isPlaying || !currentScene) return;

    const sceneDuration = currentScene.duration || 3;
    const startTime = Date.now();

    // Play audio if available
    if (currentScene.audioUrl && audioRef.current) {
      audioRef.current.src = currentScene.audioUrl;
      audioRef.current.muted = isMuted;
      audioRef.current.play().catch(() => {});
    }

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      
      // Calculate overall progress
      const previousDuration = scenes
        .slice(0, currentSceneIndex)
        .reduce((acc, s) => acc + (s.duration || 3), 0);
      const currentProgress = ((previousDuration + elapsed) / totalDuration) * 100;
      setProgress(Math.min(currentProgress, 100));

      if (elapsed >= sceneDuration) {
        if (currentSceneIndex < scenes.length - 1) {
          setCurrentSceneIndex(currentSceneIndex + 1);
        } else {
          setIsPlaying(false);
          setCurrentSceneIndex(0);
          setProgress(0);
        }
      }
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, [isPlaying, currentSceneIndex, currentScene, scenes, isMuted, totalDuration]);

  const togglePlay = () => {
    if (!isPlaying && currentSceneIndex === scenes.length - 1) {
      setCurrentSceneIndex(0);
      setProgress(0);
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
  };

  const handleFullscreen = () => {
    const container = document.getElementById("share-player");
    if (container?.requestFullscreen) {
      container.requestFullscreen();
    }
  };

  const getAspectRatio = (format?: string) => {
    switch (format) {
      case "portrait": return "aspect-[9/16] max-h-[80vh]";
      case "square": return "aspect-square max-h-[80vh]";
      default: return "aspect-video max-w-4xl";
    }
  };

  if (isLoading) {
    return (
      <ThemeProvider attribute="class" defaultTheme="light">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ThemeProvider>
    );
  }

  if (error || !shareData) {
    return (
      <ThemeProvider attribute="class" defaultTheme="light">
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold">Link Not Found</h1>
            <p className="text-muted-foreground">
              This share link is invalid, expired, or has been removed.
            </p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  const currentImageUrl = currentScene?.imageUrls?.[0] || currentScene?.imageUrl || "";

  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <div className="min-h-screen bg-background">
        {/* Hidden audio element */}
        <audio ref={audioRef} />

        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
            <ThemedLogo className="h-8 w-auto" />
            <HeaderCTA />
          </div>
        </header>

        {/* Main Content */}
        <main className="flex flex-col items-center justify-center p-4 sm:p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-4xl space-y-6"
          >
            {/* Title */}
            <div className="text-center">
              <h1 className="text-xl sm:text-2xl font-bold">{project?.title}</h1>
              {project?.description && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                  {project.description}
                </p>
              )}
            </div>

            {/* Player */}
            <div
              id="share-player"
              className={cn(
                "relative mx-auto overflow-hidden rounded-xl bg-black",
                getAspectRatio(project?.format)
              )}
            >
              {currentImageUrl ? (
                <img
                  src={currentImageUrl}
                  alt={`Scene ${currentSceneIndex + 1}`}
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-white/50">No preview available</p>
                </div>
              )}

              {/* Play button overlay when paused */}
              {!isPlaying && scenes.length > 0 && (
                <button
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
                >
                  <div className="p-4 rounded-full bg-white/20 backdrop-blur-sm">
                    <Play className="h-12 w-12 text-white fill-white" />
                  </div>
                </button>
              )}

              {/* Narration subtitle */}
              {isPlaying && currentScene?.narration && (
                <div className="absolute bottom-16 left-4 right-4">
                  <p className="text-center text-white text-sm sm:text-base bg-black/60 px-4 py-2 rounded-lg backdrop-blur-sm">
                    {currentScene.narration}
                  </p>
                </div>
              )}
            </div>

            {/* Controls */}
            {scenes.length > 0 && (
              <div className="space-y-3">
                {/* Progress bar */}
                <div className="px-2">
                  <Slider
                    value={[progress]}
                    max={100}
                    step={0.1}
                    className="cursor-pointer"
                    disabled
                  />
                </div>

                {/* Control buttons */}
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={togglePlay}
                    className="h-12 w-12"
                  >
                    {isPlaying ? (
                      <Pause className="h-6 w-6" />
                    ) : (
                      <Play className="h-6 w-6" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleMute}
                    className="h-10 w-10"
                  >
                    {isMuted ? (
                      <VolumeX className="h-5 w-5" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleFullscreen}
                    className="h-10 w-10"
                  >
                    <Maximize className="h-5 w-5" />
                  </Button>
                </div>

              </div>
            )}

            {/* Footer notice */}
            <p className="text-center text-xs text-muted-foreground pt-8">
              Created with MotionMax •{" "}
              <Link to="/" className="text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </motion.div>
        </main>
      </div>
    </ThemeProvider>
  );
}
