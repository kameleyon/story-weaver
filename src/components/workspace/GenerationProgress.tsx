import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, Play, Download, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerationState, GenerationStep } from "@/hooks/useGenerationPipeline";

interface GenerationProgressProps {
  state: GenerationState;
}

const steps: { id: GenerationStep; label: string; description: string }[] = [
  { id: "analysis", label: "Analysis", description: "Analyzing your content..." },
  { id: "scripting", label: "Scripting", description: "Generating narration script..." },
  { id: "visuals", label: "Visuals", description: "Creating images..." },
  { id: "rendering", label: "Rendering", description: "Assembling your video..." },
];

const stepOrder: GenerationStep[] = ["analysis", "scripting", "visuals", "rendering"];

function getStepIndex(step: GenerationStep): number {
  return stepOrder.indexOf(step);
}

export function GenerationProgress({ state }: GenerationProgressProps) {
  const currentStepIndex = getStepIndex(state.step);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 rounded-2xl border border-border/50 bg-card/50 p-8 backdrop-blur-sm"
    >
      <div className="flex items-center gap-4">
        <motion.div
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10"
          animate={{ rotate: state.isGenerating ? 360 : 0 }}
          transition={{ duration: 3, repeat: state.isGenerating ? Infinity : 0, ease: "linear" }}
        >
          <Play className="h-5 w-5 text-primary" />
        </motion.div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {state.step === "complete" ? "Video Ready" : "Creating Your Video"}
          </h3>
          <p className="text-sm text-muted-foreground/70">
            {state.step === "complete"
              ? "Your video has been created successfully"
              : "This will take about 15 seconds"}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        {steps.map((step, index) => {
          const isActive = state.step === step.id;
          const isComplete = currentStepIndex > index || state.step === "complete";
          const isPending = currentStepIndex < index && state.step !== "complete";

          return (
            <div key={step.id} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <motion.div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                    isComplete && "bg-primary text-primary-foreground",
                    isActive && "bg-primary/10 text-primary ring-2 ring-primary/20",
                    isPending && "bg-muted/50 text-muted-foreground/50"
                  )}
                  animate={isActive ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 1.5, repeat: isActive ? Infinity : 0 }}
                >
                  {isComplete ? (
                    <Check className="h-4 w-4" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-xs font-medium">{index + 1}</span>
                  )}
                </motion.div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "h-10 w-px transition-colors",
                      isComplete ? "bg-primary/50" : "bg-border/50"
                    )}
                  />
                )}
              </div>

              <div className="flex-1 pt-1 pb-2">
                <p
                  className={cn(
                    "font-medium transition-colors",
                    isComplete && "text-primary",
                    isActive && "text-foreground",
                    isPending && "text-muted-foreground/50"
                  )}
                >
                  {step.label}
                </p>
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 space-y-2"
                    >
                      <p className="text-sm text-muted-foreground/70">
                        {step.id === "visuals"
                          ? `Creating scene ${state.currentScene} of ${state.sceneCount}...`
                          : step.description}
                      </p>
                      <div className="h-1 overflow-hidden rounded-full bg-muted/30">
                        <motion.div
                          className="h-full bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${state.progress}%` }}
                          transition={{ duration: 0.1 }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {state.step === "complete" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl bg-muted/30 p-5"
          >
            <div className="flex aspect-video items-center justify-center rounded-lg bg-muted/50">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Play className="h-6 w-6 text-primary" />
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">Video Preview</p>
                <p className="text-xs text-muted-foreground/70">8 scenes generated</p>
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <motion.button
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Download className="h-4 w-4" />
                Download
              </motion.button>
              <motion.button
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border/50 bg-background py-3 text-sm font-medium transition-colors hover:bg-muted/30"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Share2 className="h-4 w-4" />
                Share
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
