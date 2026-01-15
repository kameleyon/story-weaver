import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, RefreshCw, Loader2, Wand2, Volume2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Scene } from "@/hooks/useGenerationPipeline";

interface SceneEditModalProps {
  scene: Scene;
  sceneIndex: number;
  format: "landscape" | "portrait" | "square";
  onClose: () => void;
  onRegenerateAudio: (sceneIndex: number, newVoiceover: string) => Promise<void>;
  onRegenerateImage: (sceneIndex: number, imageModification: string) => Promise<void>;
  isRegenerating: boolean;
  regeneratingType: "audio" | "image" | null;
}

export function SceneEditModal({
  scene,
  sceneIndex,
  format,
  onClose,
  onRegenerateAudio,
  onRegenerateImage,
  isRegenerating,
  regeneratingType,
}: SceneEditModalProps) {
  const [voiceover, setVoiceover] = useState(scene.voiceover);
  const [imageModification, setImageModification] = useState("");
  const [hasScriptChanges, setHasScriptChanges] = useState(false);

  const aspectClass =
    format === "portrait" ? "aspect-[9/16]" : format === "square" ? "aspect-square" : "aspect-video";

  const currentImages = scene.imageUrls?.length ? scene.imageUrls : scene.imageUrl ? [scene.imageUrl] : [];

  const handleVoiceoverChange = (value: string) => {
    setVoiceover(value);
    setHasScriptChanges(value !== scene.voiceover);
  };

  const handleSaveScript = async () => {
    if (!hasScriptChanges) return;
    await onRegenerateAudio(sceneIndex, voiceover);
    setHasScriptChanges(false);
  };

  const handleModifyImage = async () => {
    if (!imageModification.trim()) return;
    await onRegenerateImage(sceneIndex, imageModification);
    setImageModification("");
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isRegenerating) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-4xl max-h-[90vh] flex flex-col"
        >
          <Card className="bg-card border-border overflow-hidden rounded-xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h2 className="text-lg font-semibold text-foreground">
                Edit Scene {scene.number}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                disabled={isRegenerating}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div 
              className="p-6 space-y-6 overflow-y-auto scrollbar-thin"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'hsl(var(--brand-accent)) transparent',
              }}
            >
              {/* Image Preview & Modification */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  <Label className="text-base font-medium">Image</Label>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Current Image */}
                  <div className={cn("relative rounded-lg overflow-hidden bg-muted/50", aspectClass)}>
                    {currentImages[0] ? (
                      <img
                        src={currentImages[0]}
                        alt={`Scene ${scene.number}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        No image
                      </div>
                    )}
                    {isRegenerating && regeneratingType === "image" && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                          <p className="text-sm text-white">Regenerating image...</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Image Modification Input */}
                  <div className="space-y-3">
                    <Label className="text-sm text-muted-foreground">
                      Describe what you want to change
                    </Label>
                    <Textarea
                      value={imageModification}
                      onChange={(e) => setImageModification(e.target.value)}
                      placeholder="e.g., Make the background blue, add a sunset, change the person's expression to happy..."
                      className="min-h-[120px] resize-none"
                      disabled={isRegenerating}
                    />
                    <Button
                      onClick={handleModifyImage}
                      disabled={!imageModification.trim() || isRegenerating}
                      className={cn(
                        "w-full gap-2",
                        imageModification.trim()
                          ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                          : "bg-primary/60 text-primary-foreground"
                      )}
                    >
                      {isRegenerating && regeneratingType === "image" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-4 w-4" />
                          Modify Image
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Script / Voiceover Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5 text-muted-foreground" />
                  <Label className="text-base font-medium">Script / Voiceover</Label>
                </div>

                <Textarea
                  value={voiceover}
                  onChange={(e) => handleVoiceoverChange(e.target.value)}
                  className="min-h-[120px] resize-none"
                  placeholder="Enter the voiceover text..."
                  disabled={isRegenerating}
                />

                {/* Current Audio Player */}
                {scene.audioUrl && (
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">Current Audio</Label>
                    <audio
                      key={scene.audioUrl}
                      controls
                      preload="none"
                      src={scene.audioUrl}
                      className="w-full"
                    />
                  </div>
                )}

                <Button
                  onClick={handleSaveScript}
                  disabled={!hasScriptChanges || isRegenerating}
                  className={cn(
                    "w-full gap-2",
                    hasScriptChanges 
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground" 
                      : "bg-primary/60 text-primary-foreground"
                  )}
                >
                  {isRegenerating && regeneratingType === "audio" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Regenerating Audio...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      {hasScriptChanges ? "Save & Regenerate Audio" : "No Changes"}
                    </>
                  )}
                </Button>
              </div>

              {/* Visual Prompt (read-only for reference) */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Visual Prompt (reference)</Label>
                <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                  {scene.visualPrompt}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-muted/30">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isRegenerating}
              >
                Close
              </Button>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
