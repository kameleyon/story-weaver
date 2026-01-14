import { motion } from "framer-motion";
import { Loader2, Sparkles, Clock, DollarSign, Hash } from "lucide-react";
import type { GenerationState } from "@/hooks/useGenerationPipeline";

interface GenerationProgressProps {
  state: GenerationState;
  totalGenerations?: number;
  totalApiCost?: number;
}

export function GenerationProgress({ state, totalGenerations, totalApiCost }: GenerationProgressProps) {
  // Build verbose status message based on current step and progress
  const getStatusMessage = (): string => {
    // If we have a custom status message from the backend, use it
    if (state.statusMessage) {
      return state.statusMessage;
    }
    
    const { step, progress, currentScene, sceneCount, completedImages, totalImages } = state;
    
    switch (step) {
      case "analysis":
        if (progress < 5) return "Starting generation...";
        if (progress < 10) return "Analyzing your content...";
        return "Preparing script generation...";
      
      case "scripting":
        if (progress < 15) return "AI is writing your script...";
        if (progress < 20) return "Creating scenes and dialogue...";
        if (progress < 30) return "Generating voiceover content...";
        return "Finalizing script structure...";
      
      case "visuals":
        if (progress < 45) {
          // Audio phase (40-45% is audio)
          const audioProgress = currentScene || 1;
          return `Generating voiceover audio... (${audioProgress}/${sceneCount} scenes)`;
        }
        // Image phase (45-90%)
        if (totalImages > 0 && completedImages >= 0) {
          return `Creating visuals... (${completedImages}/${totalImages} images)`;
        }
        return `Generating scene images... (${currentScene}/${sceneCount})`;
      
      case "rendering":
        return "Compiling your video...";
      
      case "complete":
        return "Generation complete!";
      
      case "error":
        return state.error || "An error occurred";
      
      default:
        return "Processing...";
    }
  };

  // Get step label for the header
  const getStepLabel = (): string => {
    switch (state.step) {
      case "analysis":
        return "Step 1 of 4 • Analysis";
      case "scripting":
        return "Step 2 of 4 • Script Generation";
      case "visuals":
        return state.progress < 45 
          ? "Step 3 of 4 • Audio Generation" 
          : "Step 3 of 4 • Image Generation";
      case "rendering":
        return "Step 4 of 4 • Finalizing";
      case "complete":
        return "Complete";
      default:
        return "Processing";
    }
  };

  // Format cost with proper decimal places
  const formatCost = (cost: number): string => {
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    if (cost < 1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
  };

  // Format time in human readable format
  const formatTime = (ms: number): string => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 rounded-2xl border border-border/50 bg-card/50 p-8 backdrop-blur-sm max-w-lg mx-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <motion.div
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10"
          animate={{ scale: state.isGenerating ? [1, 1.05, 1] : 1 }}
          transition={{ duration: 2, repeat: state.isGenerating ? Infinity : 0, ease: "easeInOut" }}
        >
          {state.isGenerating ? (
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          ) : (
            <Sparkles className="h-6 w-6 text-primary" />
          )}
        </motion.div>
        <div>
          <h3 className="text-xl font-semibold text-foreground">
            Creating Your Video
          </h3>
          <p className="text-sm text-muted-foreground">
            {getStepLabel()}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-2xl font-bold text-foreground">
            {Math.round(state.progress)}%
          </span>
          <span className="text-sm text-muted-foreground">
            {state.progress < 100 ? "In progress..." : "Done!"}
          </span>
        </div>
        
        <div className="h-3 overflow-hidden rounded-full bg-muted/30">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${state.progress}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Verbose Status */}
      <div className="rounded-lg bg-muted/20 px-4 py-3 border border-border/30">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <motion.div
              className="h-2 w-2 rounded-full bg-primary"
              animate={{ opacity: state.isGenerating ? [1, 0.4, 1] : 1 }}
              transition={{ duration: 1.5, repeat: state.isGenerating ? Infinity : 0 }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {getStatusMessage()}
            </p>
            {state.step === "visuals" && state.totalImages > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                This may take a few minutes depending on the number of scenes
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Scene/Image breakdown when in visuals step */}
      {state.step === "visuals" && state.sceneCount > 0 && (
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="rounded-lg bg-muted/10 px-3 py-2">
            <p className="text-lg font-semibold text-foreground">{state.sceneCount}</p>
            <p className="text-xs text-muted-foreground">Total Scenes</p>
          </div>
          <div className="rounded-lg bg-muted/10 px-3 py-2">
            <p className="text-lg font-semibold text-foreground">
              {state.totalImages > 0 ? `${state.completedImages}/${state.totalImages}` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Images Generated</p>
          </div>
        </div>
      )}

      {/* Current Generation Cost & Time (show when complete or when we have data) */}
      {(state.step === "complete" || state.costTracking || state.phaseTimings) && (
        <div className="space-y-3 pt-2 border-t border-border/30">
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            This Generation
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {state.costTracking?.estimatedCostUsd !== undefined && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/10 px-3 py-2">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatCost(state.costTracking.estimatedCostUsd)}
                  </p>
                  <p className="text-xs text-muted-foreground">API Cost</p>
                </div>
              </div>
            )}
            {state.totalTimeMs !== undefined && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/10 px-3 py-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatTime(state.totalTimeMs)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Time</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Total Generations & Cumulative Cost (always show if data is available) */}
      {(totalGenerations !== undefined || totalApiCost !== undefined) && (
        <div className="space-y-3 pt-2 border-t border-border/30">
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            All-Time Stats
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {totalGenerations !== undefined && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/10 px-3 py-2">
                <Hash className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {totalGenerations}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Generations</p>
                </div>
              </div>
            )}
            {totalApiCost !== undefined && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/10 px-3 py-2">
                <DollarSign className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {formatCost(totalApiCost)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total API Cost</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}