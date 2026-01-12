import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerationState, GenerationStep } from "@/hooks/useGenerationPipeline";

interface GenerationProgressProps {
  state: GenerationState;
}

type VisualStep = "analysis" | "scripting" | "visuals";

const steps: { id: VisualStep; label: string; description: string }[] = [
  { id: "analysis", label: "Analyzing Content", description: "Understanding your content..." },
  { id: "scripting", label: "Writing Script", description: "Creating scenes and narration..." },
  { id: "visuals", label: "Generating Visuals", description: "Creating AI-powered images..." },
];

const stepOrder: VisualStep[] = ["analysis", "scripting", "visuals"];

function getStepIndex(step: GenerationStep): number {
  if (step === "idle" || step === "error") return -1;
  if (step === "complete" || step === "rendering") return stepOrder.length;
  return stepOrder.indexOf(step as VisualStep);
}

export function GenerationProgress({ state }: GenerationProgressProps) {
  const effectiveStep: GenerationStep = state.step === "rendering" ? "visuals" : state.step;
  const currentStepIndex = getStepIndex(effectiveStep);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 rounded-2xl border border-border/50 bg-card/50 p-8 backdrop-blur-sm"
    >
      <div className="flex items-center gap-4">
        <motion.div
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10"
          animate={{ scale: state.isGenerating ? [1, 1.1, 1] : 1 }}
          transition={{ duration: 2, repeat: state.isGenerating ? Infinity : 0, ease: "easeInOut" }}
        >
          <Sparkles className="h-5 w-5 text-primary" />
        </motion.div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Creating Your Video
          </h3>
          <p className="text-sm text-muted-foreground/70">
            AI is generating your script and visuals...
          </p>
        </div>
      </div>

      <div className="space-y-1">
        {steps.map((step, index) => {
          const isActive = effectiveStep === step.id;
          const isComplete = currentStepIndex > index || effectiveStep === "complete";
          const isPending = currentStepIndex < index && effectiveStep !== "complete";

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
                          ? `Creating scene ${Math.max(1, state.currentScene)} of ${state.sceneCount}...`
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

    </motion.div>
  );
}
