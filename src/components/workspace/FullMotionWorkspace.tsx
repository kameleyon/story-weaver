import { useState, forwardRef, useImperativeHandle, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Play, Menu, Film, AlertCircle, RotateCcw, ChevronDown, Users, Sparkles, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AnimationStyleSelector, type AnimationStyle } from "./AnimationStyleSelector";
import { AvatarSelector, type AvatarType } from "./AvatarSelector";
import { MotionIntensitySlider, type MotionIntensity } from "./MotionIntensitySlider";
import { FormatSelector, type VideoFormat } from "./FormatSelector";
import { VoiceSelector, type VoiceSelection } from "./VoiceSelector";
import { GenerationProgress } from "./GenerationProgress";
import { FullMotionResult } from "./FullMotionResult";
import { ThemedLogo } from "@/components/ThemedLogo";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { WorkspaceHandle } from "./Doc2VideoWorkspace";
import type { GenerationState, Scene } from "@/hooks/useGenerationPipeline";

interface FullMotionWorkspaceProps {
  projectId?: string | null;
}

export const FullMotionWorkspace = forwardRef<WorkspaceHandle, FullMotionWorkspaceProps>(
  function FullMotionWorkspace({ projectId: initialProjectId }, ref) {
    const { isAdmin, loading: adminLoading } = useAdminAuth();
    const navigate = useNavigate();

    // Redirect non-admins
    useEffect(() => {
      if (!adminLoading && !isAdmin) {
        toast.error("Full Motion is only available to administrators");
        navigate("/app");
      }
    }, [isAdmin, adminLoading, navigate]);

    // Form state
    const [script, setScript] = useState("");
    const [animationStyle, setAnimationStyle] = useState<AnimationStyle>("talking-avatar");
    const [avatar, setAvatar] = useState<AvatarType>("realistic-female");
    const [motionIntensity, setMotionIntensity] = useState<MotionIntensity>("moderate");
    const [format, setFormat] = useState<VideoFormat>("landscape");
    const [voice, setVoice] = useState<VoiceSelection>({ type: "standard", gender: "female" });
    const [characterDescription, setCharacterDescription] = useState("");
    const [characterDescOpen, setCharacterDescOpen] = useState(false);

    // Generation state using the same structure as useGenerationPipeline
    const [generationState, setGenerationState] = useState<GenerationState>({
      step: "idle",
      progress: 0,
      sceneCount: 1,
      currentScene: 0,
      totalImages: 1,
      completedImages: 0,
      isGenerating: false,
      projectType: "fullmotion" as any,
    });

    const canGenerate = script.trim().length > 0 && !generationState.isGenerating;

    // Helper to get fresh session token
    const getFreshSession = async (): Promise<string> => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          throw new Error("Session expired. Please refresh the page and try again.");
        }
        return refreshData.session.access_token;
      }
      return session.access_token;
    };

    const handleGenerate = async () => {
      if (!canGenerate) return;

      setGenerationState({
        step: "analysis",
        progress: 5,
        sceneCount: 1,
        currentScene: 0,
        totalImages: 1,
        completedImages: 0,
        isGenerating: true,
        statusMessage: "Starting Full Motion generation...",
        projectType: "fullmotion" as any,
      });

      try {
        const accessToken = await getFreshSession();

        setGenerationState(prev => ({
          ...prev,
          step: "scripting",
          progress: 15,
          statusMessage: "Calling Glif API for animated video...",
        }));

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            phase: "script",
            content: script,
            format,
            length: "short",
            style: animationStyle,
            projectType: "fullmotion",
            animationStyle,
            avatarType: avatar,
            motionIntensity,
            characterDescription: characterDescription || undefined,
            voiceType: voice.type,
            voiceId: voice.type === "custom" ? voice.voiceId : undefined,
            voiceName: voice.type === "custom" ? voice.voiceName : undefined,
          }),
        });

        if (!response.ok) {
          let errorMessage = "Generation failed";
          try {
            const errorData = await response.json();
            errorMessage = errorData?.error || errorMessage;
          } catch {
            // ignore
          }
          throw new Error(errorMessage);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Generation failed");
        }

        // Update state with results
        const scenes: Scene[] = result.scenes || [{
          number: 1,
          voiceover: script,
          visualPrompt: "",
          duration: 10,
          imageUrl: result.videoUrl,
        }];

        setGenerationState({
          step: "complete",
          progress: 100,
          sceneCount: 1,
          currentScene: 1,
          totalImages: 1,
          completedImages: 1,
          isGenerating: false,
          projectId: result.projectId,
          generationId: result.generationId,
          title: result.title || "Full Motion Video",
          scenes,
          format: format as "landscape" | "portrait" | "square",
          statusMessage: "Generation complete!",
          projectType: "fullmotion" as any,
        });

        toast.success("Full Motion video generated!", {
          description: `"${result.title}" is ready.`,
        });
      } catch (error) {
        console.error("Full Motion generation error:", error);
        const errorMessage = error instanceof Error ? error.message : "Generation failed";

        setGenerationState(prev => ({
          ...prev,
          step: "error",
          isGenerating: false,
          error: errorMessage,
          statusMessage: errorMessage,
        }));

        toast.error("Generation Failed", {
          description: errorMessage,
        });
      }
    };

    const handleNewProject = () => {
      setScript("");
      setAnimationStyle("talking-avatar");
      setAvatar("realistic-female");
      setMotionIntensity("moderate");
      setFormat("landscape");
      setVoice({ type: "standard", gender: "female" });
      setCharacterDescription("");
      setCharacterDescOpen(false);
      setGenerationState({
        step: "idle",
        progress: 0,
        sceneCount: 1,
        currentScene: 0,
        totalImages: 1,
        completedImages: 0,
        isGenerating: false,
        projectType: "fullmotion" as any,
      });
    };

    const handleOpenProject = async (projectId: string) => {
      // Load existing project
      try {
        const { data: project, error } = await supabase
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .single();

        if (error || !project) {
          toast.error("Failed to load project");
          return;
        }

        setScript(project.content);
        setFormat(project.format as VideoFormat);
        setCharacterDescription(project.character_description || "");

        // Load latest generation
        const { data: generation } = await supabase
          .from("generations")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (generation && generation.status === "complete") {
          const scenes = (generation.scenes as any[])?.map((s, i) => ({
            number: s.number || i + 1,
            voiceover: s.voiceover || "",
            visualPrompt: s.visualPrompt || "",
            duration: s.duration || 10,
            imageUrl: s.imageUrl,
          })) || [];

          setGenerationState({
            step: "complete",
            progress: 100,
            sceneCount: scenes.length,
            currentScene: scenes.length,
            totalImages: 1,
            completedImages: 1,
            isGenerating: false,
            projectId,
            generationId: generation.id,
            title: project.title,
            scenes,
            format: project.format as "landscape" | "portrait" | "square",
            projectType: "fullmotion" as any,
          });
        }
      } catch (err) {
        console.error("Error loading project:", err);
        toast.error("Failed to load project");
      }
    };

    useImperativeHandle(ref, () => ({
      resetWorkspace: handleNewProject,
      openProject: handleOpenProject,
    }));

    // Show loading while checking admin status
    if (adminLoading) {
      return (
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Verifying access...</span>
          </div>
        </div>
      );
    }

    // Don't render for non-admins (redirect happens in useEffect)
    if (!isAdmin) {
      return (
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-center">
            <Lock className="h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Admin Only</h2>
            <p className="text-sm text-muted-foreground">This feature is only available to administrators.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-screen flex-col bg-background overflow-hidden">
        {/* Top Bar */}
        <header className="grid h-14 sm:h-16 grid-cols-3 items-center border-b border-border/30 bg-background/80 px-4 sm:px-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 sm:gap-4 justify-start">
            <SidebarTrigger className="lg:hidden">
              <Menu className="h-5 w-5 text-muted-foreground" />
            </SidebarTrigger>
            <div className="hidden lg:flex items-center">
              <ThemedLogo className="h-10 w-auto" />
            </div>
          </div>

          {/* Mobile centered logo */}
          <div className="flex justify-center lg:hidden">
            <ThemedLogo className="h-10 w-auto" />
          </div>

          <div className="flex items-center justify-end gap-3">
            {/* Admin Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium">
              <Sparkles className="h-3 w-3" />
              Admin Preview
            </div>

            {generationState.isGenerating && (
              <motion.div
                className="flex items-center gap-2 rounded-full bg-primary/10 px-3 sm:px-4 py-1.5"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                <span className="text-xs sm:text-sm font-medium text-primary">Generating...</span>
              </motion.div>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto max-w-4xl px-3 sm:px-6 py-4 sm:py-12">
            <AnimatePresence mode="wait">
              {generationState.step === "idle" ? (
                <motion.div
                  key="input"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-2xl mx-auto space-y-6 sm:space-y-8"
                >
                  {/* Hero */}
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-primary/20 to-amber-500/20 text-primary text-xs font-medium mb-3">
                      <Film className="h-3.5 w-3.5" />
                      Full Motion Video
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px]">
                        BETA
                      </span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                      Create Animated Videos
                    </h1>
                    <p className="mt-1.5 sm:mt-2 text-sm text-muted-foreground/70">
                      Generate fully animated videos with voice, gestures, and motion flow
                    </p>
                  </div>

                  {/* Script Input */}
                  <div className="space-y-3 rounded-xl sm:rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6 backdrop-blur-sm shadow-sm">
                    <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                      Script / Story
                    </Label>
                    <Textarea
                      value={script}
                      onChange={(e) => setScript(e.target.value)}
                      placeholder="Enter your script or story idea. Describe what the character should say and do..."
                      className="min-h-[160px] resize-none"
                    />
                    <p className="text-xs text-muted-foreground/60">
                      Write the dialogue and actions for your animated video
                    </p>
                  </div>

                  {/* Animation Settings */}
                  <div className="space-y-4 sm:space-y-6 rounded-xl sm:rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6 backdrop-blur-sm shadow-sm">
                    <AnimationStyleSelector selected={animationStyle} onSelect={setAnimationStyle} />
                    <div className="h-px bg-border/30" />
                    <AvatarSelector selected={avatar} onSelect={setAvatar} />
                    <div className="h-px bg-border/30" />
                    <MotionIntensitySlider value={motionIntensity} onChange={setMotionIntensity} />
                  </div>

                  {/* Voice Settings */}
                  <div className="rounded-xl sm:rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6 backdrop-blur-sm shadow-sm">
                    <VoiceSelector selected={voice} onSelect={setVoice} />
                  </div>

                  {/* Technical Configuration */}
                  <div className="rounded-xl sm:rounded-2xl border border-border/50 bg-card/50 p-3 sm:p-6 backdrop-blur-sm shadow-sm">
                    <FormatSelector selected={format} onSelect={setFormat} />
                  </div>

                  {/* Character Description - Collapsible */}
                  <Collapsible open={characterDescOpen} onOpenChange={setCharacterDescOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl sm:rounded-2xl border border-border/50 bg-card/50 p-3 sm:p-4 backdrop-blur-sm shadow-sm hover:bg-muted/30 transition-colors">
                      <span className="text-xs sm:text-sm font-medium flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Character Appearance
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform duration-200 ${characterDescOpen ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="rounded-b-xl sm:rounded-b-2xl border border-t-0 border-border/50 bg-card/50 p-4 sm:p-6 backdrop-blur-sm shadow-sm -mt-2">
                        <Textarea
                          value={characterDescription}
                          onChange={(e) => setCharacterDescription(e.target.value)}
                          placeholder="Describe your character's appearance (age, clothing, style, etc.)"
                          className="min-h-[100px] resize-none"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Generate Button */}
                  <div className="pt-2">
                    <Button
                      onClick={handleGenerate}
                      disabled={!canGenerate}
                      className="w-full gap-2 rounded-xl bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 text-primary-foreground shadow-lg shadow-primary/20 h-12 text-base font-medium"
                    >
                      <Play className="h-5 w-5" />
                      Generate Full Motion Video
                    </Button>
                    <p className="text-xs text-center text-muted-foreground/60 mt-3">
                      Powered by Glif API • Animated video with voice sync
                    </p>
                  </div>
                </motion.div>
              ) : generationState.step === "error" ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center min-h-[60vh] gap-4"
                >
                  <AlertCircle className="h-12 w-12 text-destructive" />
                  <h2 className="text-xl font-semibold text-foreground">Generation Failed</h2>
                  <p className="text-sm text-muted-foreground text-center max-w-md">{generationState.error || "An error occurred"}</p>
                  <Button onClick={handleNewProject} variant="outline" className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Try Again
                  </Button>
                </motion.div>
              ) : generationState.step === "complete" ? (
                <FullMotionResult
                  scenes={generationState.scenes || []}
                  projectTitle={generationState.title || "Full Motion Video"}
                  onNewProject={handleNewProject}
                />
              ) : (
                /* Show real GenerationProgress component */
                <motion.div
                  key="progress"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center min-h-[60vh]"
                >
                  <GenerationProgress state={generationState} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    );
  }
);
