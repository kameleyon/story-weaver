import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { 
  Video, 
  Clock, 
  HardDrive, 
  ChevronLeft, 
  ChevronRight,
  Play,
  Lightbulb,
  Headphones,
  Sparkles,
  Menu
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemedLogo } from "@/components/ThemedLogo";
import { formatDistanceToNow } from "date-fns";

const HERO_SLIDES = [
  {
    id: 1,
    title: "Transform Your Content",
    subtitle: "Turn scripts and documents into engaging videos with AI",
    gradient: "from-primary/20 via-primary/10 to-background",
    icon: Video,
  },
  {
    id: 2,
    title: "Storytelling Mode",
    subtitle: "Create visual narratives from your story ideas",
    gradient: "from-accent/20 via-accent/10 to-background",
    icon: Headphones,
  },
  {
    id: 3,
    title: "Multiple Visual Styles",
    subtitle: "Choose from 12+ unique artistic styles for your videos",
    gradient: "from-secondary/30 via-secondary/10 to-background",
    icon: Sparkles,
  },
];

const TIPS = [
  "Use 'Presenter Focus' to control which subjects appear in your visuals",
  "Try the Anime style for dynamic, expressive storytelling",
  "Short videos (< 1 min) work great for social media content",
  "Add 'Character Appearance' descriptions for consistent visuals",
  "The 'Stick Figure' style is perfect for educational explainers",
  "Use brand marks to add your logo to generated images",
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentTip, setCurrentTip] = useState(0);

  // Auto-advance hero slider
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Rotate tips
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % TIPS.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  // Fetch analytics
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", user?.id],
    queryFn: async () => {
      if (!user?.id) return { videosGenerated: 0, totalMinutes: 0, storageUsed: 0 };
      
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id);
      
      const { data: generations } = await supabase
        .from("generations")
        .select("scenes")
        .eq("user_id", user.id)
        .eq("status", "complete");
      
      let totalSeconds = 0;
      generations?.forEach((gen) => {
        if (Array.isArray(gen.scenes)) {
          gen.scenes.forEach((scene: any) => {
            if (typeof scene?.duration === "number") {
              totalSeconds += scene.duration;
            }
          });
        }
      });

      return {
        videosGenerated: generations?.length || 0,
        totalMinutes: Math.round(totalSeconds / 60),
        storageUsed: Math.round((generations?.length || 0) * 15), // Estimate MB
      };
    },
    enabled: !!user?.id,
  });

  // Fetch recent projects
  const { data: recentProjects = [] } = useQuery({
    queryKey: ["dashboard-recent", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("projects")
        .select("id, title, created_at, project_type")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);
      return data || [];
    },
    enabled: !!user?.id,
  });

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex h-14 sm:h-16 items-center justify-between border-b border-border/30 bg-background/80 px-4 sm:px-6 backdrop-blur-sm">
        <div className="flex items-center gap-3 sm:gap-4">
          <SidebarTrigger className="lg:hidden">
            <Menu className="h-5 w-5 text-muted-foreground" />
          </SidebarTrigger>
          <div className="hidden lg:flex items-center gap-3">
            <ThemedLogo className="h-10 w-auto" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10 space-y-8">
          
          {/* Hero Slider */}
          <div className="relative overflow-hidden rounded-2xl border border-border/50">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.4 }}
                className={`bg-gradient-to-br ${HERO_SLIDES[currentSlide].gradient} p-8 sm:p-12`}
              >
                <div className="flex items-center gap-4 mb-4">
                  {(() => {
                    const Icon = HERO_SLIDES[currentSlide].icon;
                    return <Icon className="h-8 w-8 text-primary" />;
                  })()}
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                  {HERO_SLIDES[currentSlide].title}
                </h2>
                <p className="text-muted-foreground text-sm sm:text-base max-w-md">
                  {HERO_SLIDES[currentSlide].subtitle}
                </p>
              </motion.div>
            </AnimatePresence>
            
            {/* Navigation Arrows */}
            <button
              onClick={prevSlide}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={nextSlide}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-muted transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            
            {/* Dots */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {HERO_SLIDES.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    idx === currentSlide ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Analytics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-primary/10">
                    <Video className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.videosGenerated || 0}</p>
                    <p className="text-sm text-muted-foreground">Videos Generated</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-accent/10">
                    <Clock className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.totalMinutes || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Minutes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-secondary/50">
                    <HardDrive className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.storageUsed || 0} MB</p>
                    <p className="text-sm text-muted-foreground">Storage Used</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Start + Tips Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quick Start */}
            <Card className="border-border/50">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-4">Quick Start</h3>
                {recentProjects.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">No projects yet</p>
                    <Button onClick={() => navigate("/app/create?mode=doc2video")} className="gap-2">
                      <Play className="h-4 w-4" />
                      Create Your First Video
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentProjects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => navigate(`/app/create?project=${project.id}`)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                      >
                        {project.project_type === "storytelling" ? (
                          <Headphones className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Video className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{project.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(project.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        <Play className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Did You Know */}
            <Card className="border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Did You Know?</h3>
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentTip}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-muted-foreground leading-relaxed"
                  >
                    {TIPS[currentTip]}
                  </motion.p>
                </AnimatePresence>
              </CardContent>
            </Card>
          </div>

          {/* Community Showcase Placeholder */}
          <Card className="border-border/50 border-dashed">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium mb-3">
                Coming Soon
              </div>
              <h3 className="text-lg font-semibold text-muted-foreground mb-2">Community Showcase</h3>
              <p className="text-sm text-muted-foreground/70 max-w-md mx-auto">
                Share your creations with the community. Toggle videos to public, get likes, and discover what others are creating.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
