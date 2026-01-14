import { useState, forwardRef, useImperativeHandle } from "react";
import { Play, Menu, AlertCircle, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ContentInput } from "./ContentInput";
import { FormatSelector, type VideoFormat } from "./FormatSelector";
import { LengthSelector, type VideoLength } from "./LengthSelector";
import { StyleSelector, type VisualStyle } from "./StyleSelector";
import { GenerationProgress } from "./GenerationProgress";
import { GenerationResult } from "./GenerationResult";
import { useGenerationPipeline } from "@/hooks/useGenerationPipeline";
import { ThemedLogo } from "@/components/ThemedLogo";

export interface WorkspaceHandle {
  resetWorkspace: () => void;
  openProject: (projectId: string) => Promise<void>;
}

export const Workspace = forwardRef<WorkspaceHandle>(function Workspace(_, ref) {
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<VideoFormat>("landscape");
  const [length, setLength] = useState<VideoLength>("brief");
  const [style, setStyle] = useState<VisualStyle>("minimalist");
  const [customStyle, setCustomStyle] = useState("");

  const { state: generationState, startGeneration, reset, loadProject } = useGenerationPipeline();

  const canGenerate = content.trim().length > 0 && !generationState.isGenerating;

  const handleGenerate = () => {
    if (canGenerate) {
      startGeneration({
        content,
        format,
        length,
        style,
        customStyle: style === "custom" ? customStyle : undefined,
      });
    }
  };

  const handleNewProject = () => {
    reset();
    setContent("");
    setFormat("landscape");
    setLength("brief");
    setStyle("minimalist");
    setCustomStyle("");
  };

  const handleOpenProject = async (projectId: string) => {
    const project = await loadProject(projectId);
    if (!project) return;

    setContent(project.content ?? "");

    const nextFormat = (project.format as VideoFormat) ?? "landscape";
    setFormat(["landscape", "portrait", "square"].includes(nextFormat) ? nextFormat : "landscape");

    const nextLength = (project.length as VideoLength) ?? "brief";
    setLength(["short", "brief", "presentation"].includes(nextLength) ? nextLength : "brief");

    const savedStyle = (project.style ?? "minimalist") as VisualStyle;
    if (
      savedStyle === "minimalist" ||
      savedStyle === "doodle" ||
      savedStyle === "stick" ||
      savedStyle === "anime" ||
      savedStyle === "realistic" ||
      savedStyle === "3d-pixar" ||
      savedStyle === "claymation" ||
      savedStyle === "futuristic" ||
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
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top Bar */}
      <header className="flex h-16 items-center justify-between border-b border-border/30 bg-background/80 px-6 backdrop-blur-sm">
        <div className="flex items-center gap-4">
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
              className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="text-sm font-medium text-primary">Generating...</span>
            </motion.div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <AnimatePresence mode="wait">
            {generationState.step === "idle" ? (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                {/* Hero */}
                <div className="text-center">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    What would you like to create?
                  </h1>
                  <p className="mt-2 text-muted-foreground/70">
                    Paste your content or describe your video idea
                  </p>
                </div>

                {/* Content Input */}
                <ContentInput content={content} onContentChange={setContent} />

                {/* Configuration */}
                <div className="space-y-6 rounded-2xl border border-border/50 bg-card/50 p-6 backdrop-blur-sm">
                  <FormatSelector selected={format} onSelect={setFormat} />
                  <div className="h-px bg-border/30" />
                  <LengthSelector selected={length} onSelect={setLength} />
                  <div className="h-px bg-border/30" />
                  <StyleSelector
                    selected={style}
                    customStyle={customStyle}
                    onSelect={setStyle}
                    onCustomStyleChange={setCustomStyle}
                  />
                </div>

                {/* Generate Button */}
                <motion.div whileHover={{ scale: canGenerate ? 1.01 : 1 }} whileTap={{ scale: canGenerate ? 0.99 : 1 }}>
                  <Button
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="w-full gap-2.5 rounded-full bg-primary py-6 text-base font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md disabled:opacity-40"
                  >
                    <Play className="h-4 w-4" />
                    Generate Video
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
                <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-8 text-center">
                  <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
                  <h2 className="text-xl font-semibold text-foreground mb-2">Generation Failed</h2>
                  <p className="text-muted-foreground mb-6">{generationState.error}</p>
                  <Button onClick={handleNewProject} variant="outline" className="gap-2">
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
                  title={generationState.title || "Untitled Video"}
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
});