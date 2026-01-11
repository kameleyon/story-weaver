import { useState } from "react";
import { motion } from "framer-motion";
import { Play, ChevronLeft, ChevronRight, Plus, Download, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Scene } from "@/hooks/useGenerationPipeline";

interface GenerationResultProps {
  title: string;
  scenes: Scene[];
  onNewProject: () => void;
}

export function GenerationResult({ title, scenes, onNewProject }: GenerationResultProps) {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const currentScene = scenes[currentSceneIndex];

  const goToNextScene = () => {
    if (currentSceneIndex < scenes.length - 1) {
      setCurrentSceneIndex(currentSceneIndex + 1);
    }
  };

  const goToPrevScene = () => {
    if (currentSceneIndex > 0) {
      setCurrentSceneIndex(currentSceneIndex - 1);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 mb-4"
        >
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium text-primary">Generation Complete</span>
        </motion.div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-muted-foreground mt-1">{scenes.length} scenes generated</p>
      </div>

      {/* Scene Preview */}
      <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
        {/* Image Preview */}
        <div className="relative aspect-video bg-muted/50 flex items-center justify-center">
          {currentScene?.imageUrl ? (
            <img
              src={currentScene.imageUrl}
              alt={`Scene ${currentScene.number}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center text-muted-foreground">
              <Play className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Scene {currentScene?.number} preview</p>
            </div>
          )}

          {/* Scene Navigation Overlay */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={goToPrevScene}
                disabled={currentSceneIndex === 0}
                className="text-white hover:bg-white/20 disabled:opacity-30"
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              
              <div className="flex items-center gap-2">
                {scenes.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSceneIndex(idx)}
                    className={`h-2 rounded-full transition-all ${
                      idx === currentSceneIndex
                        ? "w-6 bg-white"
                        : "w-2 bg-white/40 hover:bg-white/60"
                    }`}
                  />
                ))}
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={goToNextScene}
                disabled={currentSceneIndex === scenes.length - 1}
                className="text-white hover:bg-white/20 disabled:opacity-30"
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </div>
          </div>
        </div>

        {/* Scene Details */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">Scene {currentScene?.number}</h3>
            <span className="text-sm text-muted-foreground">{currentScene?.duration}s</span>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Volume2 className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                {currentScene?.voiceover}
              </p>
            </div>

            {currentScene?.audioUrl ? (
              <audio
                key={currentScene.audioUrl}
                controls
                preload="none"
                src={currentScene.audioUrl}
                className="w-full"
              />
            ) : null}
          </div>
        </div>
      </Card>

      {/* All Scenes Grid */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-foreground">All Scenes</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {scenes.map((scene, idx) => (
            <button
              key={scene.number}
              onClick={() => setCurrentSceneIndex(idx)}
              className={`relative aspect-video rounded-lg overflow-hidden border transition-all ${
                idx === currentSceneIndex
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border/50 hover:border-border"
              }`}
            >
              {scene.imageUrl ? (
                <img
                  src={scene.imageUrl}
                  alt={`Scene ${scene.number}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-muted/50 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">Scene {scene.number}</span>
                </div>
              )}
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-xs text-white">
                {scene.duration}s
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button className="flex-1 gap-2" disabled>
          <Download className="h-4 w-4" />
          Export Video (Coming Soon)
        </Button>
        <Button variant="outline" onClick={onNewProject} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Another
        </Button>
      </div>
    </div>
  );
}