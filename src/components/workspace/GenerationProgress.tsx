import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Wand2, Wallpaper, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GenerationState } from "@/hooks/useGenerationPipeline";

interface GenerationProgressProps {
  state: GenerationState;
  onRetry?: () => void;
}

export function GenerationProgress({ state, onRetry }: GenerationProgressProps) {
  const isSmartFlow = state.projectType === "smartflow";

  // Timer tick to ensure time-based UI (like the 60s safety-valve button)
  // can appear even if the backend stops sending progress updates.
  const [now, setNow] = useState(() => Date.now());

  // Detect when generation appears stuck (no meaningful progress updates)
  // and show a recovery button as a safety valve.
  const generationStartRef = useRef<number>(Date.now());
  const lastChangeAtRef = useRef<number>(Date.now());
  const lastSignatureRef = useRef<string>("");
  const [isStuck, setIsStuck] = useState(false);

  // Shorter, more responsive thresholds - if nothing changes for this long, something's wrong
  const STUCK_THRESHOLD_MS = 90 * 1000; // 90 seconds of no change = stuck
  const MIN_GENERATION_TIME_FOR_BUTTON_MS = 60 * 1000; // Always show button after 60s as safety valve

  // Detect state inconsistencies that indicate a stalled pipeline
  const hasStateInconsistency = useMemo(() => {
    const msg = state.statusMessage?.toLowerCase() || "";
    
    // Status says something is complete but step doesn't match
    if (msg.includes("script complete") && state.step === "scripting" && state.progress < 15) {
      return true;
    }
    if (msg.includes("audio complete") && state.step === "visuals" && state.progress < 50) {
      return true;
    }
    if (msg.includes("images complete") && state.step === "visuals" && state.progress < 90) {
      return true;
    }
    // Progress says ready for next phase but step hasn't advanced
    if (msg.includes("ready for") && state.progress < 20) {
      return true;
    }
    
    return false;
  }, [state.statusMessage, state.step, state.progress]);

  const signature = useMemo(() => {
    // Only include fields that should change when real progress happens.
    // Exclude statusMessage from signature to avoid false positives from repeated status updates
    return JSON.stringify({
      step: state.step,
      progress: Math.round(state.progress),
      currentScene: state.currentScene,
      completedImages: state.completedImages,
      totalImages: state.totalImages,
      error: state.error,
    });
  }, [
    state.step,
    state.progress,
    state.currentScene,
    state.completedImages,
    state.totalImages,
    state.error,
  ]);

  // Track when generation starts
  useEffect(() => {
    if (state.isGenerating && state.step !== "complete" && state.step !== "error") {
      generationStartRef.current = Date.now();
    }
  }, [state.isGenerating, state.step]);

  // Force re-render while generating so `MIN_GENERATION_TIME_FOR_BUTTON_MS` can be evaluated.
  useEffect(() => {
    if (!state.isGenerating || state.step === "complete" || state.step === "error") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.isGenerating, state.step]);

  useEffect(() => {
    if (signature !== lastSignatureRef.current) {
      lastSignatureRef.current = signature;
      lastChangeAtRef.current = Date.now();
      setIsStuck(false);
    }
  }, [signature]);

  useEffect(() => {
    // Reset any stuck state when generation is not active or is done.
    if (!state.isGenerating || state.step === "complete" || state.step === "error") {
      setIsStuck(false);
      return;
    }

    const id = window.setInterval(() => {
      const elapsed = Date.now() - lastChangeAtRef.current;
      const totalElapsed = Date.now() - generationStartRef.current;
      
      // Mark as stuck if:
      // 1. No progress change for STUCK_THRESHOLD_MS, OR
      // 2. State inconsistency detected (status/step mismatch), OR
      // 3. Been generating for a while with no completion in sight
      const noProgressForTooLong = elapsed >= STUCK_THRESHOLD_MS;
      const inconsistentState = hasStateInconsistency && totalElapsed > 30000; // Give 30s before flagging inconsistency
      
      setIsStuck(noProgressForTooLong || inconsistentState);
    }, 2000);

    return () => window.clearInterval(id);
  }, [state.isGenerating, state.step, hasStateInconsistency]);

  // Show the recovery button if stuck OR if generation has been running long enough
  const showRecoveryButton = useMemo(() => {
    if (!state.isGenerating || state.step === "complete") return false;
    if (state.step === "error") return true; // Always show on error
    
    const totalElapsed = now - generationStartRef.current;
    return isStuck || totalElapsed >= MIN_GENERATION_TIME_FOR_BUTTON_MS;
  }, [state.isGenerating, state.step, isStuck, now]);
  
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
        if (progress < 8) return isSmartFlow ? "Analyzing your data..." : "Analyzing your content...";
        if (progress < 10) return "Generating character references..."; // Character phase for Pro users
        return isSmartFlow ? "Preparing infographic layout..." : "Preparing script generation...";
      
      case "scripting":
        if (isSmartFlow) {
          if (progress < 15) return "AI is extracting key insights...";
          if (progress < 20) return "Designing infographic concept...";
          if (progress < 30) return "Crafting visual narrative...";
          return "Finalizing infographic design...";
        }
        if (progress < 15) return "AI is writing your script...";
        if (progress < 20) return "Creating scenes and dialogue...";
        if (progress < 30) return "Generating voiceover content...";
        return "Finalizing script structure...";
      
      case "visuals":
        if (isSmartFlow) {
          if (progress < 45) {
            return "Generating narration audio...";
          }
          return "Creating your infographic...";
        }
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
        return isSmartFlow ? "Finalizing infographic..." : "Compiling your video...";
      
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
    if (isSmartFlow) {
      switch (state.step) {
        case "analysis":
          return "Step 1 of 3 • Analysis";
        case "scripting":
          return "Step 2 of 3 • Content Extraction";
        case "visuals":
          return state.progress < 45 
            ? "Step 2 of 3 • Audio Generation" 
            : "Step 3 of 3 • Image Generation";
        case "rendering":
          return "Step 3 of 3 • Finalizing";
        case "complete":
          return "Complete";
        default:
          return "Processing";
      }
    }
    
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
          ) : isSmartFlow ? (
            <Wallpaper className="h-6 w-6 text-primary" />
          ) : (
            <Wand2 className="h-6 w-6 text-primary" />
          )}
        </motion.div>
        <div>
          <h3 className="text-xl font-semibold text-foreground">
            {isSmartFlow ? "Creating Your Infographic" : "Creating Your Video"}
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

      {/* Recovery Button - show on error, when stuck, or as safety valve after 60s */}
      {onRetry && showRecoveryButton && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <Button
            onClick={onRetry}
            variant="outline"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {state.step === "error" ? "Try Again" : "Cancel & Restart"}
          </Button>
          {state.step !== "error" && (
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              If generation looks stuck, use this to restart.
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
