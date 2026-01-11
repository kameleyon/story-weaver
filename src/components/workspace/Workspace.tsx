import { useState } from "react";
import { Sparkles, PanelLeftClose } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContentInput } from "./ContentInput";
import { FormatSelector, type VideoFormat } from "./FormatSelector";
import { LengthSelector, type VideoLength } from "./LengthSelector";
import { StyleSelector, type VisualStyle } from "./StyleSelector";
import { GenerationProgress } from "./GenerationProgress";
import { useGenerationPipeline } from "@/hooks/useGenerationPipeline";

export function Workspace() {
  const [projectName, setProjectName] = useState("Untitled Project");
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<VideoFormat>("landscape");
  const [length, setLength] = useState<VideoLength>("brief");
  const [style, setStyle] = useState<VisualStyle>("minimalist");
  const [customStyle, setCustomStyle] = useState("");

  const { state: generationState, startGeneration, reset } = useGenerationPipeline();

  const canGenerate = content.trim().length > 0 && !generationState.isGenerating;

  const handleGenerate = () => {
    if (canGenerate) {
      startGeneration();
    }
  };

  const handleNewProject = () => {
    reset();
    setContent("");
    setProjectName("Untitled Project");
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top Bar */}
      <header className="flex h-14 items-center gap-4 border-b bg-card/50 px-4">
        <SidebarTrigger>
          <PanelLeftClose className="h-5 w-5" />
        </SidebarTrigger>
        <Input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="max-w-xs border-none bg-transparent text-lg font-medium focus-visible:ring-0"
        />
        <div className="ml-auto flex items-center gap-2">
          {generationState.step !== "idle" && generationState.step !== "complete" && (
            <motion.span
              className="flex items-center gap-2 rounded-full bg-brand-pop/20 px-3 py-1 text-sm text-brand-primary"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand-pop" />
              Generating...
            </motion.span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <AnimatePresence mode="wait">
            {generationState.step === "idle" ? (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Hero Text */}
                <div className="text-center">
                  <h1 className="text-3xl font-bold">What would you like to create?</h1>
                  <p className="mt-2 text-muted-foreground">
                    Paste your content or upload a file to get started
                  </p>
                </div>

                {/* Content Input */}
                <ContentInput content={content} onContentChange={setContent} />

                {/* Configuration */}
                <div className="space-y-6 rounded-2xl border bg-card p-6">
                  <h2 className="font-semibold">Configure Your Video</h2>
                  <FormatSelector selected={format} onSelect={setFormat} />
                  <LengthSelector selected={length} onSelect={setLength} />
                  <StyleSelector
                    selected={style}
                    customStyle={customStyle}
                    onSelect={setStyle}
                    onCustomStyleChange={setCustomStyle}
                  />
                </div>

                {/* Generate Button */}
                <motion.div whileHover={{ scale: canGenerate ? 1.02 : 1 }} whileTap={{ scale: canGenerate ? 0.98 : 1 }}>
                  <Button
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="w-full gap-2 bg-brand-pop py-6 text-lg font-semibold text-brand-dark hover:bg-brand-light disabled:opacity-50"
                  >
                    <Sparkles className="h-5 w-5" />
                    Generate Video
                  </Button>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="progress"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <GenerationProgress state={generationState} />
                
                {generationState.step === "complete" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    <Button
                      onClick={handleNewProject}
                      variant="outline"
                      className="w-full"
                    >
                      Create Another Video
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
