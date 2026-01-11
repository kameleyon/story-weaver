import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, Sparkles } from "lucide-react";
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
      className="space-y-6 rounded-2xl border bg-card p-6"
    >
      <div className="flex items-center gap-3">
        <motion.div
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-pop"
          animate={{ rotate: state.isGenerating ? 360 : 0 }}
          transition={{ duration: 2, repeat: state.isGenerating ? Infinity : 0, ease: "linear" }}
        >
          <Sparkles className="h-5 w-5 text-brand-dark" />
        </motion.div>
        <div>
          <h3 className="font-semibold">
            {state.step === "complete" ? "Video Ready!" : "Generating Your Video"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {state.step === "complete"
              ? "Your video has been created successfully"
              : "This will take about 15 seconds"}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {steps.map((step, index) => {
          const isActive = state.step === step.id;
          const isComplete = currentStepIndex > index || state.step === "complete";
          const isPending = currentStepIndex < index && state.step !== "complete";

          return (
            <div key={step.id} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <motion.div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                    isComplete && "border-brand-accent bg-brand-accent text-white",
                    isActive && "border-brand-pop bg-brand-pop/10",
                    isPending && "border-muted bg-muted"
                  )}
                  animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.5, repeat: isActive ? Infinity : 0 }}
                >
                  {isComplete ? (
                    <Check className="h-4 w-4" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin text-brand-pop" />
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground">{index + 1}</span>
                  )}
                </motion.div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "h-8 w-0.5 transition-colors",
                      isComplete ? "bg-brand-accent" : "bg-muted"
                    )}
                  />
                )}
              </div>

              <div className="flex-1 pt-1">
                <p
                  className={cn(
                    "font-medium transition-colors",
                    isComplete && "text-brand-accent",
                    isActive && "text-foreground",
                    isPending && "text-muted-foreground"
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
                      <p className="text-sm text-muted-foreground">
                        {step.id === "visuals"
                          ? `Creating images for scene ${state.currentScene}/${state.sceneCount}...`
                          : step.description}
                      </p>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className="h-full bg-gradient-to-r from-brand-accent to-brand-pop"
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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl bg-brand-surface/50 p-4 dark:bg-brand-dark/30"
          >
            <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
              <div className="text-center">
                <Sparkles className="mx-auto h-12 w-12 text-brand-accent" />
                <p className="mt-2 font-medium">Video Preview</p>
                <p className="text-sm text-muted-foreground">8 scenes generated</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <motion.button
                className="flex-1 rounded-xl bg-brand-pop py-2.5 font-medium text-brand-dark"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Download
              </motion.button>
              <motion.button
                className="flex-1 rounded-xl border border-border py-2.5 font-medium"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Share
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
