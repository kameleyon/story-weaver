import { useState, forwardRef, useImperativeHandle, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Play, Menu, Film, AlertCircle, RotateCcw, ChevronDown, Users, Sparkles, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

    // Generation state (simplified for now - will integrate with pipeline later)
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationStep, setGenerationStep] = useState<"idle" | "generating" | "complete" | "error">("idle");
    const [progress, setProgress] = useState(0);
    const [scenes, setScenes] = useState<any[]>([]);
    const [errorMessage, setErrorMessage] = useState("");
    const [projectTitle, setProjectTitle] = useState("");

    const canGenerate = script.trim().length > 0 && !isGenerating;

    const handleGenerate = async () => {
      if (!canGenerate) return;

      setIsGenerating(true);
      setGenerationStep("generating");
      setProgress(0);
      setErrorMessage("");

      // Simulate progress for now - actual Glif integration will come later
      toast.info("Full Motion generation is coming soon! This is a preview of the workspace.");
      
      // Simulate a brief loading then show placeholder result
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 10;
        });
      }, 300);

      setTimeout(() => {
        clearInterval(interval);
        setProgress(100);
        setGenerationStep("complete");
        setIsGenerating(false);
        setProjectTitle("Full Motion Preview");
        setScenes([
          { number: 1, voiceover: script.slice(0, 100), duration: 5 },
          { number: 2, voiceover: "Scene 2 content...", duration: 5 },
        ]);
      }, 3500);
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
      setIsGenerating(false);
      setGenerationStep("idle");
      setProgress(0);
      setScenes([]);
      setErrorMessage("");
      setProjectTitle("");
    };

    const handleOpenProject = async (projectId: string) => {
      // Placeholder - will implement project loading later
      toast.info("Project loading coming soon!");
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

            {isGenerating && (
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
              {generationStep === "idle" ? (
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
              ) : generationStep === "generating" ? (
                <motion.div
                  key="progress"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center min-h-[60vh] gap-6"
                >
                  <div className="text-center">
                    <Film className="h-12 w-12 text-primary animate-pulse mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-foreground mb-2">Creating Your Video</h2>
                    <p className="text-sm text-muted-foreground">Generating animated scenes with voice sync...</p>
                  </div>
                  <div className="w-full max-w-md">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-primary to-amber-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <p className="text-xs text-center text-muted-foreground mt-2">{progress}% complete</p>
                  </div>
                </motion.div>
              ) : generationStep === "complete" ? (
                <FullMotionResult
                  scenes={scenes}
                  projectTitle={projectTitle}
                  onNewProject={handleNewProject}
                />
              ) : (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center min-h-[60vh] gap-4"
                >
                  <AlertCircle className="h-12 w-12 text-destructive" />
                  <h2 className="text-xl font-semibold text-foreground">Generation Failed</h2>
                  <p className="text-sm text-muted-foreground text-center max-w-md">{errorMessage || "An error occurred"}</p>
                  <Button onClick={handleNewProject} variant="outline" className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Try Again
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    );
  }
);
