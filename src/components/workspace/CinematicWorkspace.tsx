import { useState, forwardRef, useImperativeHandle, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Play, Menu, AlertCircle, RotateCcw, ChevronDown, Users, Film, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StoryIdeaInput } from "./StoryIdeaInput";
import { FormatSelector, type VideoFormat } from "./FormatSelector";
import { StyleSelector, type VisualStyle } from "./StyleSelector";
import { VoiceSelector, type VoiceSelection } from "./VoiceSelector";
import { CharacterDescriptionInput } from "./CharacterDescriptionInput";
import { InspirationSelector, type InspirationStyle } from "./InspirationSelector";
import { ToneSelector, type StoryTone } from "./ToneSelector";
import { GenreSelector, type StoryGenre } from "./GenreSelector";
import { InclinationSelector } from "./InclinationSelector";
import { StorytellingLengthSelector, type StoryLength } from "./StorytellingLengthSelector";
import { GenerationProgress } from "./GenerationProgress";
import { GenerationResult } from "./GenerationResult";
import { CharacterConsistencyToggle } from "./CharacterConsistencyToggle";
import { useGenerationPipeline } from "@/hooks/useGenerationPipeline";
import { ThemedLogo } from "@/components/ThemedLogo";
import { getUserFriendlyErrorMessage } from "@/lib/errorMessages";
import { useSubscription, validateGenerationAccess, PLAN_LIMITS } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { UpgradeRequiredModal } from "@/components/modals/UpgradeRequiredModal";
import { SubscriptionSuspendedModal } from "@/components/modals/SubscriptionSuspendedModal";
import type { WorkspaceHandle } from "./Doc2VideoWorkspace";

interface CinematicWorkspaceProps {
  projectId?: string | null;
}

