import { useState, forwardRef, useImperativeHandle, useEffect } from "react";
import { Play, Menu, AlertCircle, RotateCcw, ChevronDown, Users, Headphones } from "lucide-react";
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
import { useGenerationPipeline } from "@/hooks/useGenerationPipeline";
import { ThemedLogo } from "@/components/ThemedLogo";
import type { WorkspaceHandle } from "./Doc2VideoWorkspace";

interface StorytellingWorkspaceProps {
  projectId?: string | null;
}

export const StorytellingWorkspace = forwardRef<WorkspaceHandle, StorytellingWorkspaceProps>(
  function StorytellingWorkspace({ projectId: initialProjectId }, ref) {
    // Story-specific inputs
    const [storyIdea, setStoryIdea] = useState("");
    const [inspiration, setInspiration] = useState<InspirationStyle>("none");
    const [tone, setTone] = useState<StoryTone>("casual");
    const [genre, setGenre] = useState<StoryGenre>("documentary");
    const [disableVoiceExpressions, setDisableVoiceExpressions] = useState(false);
    const [brandName, setBrandName] = useState("");
    
    // Shared inputs
    const [format, setFormat] = useState<VideoFormat>("portrait");
    const [length, setLength] = useState<StoryLength>("brief");
    const [style, setStyle] = useState<VisualStyle>("minimalist");
    const [customStyle, setCustomStyle] = useState("");
    const [voice, setVoice] = useState<VoiceSelection>({ type: "standard", gender: "female" });
    const [characterDescription, setCharacterDescription] = useState("");
    const [characterDescOpen, setCharacterDescOpen] = useState(false);
    const [brandMarkEnabled, setBrandMarkEnabled] = useState(false);
    const [brandMarkText, setBrandMarkText] = useState("");

    const { state: generationState, startGeneration, reset, loadProject } = useGenerationPipeline();

    const canGenerate = storyIdea.trim().length > 0 && !generationState.isGenerating;

    // Load project if projectId provided
    useEffect(() => {
      if (initialProjectId) {
        handleOpenProject(initialProjectId);
      }
    }, [initialProjectId]);

    const handleGenerate = () => {
      if (canGenerate) {
        // Map story length to standard length for backend
        const lengthMap: Record<StoryLength, string> = {
          short: "short",
          brief: "brief",
          extended: "presentation",
        };

        startGeneration({
          content: storyIdea,
          format,
          length: lengthMap[length],
          style,
          customStyle: style === "custom" ? customStyle : undefined,
          brandMark: brandMarkEnabled && brandMarkText.trim() ? brandMarkText.trim() : undefined,
          characterDescription: characterDescription.trim() || undefined,
          projectType: "storytelling",
          inspirationStyle: inspiration !== "none" ? inspiration : undefined,
          storyTone: tone,
          storyGenre: genre,
          disableExpressions: disableVoiceExpressions,
          brandName: brandName.trim() || undefined,
        });
      }
    };

    const handleNewProject = () => {
      reset();
      setStoryIdea("");
      setInspiration("none");
      setTone("casual");
      setGenre("documentary");
      setDisableVoiceExpressions(false);
      setBrandName("");
      setFormat("portrait");
      setLength("brief");
      setStyle("minimalist");
      setCustomStyle("");
      setVoice({ type: "standard", gender: "female" });
      setCharacterDescription("");
      setCharacterDescOpen(false);
      setBrandMarkEnabled(false);
      setBrandMarkText("");
    };

    const handleOpenProject = async (projectId: string) => {
      const project = await loadProject(projectId);
      if (!project) return;

      setStoryIdea(project.content ?? "");

      const nextFormat = (project.format as VideoFormat) ?? "portrait";
      setFormat(["landscape", "portrait", "square"].includes(nextFormat) ? nextFormat : "portrait");

      // Map project length to story length
      const projectLength = project.length as string;
      if (projectLength === "presentation") {
        setLength("extended");
      } else if (projectLength === "short") {
        setLength("short");
      } else {
        setLength("brief");
      }

      const savedStyle = (project.style ?? "minimalist") as VisualStyle;
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
        <header className="flex h-14 sm:h-16 items-center justify-between border-b border-border/30 bg-background/80 px-4 sm:px-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 sm:gap-4">
            <SidebarTrigger className="lg:hidden">
              <Menu className="h-5 w-5 text-muted-foreground" />
            </SidebarTrigger>
            <div className="hidden lg:flex items-center gap-3">
              <ThemedLogo className="h-10 w-auto" />
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {generationState.step !== "idle" && generationState.step !== "complete" && generationState.step !== "error" && (
              <motion.div
                className="flex items-center gap-2 rounded-full bg-primary/10 px-3 sm:px-4 py-1.5"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                <span className="text-xs sm:text-sm font-medium text-primary">Creating story...</span>
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
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
                      <Headphones className="h-3.5 w-3.5" />
                      Storytelling Mode
                    </div>
                    <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                      Create Your Story
                    </h1>
                    <p className="mt-1.5 sm:mt-2 text-sm text-muted-foreground/70">
                      Turn your ideas into compelling visual narratives
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
                    <FormatSelector selected={format} onSelect={setFormat} />
                    <div className="h-px bg-border/30" />
                    <StorytellingLengthSelector selected={length} onSelect={setLength} />
                    <div className="h-px bg-border/30" />
                    <StyleSelector
                      selected={style}
                      customStyle={customStyle}
                      onSelect={setStyle}
                      onCustomStyleChange={setCustomStyle}
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
                      Create Story
                    </Button>
                  </motion.div>
                </motion.div>
              ) : generationState.step === "error" ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-2xl mx-auto space-y-6"
                >
                  <div className="rounded-2xl border border-primary/50 bg-primary/10 p-8 text-center">
                    <AlertCircle className="h-12 w-12 mx-auto text-primary mb-4" />
                    <h2 className="text-xl font-semibold text-foreground mb-2">Story Generation Failed</h2>
                    <p className="text-muted-foreground mb-6">{generationState.error}</p>
                    <Button onClick={() => { reset(); }} variant="outline" className="gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Try Again
                    </Button>
                  </div>
                </motion.div>
              ) : generationState.step === "complete" && generationState.scenes ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <GenerationResult
                    title={generationState.title || "Untitled Story"}
                    scenes={generationState.scenes}
                    format={generationState.format || format}
                    onNewProject={handleNewProject}
                    totalTimeMs={generationState.totalTimeMs}
                    costTracking={generationState.costTracking}
                    generationId={generationState.generationId}
                    projectId={generationState.projectId}
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
