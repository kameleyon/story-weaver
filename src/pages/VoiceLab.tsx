import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mic, 
  Upload, 
  Play, 
  Square, 
  Trash2, 
  Loader2, 
  Check,
  Volume2,
  AudioWaveform
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ThemedLogo } from "@/components/ThemedLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useVoiceCloning, UserVoice } from "@/hooks/useVoiceCloning";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useSidebarState } from "@/hooks/useSidebarState";
import { useNavigate } from "react-router-dom";

export default function VoiceLab() {
  const navigate = useNavigate();
  const { isOpen: sidebarOpen, setIsOpen: setSidebarOpen } = useSidebarState();
  const { voices, voicesLoading, isCloning, cloneVoice, deleteVoice } = useVoiceCloning();
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  
  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form state
  const [voiceName, setVoiceName] = useState("");
  const [activeTab, setActiveTab] = useState("record");

  // Visualizer state
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(20).fill(0));
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Audio preview
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Set up audio analyzer for visualization
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 64;
      source.connect(analyzer);
      analyzerRef.current = analyzer;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setRecordedBlob(blob);
        stream.getTracks().forEach(track => track.stop());
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingDuration(0);

      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      // Start visualizer
      const updateLevels = () => {
        if (analyzerRef.current) {
          const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
          analyzerRef.current.getByteFrequencyData(dataArray);
          const levels = Array.from(dataArray.slice(0, 20)).map(v => v / 255);
          setAudioLevels(levels);
        }
        animationFrameRef.current = requestAnimationFrame(updateLevels);
      };
      updateLevels();

    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setAudioLevels(new Array(20).fill(0));
    }
  };

  const handleFileUpload = (file: File) => {
    if (file && (file.type === "audio/mpeg" || file.type === "audio/wav" || file.type === "audio/mp3")) {
      setUploadedFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileUpload(file);
  };

  const handleClone = async () => {
    const audioBlob = activeTab === "record" ? recordedBlob : uploadedFile;
    if (!audioBlob || !voiceName.trim()) return;

    await cloneVoice({ 
      file: audioBlob, 
      name: voiceName.trim(),
      description: `Created via ${activeTab === "record" ? "recording" : "file upload"}`
    });

    // Reset form
    setVoiceName("");
    setRecordedBlob(null);
    setUploadedFile(null);
    setRecordingDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const playPreview = (url: string) => {
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }
    const audio = new Audio(url);
    audioPreviewRef.current = audio;
    audio.onended = () => setIsPlaying(false);
    audio.play();
    setIsPlaying(true);
  };

  const hasAudio = activeTab === "record" ? !!recordedBlob : !!uploadedFile;
  const canClone = hasAudio && voiceName.trim().length > 0 && !isCloning;

  return (
    <SidebarProvider defaultOpen={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar 
          onNewProject={() => navigate("/app/create?mode=doc2video")} 
          onOpenProject={(id) => navigate(`/app/create?project=${id}`)} 
        />
        
        <main className="flex-1 flex flex-col">
          {/* Header */}
          <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <SidebarTrigger className="md:hidden" />
            <div className="hidden md:block">
              <ThemedLogo className="h-8 w-auto" />
            </div>
            <div className="flex-1" />
          </header>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <div className="max-w-5xl mx-auto space-y-8">
              {/* Title */}
              <div className="space-y-2">
                <h1 className="text-2xl md:text-3xl font-bold">Voice Lab</h1>
                <p className="text-muted-foreground">Create your digital twin with AI voice cloning</p>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                {/* Creation Area */}
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Create New Voice</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                      <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="record" className="gap-2">
                          <Mic className="h-4 w-4" />
                          Record
                        </TabsTrigger>
                        <TabsTrigger value="upload" className="gap-2">
                          <Upload className="h-4 w-4" />
                          Upload
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="record" className="mt-4 space-y-4">
                        {/* Visualizer */}
                        <div className="h-24 bg-muted/50 rounded-xl flex items-center justify-center gap-1 px-4">
                          {audioLevels.map((level, i) => (
                            <motion.div
                              key={i}
                              className="w-2 bg-primary rounded-full"
                              animate={{ 
                                height: isRecording ? Math.max(8, level * 80) : 8 
                              }}
                              transition={{ duration: 0.05 }}
                            />
                          ))}
                        </div>

                        {/* Recording controls */}
                        <div className="flex flex-col items-center gap-4">
                          <div className="text-2xl font-mono text-muted-foreground">
                            {formatDuration(recordingDuration)}
                          </div>
                          
                          {!isRecording && !recordedBlob && (
                            <Button
                              size="lg"
                              onClick={startRecording}
                              className="rounded-full h-16 w-16"
                            >
                              <Mic className="h-6 w-6" />
                            </Button>
                          )}

                          {isRecording && (
                            <Button
                              size="lg"
                              variant="destructive"
                              onClick={stopRecording}
                              className="rounded-full h-16 w-16 animate-pulse"
                            >
                              <Square className="h-6 w-6" />
                            </Button>
                          )}

                          {recordedBlob && !isRecording && (
                            <div className="flex items-center gap-3">
                              <Badge variant="secondary" className="gap-1">
                                <Check className="h-3 w-3" />
                                Recording ready
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setRecordedBlob(null);
                                  setRecordingDuration(0);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground text-center">
                          Record at least 30 seconds of clear speech for best results
                        </p>
                      </TabsContent>

                      <TabsContent value="upload" className="mt-4 space-y-4">
                        <div
                          className={cn(
                            "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
                            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                            uploadedFile && "border-primary/50 bg-primary/5"
                          )}
                          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                          onDragLeave={() => setIsDragging(false)}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".mp3,.wav,audio/mpeg,audio/wav"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                          />
                          
                          {uploadedFile ? (
                            <div className="space-y-2">
                              <Volume2 className="h-8 w-8 mx-auto text-primary" />
                              <p className="font-medium">{uploadedFile.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); setUploadedFile(null); }}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Remove
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                              <p className="text-muted-foreground">
                                Drop an audio file here or click to browse
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Supports MP3, WAV (max 10MB)
                              </p>
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    </Tabs>

                    {/* Voice name input */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Voice Name</label>
                      <Input
                        placeholder="e.g., My Professional Voice"
                        value={voiceName}
                        onChange={(e) => setVoiceName(e.target.value)}
                        disabled={isCloning}
                      />
                    </div>

                    {/* Clone button */}
                    <Button
                      className="w-full"
                      size="lg"
                      disabled={!canClone}
                      onClick={handleClone}
                    >
                      {isCloning ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Cloning Voice...
                        </>
                      ) : (
                        <>
                          <AudioWaveform className="h-4 w-4 mr-2" />
                          Clone Voice
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Voice List */}
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg">My Voices</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {voicesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : voices.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Mic className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No voices created yet</p>
                        <p className="text-sm">Record or upload audio to create your first voice clone</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <AnimatePresence>
                          {voices.map((voice) => (
                            <VoiceCard
                              key={voice.id}
                              voice={voice}
                              onPlay={() => playPreview(voice.sample_url)}
                              onDelete={() => deleteVoice(voice.id)}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

interface VoiceCardProps {
  voice: UserVoice;
  onPlay: () => void;
  onDelete: () => void;
}

function VoiceCard({ voice, onPlay, onDelete }: VoiceCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="group flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
    >
      <Button
        size="icon"
        variant="ghost"
        className="shrink-0 h-10 w-10 rounded-full bg-primary/10 hover:bg-primary/20"
        onClick={onPlay}
      >
        <Play className="h-4 w-4 text-primary" />
      </Button>
      
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{voice.voice_name}</p>
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(voice.created_at), { addSuffix: true })}
        </p>
      </div>
      
      <Badge variant="outline" className="shrink-0">
        Active
      </Badge>
      
      <Button
        size="icon"
        variant="ghost"
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
      </Button>
    </motion.div>
  );
}