export const CinematicWorkspace = forwardRef<WorkspaceHandle, CinematicWorkspaceProps>(
  function CinematicWorkspace({ projectId: initialProjectId }, ref) {
    // Story-specific inputs
    const [storyIdea, setStoryIdea] = useState("");
    const [inspiration, setInspiration] = useState<InspirationStyle>("none");
    const [tone, setTone] = useState<StoryTone>("casual");
    const [genre, setGenre] = useState<StoryGenre>("documentary");
    const [disableVoiceExpressions, setDisableVoiceExpressions] = useState(false);
    const [brandName, setBrandName] = useState("");
    const [characterConsistencyEnabled, setCharacterConsistencyEnabled] = useState(false);
    
    // Shared inputs
    const [format, setFormat] = useState<VideoFormat>("landscape");
    const [length, setLength] = useState<StoryLength>("short");
    const [style, setStyle] = useState<VisualStyle>("realistic");
    const [customStyle, setCustomStyle] = useState("");
    const [customStyleImage, setCustomStyleImage] = useState<string | null>(null);
    const [voice, setVoice] = useState<VoiceSelection>({ type: "standard", gender: "male" });
    const [characterDescription, setCharacterDescription] = useState("");
    const [characterDescOpen, setCharacterDescOpen] = useState(false);
    const [brandMarkEnabled, setBrandMarkEnabled] = useState(false);
    const [brandMarkText, setBrandMarkText] = useState("");

    const { state: generationState, startGeneration, reset, loadProject } = useGenerationPipeline();

    // Subscription and plan validation  
    const { plan, creditsBalance, subscriptionStatus, checkSubscription } = useSubscription();
    const { toast } = useToast();
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [upgradeReason, setUpgradeReason] = useState("");
    const [showSuspendedModal, setShowSuspendedModal] = useState(false);
    const [suspendedStatus, setSuspendedStatus] = useState<"past_due" | "unpaid" | "canceled">("past_due");

    const canGenerate = storyIdea.trim().length > 0 && !generationState.isGenerating;

    // Get disabled formats based on plan
    const limits = PLAN_LIMITS[plan];
    const disabledFormats: VideoFormat[] = (["landscape", "portrait", "square"] as VideoFormat[]).filter(
      f => !limits.allowedFormats.includes(f)
    );
    
    // Auto-switch to allowed format if current format becomes disabled
    useEffect(() => {
      if (disabledFormats.includes(format) && limits.allowedFormats.length > 0) {
        setFormat(limits.allowedFormats[0] as VideoFormat);
      }
    }, [plan, format, disabledFormats, limits.allowedFormats]);

    // Load project if projectId provided
    useEffect(() => {
      if (initialProjectId) {
        handleOpenProject(initialProjectId);
      }
    }, [initialProjectId]);

    // Auto-recovery: if we're in a "generating" state but the generation actually completed
    useEffect(() => {
      if (
        generationState.projectId && 
        generationState.isGenerating && 
        generationState.step !== "complete" && 
        generationState.step !== "error"
      ) {
        const checkGenerationStatus = async () => {
          const { data } = await supabase
            .from("generations")
            .select("id,status,progress,scenes,error_message")
            .eq("project_id", generationState.projectId!)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (data?.status === "complete" && generationState.step !== "complete") {
            console.log("[CinematicWorkspace] Found completed generation in DB, reloading project");
            await loadProject(generationState.projectId!);
          }
        };

        checkGenerationStatus();
        const intervalId = setInterval(checkGenerationStatus, 5000);
        return () => clearInterval(intervalId);
      }
    }, [generationState.projectId, generationState.isGenerating, generationState.step, loadProject]);

    const handleGenerate = async () => {
      if (!canGenerate) return;

      // Check for subscription issues first
      if (subscriptionStatus === "past_due" || subscriptionStatus === "unpaid") {
        setSuspendedStatus(subscriptionStatus as "past_due" | "unpaid");
        setShowSuspendedModal(true);
        return;
      }

      // Map story length to standard length for backend
      const lengthMap: Record<StoryLength, string> = {
        short: "short",
        brief: "brief",
        extended: "presentation",
      };
      const mappedLength = lengthMap[length];

      // Validate plan access - use storytelling validation as base
      const validation = validateGenerationAccess(
        plan,
        creditsBalance,
        "storytelling",
        mappedLength,
        format,
        brandMarkEnabled && brandMarkText.trim().length > 0,
        style === "custom",
        subscriptionStatus || undefined
      );

      if (!validation.canGenerate) {
        toast({
          variant: "destructive",
          title: "Cannot Generate",
          description: validation.error,
        });
        setUpgradeReason(validation.error || "Please upgrade your plan to continue.");
        setShowUpgradeModal(true);
        return;
      }

      startGeneration({
        content: storyIdea,
        format,
        length: mappedLength,
        style,
        customStyle: style === "custom" ? customStyle : undefined,
        customStyleImage: style === "custom" ? customStyleImage : undefined,
        brandMark: brandMarkEnabled && brandMarkText.trim() ? brandMarkText.trim() : undefined,
        characterDescription: characterDescription.trim() || undefined,
        projectType: "cinematic",
        inspirationStyle: inspiration !== "none" ? inspiration : undefined,
        storyTone: tone,
        storyGenre: genre,
        disableExpressions: disableVoiceExpressions,
        brandName: brandName.trim() || undefined,
        characterConsistencyEnabled,
        voiceType: voice.type,
        voiceId: voice.voiceId,
        voiceName: voice.type === "custom" ? voice.voiceName : voice.gender,
      });

      setTimeout(() => checkSubscription(), 2000);
    };

    const handleNewProject = () => {
      reset();
      setStoryIdea("");
      setInspiration("none");
      setTone("casual");
      setGenre("documentary");
      setDisableVoiceExpressions(false);
      setBrandName("");
      setCharacterConsistencyEnabled(false);
      setFormat("landscape");
      setLength("short");
      setStyle("realistic");
      setCustomStyle("");
      setCustomStyleImage(null);
      setVoice({ type: "standard", gender: "male" });
      setCharacterDescription("");
      setCharacterDescOpen(false);
      setBrandMarkEnabled(false);
      setBrandMarkText("");
    };

    const handleOpenProject = async (projectId: string) => {
      const project = await loadProject(projectId);
      if (!project) return;

      setStoryIdea(project.content ?? "");

      const nextFormat = (project.format as VideoFormat) ?? "landscape";
      setFormat(["landscape", "portrait", "square"].includes(nextFormat) ? nextFormat : "landscape");

      const projectLength = project.length as string;
      if (projectLength === "presentation") {
        setLength("extended");
      } else if (projectLength === "short") {
        setLength("short");
      } else {
        setLength("brief");
      }

      const savedStyle = (project.style ?? "realistic") as VisualStyle;
      if (
        savedStyle === "minimalist" ||
        savedStyle === "doodle" ||
        savedStyle === "stick" ||
        savedStyle === "anime" ||
        savedStyle === "realistic" ||
        savedStyle === "3d-pixar" ||
        savedStyle === "claymation" ||
        savedStyle === "sketch" ||
        savedStyle === "caricature" ||
        savedStyle === "storybook" ||
        savedStyle === "crayon" ||
        savedStyle === "custom"
      ) {
        setStyle(savedStyle);
        if (savedStyle !== "custom") setCustomStyle("");
      } else {
        setStyle("custom");
        setCustomStyle(project.style);
      }
    };

    useImperativeHandle(ref, () => ({
      resetWorkspace: handleNewProject,
      openProject: handleOpenProject,
    }));

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
            {generationState.step !== "idle" && generationState.step !== "complete" && generationState.step !== "error" && (
              <motion.div
                className="flex items-center gap-2 rounded-full bg-amber-500/10 px-3 sm:px-4 py-1.5"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                <span className="text-xs sm:text-sm font-medium text-amber-600 dark:text-amber-400">Creating cinematic...</span>
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
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium mb-3">
                      <Film className="h-3.5 w-3.5" />
                      Cinematic - Beta
                      <Sparkles className="h-3 w-3" />
                    </div>
                    <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                      Create Cinematic Video
                    </h1>
                    <p className="mt-1.5 sm:mt-2 text-sm text-muted-foreground/70">
                      Generate stunning AI-powered video scenes with motion
                    </p>
                  </div>

                  {/* Story Idea Input */}
                  <StoryIdeaInput value={storyIdea} onChange={setStoryIdea} />

                  {/* Story Settings */}
                  <div className="space-y-4 sm:space-y-6 rounded-xl sm:rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6 backdrop-blur-sm shadow-sm">
                    <InspirationSelector selected={inspiration} onSelect={setInspiration} />
                    <div className="h-px bg-border/30" />
                    <ToneSelector selected={tone} onSelect={setTone} />
                    <div className="h-px bg-border/30" />
                    <GenreSelector selected={genre} onSelect={setGenre} />
                  </div>

                  {/* Voice Settings */}
                  <div className="space-y-4 sm:space-y-6 rounded-xl sm:rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6 backdrop-blur-sm shadow-sm">
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                      <div className="flex-1">
                        <VoiceSelector selected={voice} onSelect={setVoice} />
                      </div>
                      <div className="flex-1">
                        <InclinationSelector 
                          disabled={disableVoiceExpressions}
                          onDisabledChange={setDisableVoiceExpressions}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Character Consistency - Pro Feature */}
                  <CharacterConsistencyToggle 
                    enabled={characterConsistencyEnabled}
                    onToggle={setCharacterConsistencyEnabled}
                  />

                  {/* Brand Name (Optional) */}
                  <div className="rounded-xl sm:rounded-2xl border border-border/50 bg-card/50 p-4 sm:p-6 backdrop-blur-sm shadow-sm">
                    <Label htmlFor="brand-name" className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                      Brand / Character Name (Optional)
                    </Label>
                    <Input
                      id="brand-name"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="e.g., TechCorp, Alex the Explorer"
                      className="mt-3"
                    />
                    <p className="text-xs text-muted-foreground/60 mt-2">
                      Include a specific brand or character name to weave into the story
                    </p>
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
                        <CharacterDescriptionInput value={characterDescription} onChange={setCharacterDescription} />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Technical Configuration */}
                  <div className="space-y-4 sm:space-y-6 rounded-xl sm:rounded-2xl border border-border/50 bg-card/50 p-3 sm:p-6 backdrop-blur-sm shadow-sm overflow-hidden">
                    <FormatSelector selected={format} onSelect={setFormat} disabledFormats={disabledFormats} />
                    <div className="h-px bg-border/30" />
                    <StorytellingLengthSelector selected={length} onSelect={setLength} />
                    <div className="h-px bg-border/30" />
                    <StyleSelector
                      selected={style}
                      onSelect={setStyle}
                      customStyle={customStyle}
                      onCustomStyleChange={setCustomStyle}
                      customStyleImage={customStyleImage}
                      onCustomStyleImageChange={setCustomStyleImage}
                    />
                  </div>

                  {/* Generate Button */}
                  <div className="pt-2 sm:pt-4">
                    <Button
                      onClick={handleGenerate}
                      disabled={!canGenerate}
                      size="lg"
                      className="w-full rounded-xl py-4 sm:py-6 text-base sm:text-lg font-medium bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg"
                    >
                      <Film className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                      Generate Cinematic Video
                    </Button>
                  </div>
                </motion.div>
              ) : generationState.step === "complete" ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full"
                >
                  <GenerationResult
                    title={generationState.title || "Your Cinematic Video"}
                    scenes={generationState.scenes || []}
                    format={generationState.format || format}
                    onNewProject={handleNewProject}
                    projectId={generationState.projectId}
                    generationId={generationState.generationId}
                    costTracking={generationState.costTracking}
                    totalTimeMs={generationState.totalTimeMs}
                    brandMark={brandMarkEnabled && brandMarkText.trim() ? brandMarkText.trim() : undefined}
                  />
                </motion.div>
              ) : generationState.step === "error" ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="max-w-md mx-auto text-center py-12 sm:py-20 space-y-4 sm:space-y-6"
                >
                  <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertCircle className="h-7 w-7 sm:h-8 sm:w-8 text-destructive" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg sm:text-xl font-semibold text-foreground">Generation Failed</h3>
                    <p className="text-sm text-muted-foreground">
                      {getUserFriendlyErrorMessage(generationState.error)}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <Button
                      onClick={handleGenerate}
                      disabled={generationState.isGenerating}
                      className="rounded-xl"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Try Again
                    </Button>
                    <Button variant="outline" onClick={handleNewProject} className="rounded-xl">
                      Start Over
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="progress"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full max-w-lg mx-auto"
                >
                  <GenerationProgress state={generationState} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Modals */}
        <UpgradeRequiredModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          reason={upgradeReason}
        />
        <SubscriptionSuspendedModal
          open={showSuspendedModal}
          onOpenChange={setShowSuspendedModal}
          status={suspendedStatus}
        />
      </div>
    );
  }
);
