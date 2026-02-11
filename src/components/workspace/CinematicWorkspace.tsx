import { useState, forwardRef, useImperativeHandle, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Play, Menu, AlertCircle, RotateCcw, ChevronDown, Users, Film, Loader2, Lightbulb, MessageSquareOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ContentInput } from "./ContentInput";
import { FormatSelector, type VideoFormat } from "./FormatSelector";
import { LengthSelector, type VideoLength } from "./LengthSelector";
import { StyleSelector, type VisualStyle } from "./StyleSelector";
import { VoiceSelector, type VoiceSelection } from "./VoiceSelector";
import { PresenterFocusInput } from "./PresenterFocusInput";
import { CharacterDescriptionInput } from "./CharacterDescriptionInput";
import { CharacterConsistencyToggle } from "./CharacterConsistencyToggle";
import { GenerationProgress } from "./GenerationProgress";
import { CinematicResult } from "./CinematicResult";
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
    // Content input (like Doc2Video)
    const [content, setContent] = useState("");
    const [format, setFormat] = useState<VideoFormat>("portrait");
    const [length, setLength] = useState<VideoLength>("brief");
    const [style, setStyle] = useState<VisualStyle>("realistic");
    const [customStyle, setCustomStyle] = useState("");
    const [customStyleImage, setCustomStyleImage] = useState<string | null>(null);
    const [voice, setVoice] = useState<VoiceSelection>({ type: "standard", gender: "female" });
    const [presenterFocus, setPresenterFocus] = useState("");
    const [characterDescription, setCharacterDescription] = useState("");
    const [presenterFocusOpen, setPresenterFocusOpen] = useState(false);
    const [characterDescOpen, setCharacterDescOpen] = useState(false);
    const [brandMarkEnabled, setBrandMarkEnabled] = useState(false);
    const [brandMarkText, setBrandMarkText] = useState("");
    const [disableExpressions, setDisableExpressions] = useState(false);
    const [characterConsistencyEnabled, setCharacterConsistencyEnabled] = useState(false);

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

    const canGenerate = content.trim().length > 0 && !cinematicState.isGenerating;

    // When "short" is selected, force portrait format and disable landscape/square
    const disabledFormats: VideoFormat[] = length === "short" ? ["landscape", "square"] : [];
    
    // Auto-switch to portrait when short is selected and current format is disabled
    useEffect(() => {
      if (length === "short" && (format === "landscape" || format === "square")) {
        setFormat("portrait");
      }
    }, [length, format]);

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const invokeCinematic = async <T,>(body: Record<string, unknown>): Promise<T> => {
      const { data, error } = await supabase.functions.invoke("generate-cinematic", {
        body,
      });

      if (error) {
        throw new Error(error.message || "Cinematic generation failed");
      }

      return data as T;
    };

    const handleGenerate = async () => {
      if (!canGenerate) return;

      // Check for subscription issues first
      if (subscriptionStatus === "past_due" || subscriptionStatus === "unpaid") {
        setSuspendedStatus(subscriptionStatus as "past_due" | "unpaid");
        setShowSuspendedModal(true);
        return;
      }

      // Use length directly (VideoLength is compatible with backend)

      // Validate plan access
      const validation = validateGenerationAccess(
        plan,
        creditsBalance,
        "cinematic",
        length,
        format,
        brandMarkEnabled && brandMarkText.trim().length > 0,
        style === "custom",
        subscriptionStatus || undefined,
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

        // ============= PHASE 1: SCRIPT =============
        const scriptResult = await invokeCinematic<{
          success: boolean;
          projectId: string;
          generationId: string;
          title: string;
          scenes: CinematicScene[];
          sceneCount: number;
          error?: string;
        }>({
          phase: "script",
          content,
          format,
          length,
          style,
          customStyle: style === "custom" ? customStyle : undefined,
          brandMark: brandMarkEnabled && brandMarkText.trim() ? brandMarkText.trim() : undefined,
          characterDescription: characterDescription.trim() || undefined,
          presenterFocus: presenterFocus.trim() || undefined,
          disableExpressions,
          characterConsistencyEnabled,
          voiceType: voice.type,
          voiceId: voice.voiceId,
          voiceName: voice.type === "custom" ? voice.voiceName : voice.gender,
        });

        if (!scriptResult.success) throw new Error(scriptResult.error || "Script generation failed");

        const { projectId, generationId, title, scenes, sceneCount } = scriptResult;

        setCinematicState((prev) => ({
          ...prev,
          step: "audio",
          progress: 10,
          projectId,
          generationId,
          title,
          scenes,
          statusMessage: "Script complete. Generating audio...",
        }));

        // ============= PHASE 2: AUDIO (scene-by-scene, async) =============
        for (let i = 0; i < sceneCount; i++) {
          setCinematicState((prev) => ({
            ...prev,
            step: "audio",
            statusMessage: `Generating audio (${i + 1}/${sceneCount})...`,
            progress: 10 + Math.floor(((i + 0.25) / sceneCount) * 25),
          }));

          // Keep calling until this scene is complete
          while (true) {
            const audioRes = await invokeCinematic<{
              success: boolean;
              status: "processing" | "complete";
              scene: CinematicScene;
              error?: string;
            }>({
              phase: "audio",
              projectId,
              generationId,
              sceneIndex: i,
            });

            if (!audioRes.success) throw new Error(audioRes.error || "Audio generation failed");

            setCinematicState((prev) => {
              const nextScenes = Array.isArray(prev.scenes) ? [...prev.scenes] : [];
              nextScenes[i] = { ...nextScenes[i], ...audioRes.scene };
              return { ...prev, scenes: nextScenes };
            });

            if (audioRes.status === "complete") break;
            await sleep(1200);
          }

          setCinematicState((prev) => ({
            ...prev,
            progress: 10 + Math.floor(((i + 1) / sceneCount) * 25),
          }));
        }

        // ============= PHASE 3: IMAGES (scene-by-scene) =============
        setCinematicState((prev) => ({
          ...prev,
          step: "visuals",
          progress: 35,
          statusMessage: "Audio complete. Creating scene images...",
        }));

        for (let i = 0; i < sceneCount; i++) {
          setCinematicState((prev) => ({
            ...prev,
            step: "visuals",
            statusMessage: `Creating images (${i + 1}/${sceneCount})...`,
            progress: 35 + Math.floor(((i + 0.25) / sceneCount) * 25),
          }));

          const imgRes = await invokeCinematic<{
            success: boolean;
            status: "processing" | "complete";
            scene: CinematicScene;
            error?: string;
          }>({
            phase: "images",
            projectId,
            generationId,
            sceneIndex: i,
          });

          if (!imgRes.success) throw new Error(imgRes.error || "Image generation failed");

          setCinematicState((prev) => {
            const nextScenes = Array.isArray(prev.scenes) ? [...prev.scenes] : [];
            nextScenes[i] = { ...nextScenes[i], ...imgRes.scene };
            return { ...prev, scenes: nextScenes };
          });

          setCinematicState((prev) => ({
            ...prev,
            progress: 35 + Math.floor(((i + 1) / sceneCount) * 25),
          }));
        }

        // ============= PHASE 4: VIDEO (scene-by-scene, async) =============
        setCinematicState((prev) => ({
          ...prev,
          step: "visuals",
          progress: 60,
          statusMessage: "Images complete. Generating video clips with Wan 2.6...",
        }));

        for (let i = 0; i < sceneCount; i++) {
          setCinematicState((prev) => ({
            ...prev,
            step: "visuals",
            statusMessage: `Generating clips (${i + 1}/${sceneCount})...`,
            progress: 60 + Math.floor(((i + 0.25) / sceneCount) * 35),
          }));

          while (true) {
            const vidRes = await invokeCinematic<{
              success: boolean;
              status: "processing" | "complete";
              scene: CinematicScene;
              error?: string;
            }>({
              phase: "video",
              projectId,
              generationId,
              sceneIndex: i,
            });

            if (!vidRes.success) throw new Error(vidRes.error || "Video generation failed");

            setCinematicState((prev) => {
              const nextScenes = Array.isArray(prev.scenes) ? [...prev.scenes] : [];
              nextScenes[i] = { ...nextScenes[i], ...vidRes.scene };
              return { ...prev, scenes: nextScenes };
            });

            if (vidRes.status === "complete") break;
            await sleep(2000);
          }

          setCinematicState((prev) => ({
            ...prev,
            progress: 60 + Math.floor(((i + 1) / sceneCount) * 35),
          }));
        }

        // ============= PHASE 5: FINALIZE =============
        setCinematicState((prev) => ({
          ...prev,
          step: "stitching",
          progress: 96,
          statusMessage: "Finalizing cinematic...",
        }));

        const finalRes = await invokeCinematic<{
          success: boolean;
          projectId: string;
          generationId: string;
          title: string;
          scenes: CinematicScene[];
          finalVideoUrl: string;
          error?: string;
        }>({
          phase: "finalize",
          projectId,
          generationId,
        });

        if (!finalRes.success) throw new Error(finalRes.error || "Finalization failed");

        setCinematicState({
          step: "complete",
          progress: 100,
          isGenerating: false,
          projectId: finalRes.projectId,
          generationId: finalRes.generationId,
          title: finalRes.title,
          scenes: finalRes.scenes,
          finalVideoUrl: finalRes.finalVideoUrl,
          statusMessage: "Cinematic video generated!",
        });

        toast({
          title: "Cinematic Video Generated!",
          description: `"${finalRes.title}" is ready.`,
        });
      } catch (error) {
        console.error("Cinematic generation error:", error);
        const errorMessage = error instanceof Error ? error.message : "Generation failed";

        setCinematicState((prev) => ({
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
      setContent("");
      setFormat("portrait");
      setLength("brief");
      setStyle("realistic");
      setCustomStyle("");
      setCustomStyleImage(null);
      setVoice({ type: "standard", gender: "female" });
      setPresenterFocus("");
      setCharacterDescription("");
      setPresenterFocusOpen(false);
      setCharacterDescOpen(false);
      setBrandMarkEnabled(false);
      setBrandMarkText("");
      setDisableExpressions(false);
      setCharacterConsistencyEnabled(false);
    };

    const handleOpenProject = async (projectId: string) => {
      setCinematicState((prev) => ({
        ...prev,
        step: "stitching",
        progress: 95,
        isGenerating: false,
        projectId,
        statusMessage: "Loading cinematic project...",
      }));

      try {
        const { data: project, error: projectError } = await supabase
          .from("projects")
          .select("id,title,content")
          .eq("id", projectId)
          .maybeSingle();
        if (projectError) throw projectError;
        if (!project) throw new Error("Project not found");

        const { data: generation, error: genError } = await supabase
          .from("generations")
          .select("id,scenes,video_url")
          .eq("project_id", projectId)
          .eq("status", "complete")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (genError) throw genError;
        if (!generation) throw new Error("No completed cinematic generation found");

        const rawScenes = generation.scenes as any;
        const normalizedScenes: CinematicScene[] = Array.isArray(rawScenes)
          ? rawScenes.map((s: any, idx: number) => ({
              number: typeof s?.number === "number" ? s.number : idx + 1,
              voiceover: s?.voiceover ?? s?.narration ?? s?.text ?? "",
              visualPrompt:
                s?.visualPrompt ??
                s?.visual_prompt ??
                s?.visual_description ??
                s?.description ??
                "",
              videoUrl: s?.videoUrl ?? s?.video_url,
              audioUrl: s?.audioUrl ?? s?.audio_url,
              duration: typeof s?.duration === "number" ? s.duration : 8,
            }))
          : [];

        setContent(project.content ?? "");

        setCinematicState({
          step: "complete",
          progress: 100,
          isGenerating: false,
          projectId: project.id,
          generationId: generation.id,
          title: project.title,
          scenes: normalizedScenes,
          finalVideoUrl: generation.video_url ?? undefined,
          statusMessage: "Cinematic loaded",
        });
      } catch (error) {
        console.error("Failed to load cinematic project:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to load project";

        setCinematicState((prev) => ({
          ...prev,
          step: "error",
          isGenerating: false,
          error: errorMessage,
          statusMessage: errorMessage,
        }));

        toast({
          variant: "destructive",
          title: "Failed to load project",
          description: errorMessage,
        });
      }
    };

    // Load project from URL if provided
    useEffect(() => {
      if (initialProjectId) {
        void handleOpenProject(initialProjectId);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialProjectId]);

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
                className="flex items-center gap-2 rounded-full bg-primary/10 px-3 sm:px-4 py-1.5"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="text-xs sm:text-sm font-medium text-primary">Creating cinematic...</span>
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
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
                      <Film className="h-3.5 w-3.5" />
                      Cinematic - Beta
                    </div>
                    <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                      Create Cinematic Video
                    </h1>
                    <p className="mt-1.5 sm:mt-2 text-sm text-muted-foreground/70">
                      Transform your ideas into cinematic AI-generated videos using Replicate + Wan 2.6
                    </p>
                  </div>

                  {/* Content Input */}
                  <ContentInput content={content} onContentChange={setContent} />

                  {/* Collapsible Advanced Options */}
                  <div className="space-y-2 sm:space-y-3">
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

                    {/* Presenter Focus - Collapsible */}
                    <Collapsible open={presenterFocusOpen} onOpenChange={setPresenterFocusOpen}>
                      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl sm:rounded-2xl border border-border/50 bg-card/50 p-3 sm:p-4 backdrop-blur-sm shadow-sm hover:bg-muted/30 transition-colors">
                        <span className="text-xs sm:text-sm font-medium flex items-center gap-2">
                          <Lightbulb className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          Presenter Focus
                        </span>
                        <ChevronDown className={`h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform duration-200 ${presenterFocusOpen ? "rotate-180" : ""}`} />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="rounded-b-xl sm:rounded-b-2xl border border-t-0 border-border/50 bg-card/50 p-4 sm:p-6 backdrop-blur-sm shadow-sm -mt-2">
                          <PresenterFocusInput value={presenterFocus} onChange={setPresenterFocus} />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Disable Expressions Toggle */}
                    <div className="flex items-center gap-2 sm:gap-3 rounded-xl sm:rounded-2xl border border-border/50 bg-card/50 p-3 sm:p-4 backdrop-blur-sm shadow-sm">
                      <Checkbox
                        id="disable-expressions"
                        checked={disableExpressions}
                        onCheckedChange={(checked) => setDisableExpressions(checked === true)}
                      />
                      <label
                        htmlFor="disable-expressions"
                        className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium cursor-pointer flex-wrap"
                      >
                        <MessageSquareOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                        <span>Disable voice expressions</span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground/70">(no [chuckle], [sigh], etc.)</span>
                      </label>
                    </div>

                    {/* Character Consistency Toggle - Pro Feature */}
                    <CharacterConsistencyToggle
                      enabled={characterConsistencyEnabled}
                      onToggle={setCharacterConsistencyEnabled}
                    />
                  </div>

                  {/* Configuration */}
                  <div className="space-y-4 sm:space-y-6 rounded-xl sm:rounded-2xl border border-border/50 bg-card/50 p-3 sm:p-6 backdrop-blur-sm shadow-sm overflow-hidden">
                    <FormatSelector selected={format} onSelect={setFormat} disabledFormats={disabledFormats} />
                    <div className="h-px bg-border/30" />
                    
                    {/* Length and Voice side by side on desktop, stacked on mobile */}
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                      <div className="flex-1">
                        <LengthSelector selected={length} onSelect={setLength} />
                      </div>
                      <div className="sm:flex-shrink-0">
                        <VoiceSelector selected={voice} onSelect={setVoice} />
                      </div>
                    </div>
                    
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
                      className="w-full gap-2 sm:gap-2.5 rounded-full bg-primary py-5 sm:py-6 text-sm sm:text-base font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md disabled:opacity-40"
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
                  <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-8 text-center">
                    <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
                    <h2 className="text-xl font-semibold text-foreground mb-2">Cinematic Generation Failed</h2>
                    <p className="text-muted-foreground mb-6">{getUserFriendlyErrorMessage(cinematicState.error)}</p>
                    <Button onClick={() => { handleNewProject(); }} variant="outline" className="gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Try Again
                    </Button>
                  </div>
                </motion.div>
              ) : cinematicState.step === "complete" && cinematicState.scenes && cinematicState.scenes.length > 0 ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-5xl mx-auto"
                >
                  <CinematicResult
                    title={cinematicState.title || "Untitled Cinematic"}
                    scenes={cinematicState.scenes}
                    projectId={cinematicState.projectId}
                    generationId={cinematicState.generationId}
                    finalVideoUrl={cinematicState.finalVideoUrl}
                    onNewProject={handleNewProject}
                    format={format}
                  />
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
                    <Loader2 className="h-12 w-12 mx-auto text-primary mb-4 animate-spin" />
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
                        className="bg-primary h-2 rounded-full transition-all duration-500" 
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
