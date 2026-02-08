import { useState, forwardRef, useImperativeHandle, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Play, Menu, AlertCircle, RotateCcw, ChevronDown, Users, Film, Loader2 } from "lucide-react";
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
import { CharacterConsistencyToggle } from "./CharacterConsistencyToggle";
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

interface CinematicScene {
  number: number;
  voiceover: string;
  visualPrompt: string;
  videoUrl?: string;
  audioUrl?: string;
  duration: number;
}

interface CinematicState {
  step: "idle" | "scripting" | "audio" | "visuals" | "stitching" | "complete" | "error";
  progress: number;
  isGenerating: boolean;
  projectId?: string;
  generationId?: string;
  title?: string;
  scenes?: CinematicScene[];
  finalVideoUrl?: string;
  error?: string;
  statusMessage?: string;
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
    const [format, setFormat] = useState<VideoFormat>("portrait");
    const [length, setLength] = useState<StoryLength>("short");
    const [style, setStyle] = useState<VisualStyle>("realistic");
    const [customStyle, setCustomStyle] = useState("");
    const [customStyleImage, setCustomStyleImage] = useState<string | null>(null);
    const [voice, setVoice] = useState<VoiceSelection>({ type: "standard", gender: "female" });
    const [characterDescription, setCharacterDescription] = useState("");
    const [characterDescOpen, setCharacterDescOpen] = useState(false);
    const [brandMarkEnabled, setBrandMarkEnabled] = useState(false);
    const [brandMarkText, setBrandMarkText] = useState("");

    // Cinematic generation state
    const [cinematicState, setCinematicState] = useState<CinematicState>({
      step: "idle",
      progress: 0,
      isGenerating: false,
    });

    // Subscription and plan validation  
    const { plan, creditsBalance, subscriptionStatus, checkSubscription } = useSubscription();
    const { toast } = useToast();
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [upgradeReason, setUpgradeReason] = useState("");
    const [showSuspendedModal, setShowSuspendedModal] = useState(false);
    const [suspendedStatus, setSuspendedStatus] = useState<"past_due" | "unpaid" | "canceled">("past_due");

    const canGenerate = storyIdea.trim().length > 0 && !cinematicState.isGenerating;

    // Get disabled formats based on plan (free users can only use landscape)
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

