import { forwardRef, useImperativeHandle, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallpaper, Loader2, AlertCircle, Volume2, VolumeX, ChevronDown, ChevronUp, Download, RotateCcw, Pencil, X, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSidebar } from "@/components/ui/sidebar";
import { ThemedLogo } from "@/components/ThemedLogo";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

import { FormatSelector, VideoFormat } from "./FormatSelector";
import { VoiceSelector, VoiceSelection } from "./VoiceSelector";
import { SmartFlowStyleSelector, SmartFlowStyle } from "./SmartFlowStyleSelector";
import { GenerationProgress } from "./GenerationProgress";
import type { GenerationState } from "@/hooks/useGenerationPipeline";

export interface WorkspaceHandle {
  resetWorkspace: () => void;
  openProject: (projectId: string) => Promise<void>;
}

interface SmartFlowWorkspaceProps {
  projectId?: string | null;
}

export const SmartFlowWorkspace = forwardRef<WorkspaceHandle, SmartFlowWorkspaceProps>(
  function SmartFlowWorkspace({ projectId }, ref) {
    const navigate = useNavigate();
    const { isMobile, openMobile, setOpenMobile, toggleSidebar } = useSidebar();

    // Form state
    const [dataSource, setDataSource] = useState("");
    const [extractionPrompt, setExtractionPrompt] = useState("");
    const [style, setStyle] = useState<SmartFlowStyle>("minimalist");
    const [customStyle, setCustomStyle] = useState("");
    const [format, setFormat] = useState<VideoFormat>("square");
    const [enableVoice, setEnableVoice] = useState(false);
    const [voice, setVoice] = useState<VoiceSelection>({ type: "standard", gender: "female" });
    const [brandMarkEnabled, setBrandMarkEnabled] = useState(false);
    const [brandMarkText, setBrandMarkText] = useState("");

    // Advanced options
    const [advancedOpen, setAdvancedOpen] = useState(false);

    // Generation state
    const [isGenerating, setIsGenerating] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);
    
    // Edit modal state
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAudioEditModal, setShowAudioEditModal] = useState(false);
    const [editPrompt, setEditPrompt] = useState("");
    const [audioEditScript, setAudioEditScript] = useState("");
    const [isRegeneratingAudio, setIsRegeneratingAudio] = useState(false);
    
    // Generation progress state (matches GenerationState interface)
    const [generationState, setGenerationState] = useState<GenerationState>({
      step: "analysis",
      progress: 0,
      sceneCount: 1,
      currentScene: 1,
      totalImages: 1,
      completedImages: 0,
      isGenerating: false,
      statusMessage: "",
    });

    const MAX_DATA_SOURCE_LENGTH = 250000;
    const dataSourceLength = dataSource.length;
    const isDataSourceTooLong = dataSourceLength > MAX_DATA_SOURCE_LENGTH;
    const canGenerate = dataSource.trim().length > 10 && extractionPrompt.trim().length > 5 && !isDataSourceTooLong;

    const resetWorkspace = () => {
      setDataSource("");
      setExtractionPrompt("");
      setStyle("minimalist");
      setCustomStyle("");
      setFormat("square");
      setEnableVoice(false);
      setVoice({ type: "standard", gender: "female" });
      setBrandMarkEnabled(false);
      setBrandMarkText("");
      setIsGenerating(false);
      setError(null);
      setResult(null);
    };

    const handleOpenProject = async (id: string) => {
      // TODO: Load existing Smart Flow project
      console.log("Loading Smart Flow project:", id);
    };

    useImperativeHandle(ref, () => ({
      resetWorkspace,
      openProject: handleOpenProject,
    }));

    const handleGenerate = async () => {
      if (!canGenerate) return;
      setIsGenerating(true);
      setError(null);
      
      // Initialize progress state
      setGenerationState({
        step: "analysis",
        progress: 5,
        sceneCount: 1,
        currentScene: 1,
        totalImages: 1,
        completedImages: 0,
        isGenerating: true,
        statusMessage: "Analyzing your data...",
      });

      // Simulate progress updates for UX
      const progressInterval = setInterval(() => {
        setGenerationState(prev => {
          if (!prev.isGenerating) return prev;
          
          if (prev.progress < 25) {
            return { ...prev, progress: prev.progress + 2, statusMessage: "Extracting key insights..." };
          } else if (prev.progress < 50) {
            return { ...prev, step: "scripting", progress: prev.progress + 2, statusMessage: "Creating visual layout..." };
          } else if (prev.progress < 75) {
            return { ...prev, step: "visuals", progress: prev.progress + 1, statusMessage: "Generating infographic..." };
          } else if (prev.progress < 90) {
            return { ...prev, progress: prev.progress + 0.5, statusMessage: enableVoice ? "Creating narration audio..." : "Finalizing image..." };
          }
          return prev;
        });
      }, 500);

      try {
        const { data, error: invokeError } = await supabase.functions.invoke("generate-smartflow", {
          body: {
            dataSource,
            extractionPrompt,
            style,
            customStyle: customStyle || undefined,
            format,
            brandMark: brandMarkEnabled && brandMarkText.trim() ? brandMarkText.trim() : undefined,
            enableVoice,
            voiceType: voice.type,
            voiceId: voice.voiceId,
            voiceName: voice.voiceName,
            voiceGender: voice.gender,
          },
        });

        clearInterval(progressInterval);

        if (invokeError) {
          throw new Error(invokeError.message || "Generation failed");
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        // Complete!
        setGenerationState(prev => ({
          ...prev,
          step: "complete",
          progress: 100,
          isGenerating: false,
          statusMessage: "Complete!",
        }));

        setResult({
          projectId: data.projectId,
          generationId: data.generationId,
          title: data.title,
          imageUrl: data.imageUrl,
          audioUrl: data.audioUrl,
          script: data.script,
          keyInsights: data.keyInsights,
        });

        toast({
          title: "Infographic created!",
          description: data.title,
        });
      } catch (err) {
        clearInterval(progressInterval);
        console.error("Smart Flow generation error:", err);
        setError(err instanceof Error ? err.message : "Generation failed");
        setGenerationState(prev => ({
          ...prev,
          step: "error",
          isGenerating: false,
          error: err instanceof Error ? err.message : "Generation failed",
        }));
        toast({
          title: "Generation failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setIsGenerating(false);
      }
    };

    const handleDownload = async () => {
      if (!result?.imageUrl) return;
      
      try {
        const response = await fetch(result.imageUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${result.title || "infographic"}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast({ title: "Download started!" });
      } catch (err) {
        toast({ title: "Download failed", variant: "destructive" });
      }
    };

    const handleNewProject = () => {
      resetWorkspace();
      navigate("/app/create?mode=smartflow");
    };

    const handleRegenerateImage = async () => {
      if (!result?.generationId || !editPrompt.trim()) return;
      
      setIsRegenerating(true);
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("generate-smartflow", {
          body: {
            phase: "regenerate-image",
            generationId: result.generationId,
            imagePrompt: editPrompt.trim(),
            format,
            style,
            customStyle: customStyle || undefined,
            brandMark: brandMarkEnabled && brandMarkText.trim() ? brandMarkText.trim() : undefined,
          },
        });

        if (invokeError) throw new Error(invokeError.message);
        if (data?.error) throw new Error(data.error);

        setResult((prev: any) => ({ ...prev, imageUrl: data.imageUrl }));
        setShowEditModal(false);
        setEditPrompt("");
        
        toast({ title: "Image regenerated!" });
      } catch (err) {
        console.error("Image regeneration error:", err);
        toast({
          title: "Regeneration failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setIsRegenerating(false);
      }
    };

    const handleRegenerateAudio = async () => {
      if (!result?.generationId || !audioEditScript.trim()) return;
      
      setIsRegeneratingAudio(true);
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("generate-smartflow", {
          body: {
            phase: "regenerate-audio",
            generationId: result.generationId,
            script: audioEditScript.trim(),
            voiceType: voice.type,
            voiceId: voice.voiceId,
            voiceName: voice.voiceName,
            voiceGender: voice.gender,
          },
        });

        if (invokeError) throw new Error(invokeError.message);
        if (data?.error) throw new Error(data.error);

        setResult((prev: any) => ({ ...prev, audioUrl: data.audioUrl, script: audioEditScript.trim() }));
        setShowAudioEditModal(false);
        
        toast({ title: "Audio regenerated!" });
      } catch (err) {
        console.error("Audio regeneration error:", err);
        toast({
          title: "Audio regeneration failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setIsRegeneratingAudio(false);
      }
    };

    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        {/* Top Bar */}
        <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
          <div className="flex items-center gap-3">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setOpenMobile(!openMobile)}
              >
                <Wallpaper className="h-4 w-4" />
              </Button>
            )}
            <div 
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate("/app")}
            >
              <ThemedLogo className="h-10 w-auto" />
            </div>
          </div>

          {isGenerating && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Generating...</span>
            </div>
          )}

        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
            <AnimatePresence mode="wait">
              {error ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="rounded-xl border border-destructive/30 bg-primary/10 p-6 text-center"
                >
                  <AlertCircle className="mx-auto h-10 w-10 text-destructive mb-3" />
                  <h3 className="font-medium text-foreground mb-2">Generation Failed</h3>
                  <p className="text-sm text-muted-foreground mb-4">{error}</p>
                  <Button onClick={resetWorkspace} className="bg-primary hover:bg-primary/90">
                    Try Again
                  </Button>
                </motion.div>
              ) : result ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  {/* Infographic Image with Edit Button */}
                  <div className="relative rounded-xl border border-border/50 overflow-hidden bg-muted/20 group">
                    <img 
                      src={result.imageUrl} 
                      alt="Generated infographic" 
                      className="w-full"
                      onError={(e) => {
                        console.error("Image failed to load:", result.imageUrl);
                      }}
                    />
                    {/* Edit overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button 
                        onClick={() => setShowEditModal(true)}
                        className="bg-primary hover:bg-primary/90 gap-2"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit Image
                      </Button>
                    </div>
                  </div>

                  {/* Audio Player (if voice was enabled) */}
                  {result.audioUrl && (
                    <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                      <div className="flex items-center gap-3">
                        <Volume2 className="h-5 w-5 text-primary" />
                        <audio 
                          controls 
                          src={result.audioUrl} 
                          className="flex-1 h-10"
                          style={{ colorScheme: 'dark' }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setAudioEditScript(result.script || "");
                            setShowAudioEditModal(true);
                          }}
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={handleNewProject} className="flex-1 gap-2">
                      <RotateCcw className="h-4 w-4" />
                      New Project
                    </Button>
                    <Button variant="outline" onClick={() => setShowEditModal(true)} className="gap-2">
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button onClick={handleDownload} className="flex-1 bg-primary hover:bg-primary/90 gap-2">
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  </div>
                </motion.div>
              ) : isGenerating ? (
                <motion.div
                  key="generating"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-2xl mx-auto space-y-6"
                >
                  <GenerationProgress state={generationState} />
                </motion.div>
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  {/* Hero */}
                  <div className="text-center space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      <Wallpaper className="h-3.5 w-3.5" />
                      Smart Flow
                    </div>
                    <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                      Create Your Infographic
                    </h1>
                    <p className="text-sm text-muted-foreground/70">
                      Turn data into beautiful visual insights
                    </p>
                  </div>

                  {/* Data Source Input */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                      Your Data or Source
                    </h3>
                    <Textarea
                      placeholder="Paste your data, text, research, or any content you want to visualize..."
                      value={dataSource}
                      onChange={(e) => setDataSource(e.target.value)}
                      className="min-h-[180px] rounded-xl border-border/50 bg-muted/50 dark:bg-white/10 resize-none focus:bg-background text-sm leading-relaxed"
                    />
                    <div className="flex items-center justify-between px-1">
                      <p className="text-xs text-muted-foreground/60">
                        Drop your data bank, research notes, or any content to extract insights from
                      </p>
                      <span className={cn(
                        "text-xs font-medium",
                        isDataSourceTooLong ? "text-destructive" : "text-muted-foreground/60"
                      )}>
                        {dataSourceLength.toLocaleString()} / {MAX_DATA_SOURCE_LENGTH.toLocaleString()}
                      </span>
                    </div>
                    {isDataSourceTooLong && (
                      <p className="text-xs text-destructive px-1">
                        Content exceeds maximum length. Please reduce to under 100,000 characters.
                      </p>
                    )}
                  </div>

                  {/* Extraction Prompt */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                      What to Extract
                    </h3>
                    <Input
                      placeholder="e.g., Best 3 business combinations for spades..."
                      value={extractionPrompt}
                      onChange={(e) => setExtractionPrompt(e.target.value)}
                      className="rounded-xl border-border/50 bg-muted/50 dark:bg-white/10 focus:bg-background"
                    />
                    <p className="text-xs text-muted-foreground/60 px-1">
                      Tell the AI what insights or structure to extract and visualize
                    </p>
                  </div>

                  {/* Style Selector */}
                  <SmartFlowStyleSelector
                    selected={style}
                    customStyle={customStyle}
                    onSelect={setStyle}
                    onCustomStyleChange={setCustomStyle}
                    brandMarkEnabled={brandMarkEnabled}
                    brandMarkText={brandMarkText}
                    onBrandMarkEnabledChange={setBrandMarkEnabled}
                    onBrandMarkTextChange={setBrandMarkText}
                  />

                  {/* Format Selector */}
                  <FormatSelector
                    selected={format}
                    onSelect={setFormat}
                  />

                  {/* Voice Toggle */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {enableVoice ? (
                          <Volume2 className="h-4 w-4 text-primary" />
                        ) : (
                          <VolumeX className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <Label htmlFor="voice-toggle" className="text-sm font-medium cursor-pointer">
                            Add Voice Narration
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Creates a mini video (&lt;120s) with narration
                          </p>
                        </div>
                      </div>
                      <Switch
                        id="voice-toggle"
                        checked={enableVoice}
                        onCheckedChange={setEnableVoice}
                      />
                    </div>

                    {enableVoice && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="pl-7"
                      >
                        <VoiceSelector selected={voice} onSelect={setVoice} />
                      </motion.div>
                    )}
                  </div>

                  {/* Generate Button */}
                  <Button
                    onClick={handleGenerate}
                    disabled={!canGenerate || isGenerating}
                    className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-lg shadow-primary/20"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wallpaper className="mr-2 h-4 w-4" />
                        Generate Infographic
                      </>
                    )}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    1 credit per infographic • {enableVoice ? "Includes mini video" : "Image only"}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
        </div>
      </div>

      {/* Edit Image Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Infographic</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Current Image Preview */}
            {result?.imageUrl && (
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <img 
                  src={result.imageUrl} 
                  alt="Current infographic" 
                  className="w-full max-h-48 object-contain bg-muted/20"
                />
              </div>
            )}
            
            {/* Edit Prompt */}
            <div className="space-y-2">
              <Label>Describe your changes</Label>
              <Textarea
                placeholder="e.g., Make the colors more vibrant, add a chart showing the data, change the title to..."
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                className="min-h-[100px] resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Describe how you want to modify the infographic
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowEditModal(false);
                  setEditPrompt("");
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRegenerateImage}
                disabled={!editPrompt.trim() || isRegenerating}
                className="flex-1 bg-primary hover:bg-primary/90 gap-2"
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <Pencil className="h-4 w-4" />
                    Regenerate Image
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Audio Modal */}
      <Dialog open={showAudioEditModal} onOpenChange={setShowAudioEditModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Narration</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Current Audio Preview */}
            {result?.audioUrl && (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                <audio controls src={result.audioUrl} className="w-full h-10" style={{ colorScheme: 'dark' }} />
              </div>
            )}
            
            {/* Script Edit */}
            <div className="space-y-2">
              <Label>Narration Script</Label>
              <Textarea
                placeholder="Edit the narration script..."
                value={audioEditScript}
                onChange={(e) => setAudioEditScript(e.target.value)}
                className="min-h-[150px] resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Modify the script and regenerate the audio
              </p>
            </div>

            {/* Voice Selection */}
            <div className="space-y-2">
              <Label>Voice</Label>
              <VoiceSelector selected={voice} onSelect={setVoice} />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowAudioEditModal(false);
                  setAudioEditScript("");
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRegenerateAudio}
                disabled={!audioEditScript.trim() || isRegeneratingAudio}
                className="flex-1 bg-primary hover:bg-primary/90 gap-2"
              >
                {isRegeneratingAudio ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Regenerate Audio
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    );
  }
);