      // Validate plan access
      const validation = validateGenerationAccess(
        plan,
        creditsBalance,
        "cinematic",
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

      setCinematicState({
        step: "scripting",
        progress: 5,
        isGenerating: true,
        statusMessage: "Starting cinematic generation...",
      });

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("You must be logged in to generate videos");

        // Call the cinematic edge function
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-cinematic`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            content: storyIdea,
            format,
            length: mappedLength,
            style,
            customStyle: style === "custom" ? customStyle : undefined,
            brandMark: brandMarkEnabled && brandMarkText.trim() ? brandMarkText.trim() : undefined,
            characterDescription: characterDescription.trim() || undefined,
            inspirationStyle: inspiration !== "none" ? inspiration : undefined,
            storyTone: tone,
            storyGenre: genre,
            disableExpressions: disableVoiceExpressions,
            brandName: brandName.trim() || undefined,
            characterConsistencyEnabled,
            voiceType: voice.type,
            voiceId: voice.voiceId,
            voiceName: voice.type === "custom" ? voice.voiceName : voice.gender,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Cinematic generation failed");
        }

        const result = await response.json();

        if (result.success) {
          setCinematicState({
            step: "complete",
            progress: 100,
            isGenerating: false,
            projectId: result.projectId,
            generationId: result.generationId,
            title: result.title,
            scenes: result.scenes,
            finalVideoUrl: result.finalVideoUrl,
            statusMessage: "Cinematic video generated!",
          });

          toast({
            title: "Cinematic Video Generated!",
            description: `"${result.title}" is ready.`,
          });
        } else {
          throw new Error(result.error || "Generation failed");
        }
      } catch (error) {
        console.error("Cinematic generation error:", error);
        const errorMessage = error instanceof Error ? error.message : "Generation failed";
        
        setCinematicState(prev => ({
          ...prev,
          step: "error",
          isGenerating: false,
          error: errorMessage,
          statusMessage: errorMessage,
        }));

        toast({
          variant: "destructive",
          title: "Generation Failed",
          description: errorMessage,
        });
      }

      setTimeout(() => checkSubscription(), 2000);
    };

    const handleNewProject = () => {
      setCinematicState({
        step: "idle",
        progress: 0,
        isGenerating: false,
      });
      setStoryIdea("");
      setInspiration("none");
      setTone("casual");
      setGenre("documentary");
      setDisableVoiceExpressions(false);
      setBrandName("");
      setCharacterConsistencyEnabled(false);
      setFormat("portrait");
      setLength("short");
      setStyle("realistic");
      setCustomStyle("");
      setCustomStyleImage(null);
      setVoice({ type: "standard", gender: "female" });
      setCharacterDescription("");
      setCharacterDescOpen(false);
      setBrandMarkEnabled(false);
      setBrandMarkText("");
    };

    const handleOpenProject = async (projectId: string) => {
      // For now, just reset - we can implement project loading later
      handleNewProject();
      toast({
        title: "Project Loading",
        description: "Loading cinematic projects is not yet supported.",
      });
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
            {cinematicState.step !== "idle" && cinematicState.step !== "complete" && cinematicState.step !== "error" && (
              <motion.div
                className="flex items-center gap-2 rounded-full bg-amber-500/10 px-3 sm:px-4 py-1.5"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                <span className="text-xs sm:text-sm font-medium text-amber-500">Creating cinematic...</span>
              </motion.div>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto max-w-4xl px-3 sm:px-6 py-4 sm:py-12">
            <AnimatePresence mode="wait">
              {cinematicState.step === "idle" ? (
                <motion.div
                  key="input"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-2xl mx-auto space-y-6 sm:space-y-8"
                >
                  {/* Hero */}
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-medium mb-3">
                      <Film className="h-3.5 w-3.5" />
                      Cinematic - Beta
                    </div>
                    <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                      Create Cinematic Video
                    </h1>
                    <p className="mt-1.5 sm:mt-2 text-sm text-muted-foreground/70">
                      Transform your ideas into cinematic AI-generated videos using Glif workflows
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
                      customStyle={customStyle}
                      onSelect={setStyle}
                      onCustomStyleChange={setCustomStyle}
                      customStyleImage={customStyleImage}
                      onCustomStyleImageChange={setCustomStyleImage}
                      brandMarkEnabled={brandMarkEnabled}
                      brandMarkText={brandMarkText}
                      onBrandMarkEnabledChange={setBrandMarkEnabled}
                      onBrandMarkTextChange={setBrandMarkText}
                    />
                  </div>

                  {/* Generate Button */}
                  <motion.div whileHover={{ scale: canGenerate ? 1.01 : 1 }} whileTap={{ scale: canGenerate ? 0.99 : 1 }}>
                    <Button
                      onClick={handleGenerate}
                      disabled={!canGenerate}
                      className="w-full gap-2 sm:gap-2.5 rounded-full bg-amber-500 py-5 sm:py-6 text-sm sm:text-base font-medium text-white shadow-sm transition-all hover:bg-amber-600 hover:shadow-md disabled:opacity-40"
                    >
                      <Play className="h-4 w-4" />
                      Create Cinematic Video
                    </Button>
                  </motion.div>
                </motion.div>
              ) : cinematicState.step === "error" ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-2xl mx-auto space-y-6"
                >
                  <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-8 text-center">
                    <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
                    <h2 className="text-xl font-semibold text-foreground mb-2">Cinematic Generation Failed</h2>
                    <p className="text-muted-foreground mb-6">{getUserFriendlyErrorMessage(cinematicState.error)}</p>
                    <Button onClick={() => { handleNewProject(); }} variant="outline" className="gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Try Again
                    </Button>
                  </div>
                </motion.div>
              ) : cinematicState.step === "complete" && cinematicState.finalVideoUrl ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-3xl mx-auto space-y-6"
                >
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-medium mb-3">
                      <Film className="h-3.5 w-3.5" />
                      Complete
                    </div>
                    <h2 className="text-xl font-semibold">{cinematicState.title || "Untitled Cinematic"}</h2>
                  </div>

                  {/* Video Player */}
                  <div className="rounded-2xl overflow-hidden border border-border/50 bg-card">
                    <video
                      src={cinematicState.finalVideoUrl}
                      controls
                      className="w-full aspect-video"
                      autoPlay
                      loop
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3 justify-center">
                    <Button variant="outline" onClick={handleNewProject} className="gap-2">
                      <RotateCcw className="h-4 w-4" />
                      New Project
                    </Button>
                    <Button 
                      variant="default" 
                      className="gap-2 bg-amber-500 hover:bg-amber-600"
                      asChild
                    >
                      <a href={cinematicState.finalVideoUrl} download target="_blank" rel="noopener noreferrer">
                        Download Video
                      </a>
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="progress"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-2xl mx-auto space-y-6"
                >
                  {/* Progress UI */}
                  <div className="rounded-2xl border border-border/50 bg-card/50 p-8 text-center">
                    <Loader2 className="h-12 w-12 mx-auto text-amber-500 mb-4 animate-spin" />
                    <h2 className="text-xl font-semibold text-foreground mb-2">
                      {cinematicState.step === "scripting" && "Writing Script..."}
                      {cinematicState.step === "audio" && "Generating Audio..."}
                      {cinematicState.step === "visuals" && "Creating Video Clips..."}
                      {cinematicState.step === "stitching" && "Stitching Video..."}
                    </h2>
                    <p className="text-muted-foreground mb-4">
                      {cinematicState.statusMessage || "Please wait while we create your cinematic video..."}
                    </p>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-amber-500 h-2 rounded-full transition-all duration-500" 
                        style={{ width: `${cinematicState.progress}%` }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">{cinematicState.progress}% complete</p>
                  </div>
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
          showCreditsOption={plan !== "free"}
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
