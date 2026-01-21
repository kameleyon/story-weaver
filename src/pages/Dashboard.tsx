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
  Menu,
  ArrowRight,
  Zap,
  TrendingUp
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemedLogo } from "@/components/ThemedLogo";
import { GlassCard } from "@/components/ui/glass-card";
import { formatDistanceToNow } from "date-fns";

// Import slide illustrations
import slideDoc2Video from "@/assets/dashboard/slide-doc2video.png";
import slideStorytelling from "@/assets/dashboard/slide-storytelling.png";
import slideStyles from "@/assets/dashboard/slide-styles.png";

const HERO_SLIDES = [
  {
    id: 1,
    title: "Transform Your Content",
    subtitle: "Turn scripts and documents into engaging videos with AI",
    icon: Video,
    image: slideDoc2Video,
  },
  {
    id: 2,
    title: "Storytelling Mode",
    subtitle: "Create visual narratives from your story ideas",
    icon: Headphones,
    image: slideStorytelling,
  },
  {
    id: 3,
    title: "Multiple Visual Styles",
    subtitle: "Choose from 12+ unique artistic styles for your videos",
    icon: Sparkles,
    image: slideStyles,
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

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { 
    y: 0, 
    opacity: 1,
    transition: {
      type: "spring" as const,
      stiffness: 100
    }
  }
};

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
        storageUsed: Math.round((generations?.length || 0) * 15),
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
        .limit(4);
      return data || [];
    },
    enabled: !!user?.id,
  });

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);

  return (
    <div className="flex h-screen flex-col aurora-bg overflow-hidden">
      {/* Header */}
      <header className="flex h-14 sm:h-16 items-center justify-between border-b border-white/10 bg-background/50 backdrop-blur-sm px-4 sm:px-6">
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
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <motion.div 
          className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10 space-y-8"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          
          {/* Hero Welcome Section */}
          <motion.div variants={itemVariants}>
            <GlassCard className="p-8 sm:p-12" gradient>
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/20">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-primary">Welcome back, Creator</span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gradient">
                    Ready to create magic?
                  </h1>
                  <p className="text-muted-foreground max-w-md">
                    Transform your ideas into stunning videos with AI-powered generation.
                  </p>
                </div>
                <Button 
                  onClick={() => navigate("/app/create?mode=doc2video")} 
                  size="lg"
                  className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg shadow-primary/20 border-0 gap-2"
                >
                  <Zap className="h-5 w-5" />
                  New Project
                </Button>
              </div>
            </GlassCard>
          </motion.div>

          {/* Quick Actions Grid */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Doc to Video Card */}
            <GlassCard 
              className="group cursor-pointer p-6"
              onClick={() => navigate("/app/create?mode=doc2video")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              gradient
            >
              <div className="absolute top-4 right-4">
                <div className="p-2 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20">
                  <Video className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1 space-y-2">
                  <h3 className="text-xl font-semibold">Doc to Video</h3>
                  <p className="text-sm text-muted-foreground">
                    Convert articles and scripts into engaging video content instantly.
                  </p>
                </div>
              </div>
            </GlassCard>

            {/* Storytelling Card */}
            <GlassCard 
              className="group cursor-pointer p-6"
              onClick={() => navigate("/app/create?mode=storytelling")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              gradient
            >
              <div className="absolute top-4 right-4">
                <div className="p-2 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-accent/20 to-primary/20">
                  <Headphones className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1 space-y-2">
                  <h3 className="text-xl font-semibold">Story Weaver</h3>
                  <p className="text-sm text-muted-foreground">
                    Craft compelling narratives with AI-driven storytelling tools.
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Stats Row */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <GlassCard className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Video className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.videosGenerated || 0}</p>
                  <p className="text-sm text-muted-foreground">Videos Generated</p>
                </div>
              </div>
            </GlassCard>
            
            <GlassCard className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.totalMinutes || 0}</p>
                  <p className="text-sm text-muted-foreground">Total Minutes</p>
                </div>
              </div>
            </GlassCard>
            
            <GlassCard className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <HardDrive className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.storageUsed || 0} MB</p>
                  <p className="text-sm text-muted-foreground">Storage Used</p>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Hero Slider */}
          <motion.div variants={itemVariants}>
            <GlassCard className="relative overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={currentSlide}
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.3 }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -50) nextSlide();
                    else if (info.offset.x > 50) prevSlide();
                  }}
                  className="px-8 sm:px-12 py-8 sm:py-10 relative overflow-hidden h-[180px] sm:h-[200px] cursor-grab active:cursor-grabbing"
                >
                  {/* Background illustration */}
                  <div className="absolute right-0 top-0 bottom-0 w-full sm:w-2/3 pointer-events-none">
                    <img 
                      src={HERO_SLIDES[currentSlide].image} 
                      alt="" 
                      className="h-full w-full object-cover object-center sm:object-right opacity-50 sm:opacity-70"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
                  </div>
                  
                  <div className="relative z-10 pr-4 sm:pr-0 select-none">
                    <div className="flex items-center gap-3 mb-3">
                      {(() => {
                        const Icon = HERO_SLIDES[currentSlide].icon;
                        return <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-primary shrink-0" />;
                      })()}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold mb-2">
                      {HERO_SLIDES[currentSlide].title}
                    </h2>
                    <p className="text-muted-foreground text-sm sm:text-base max-w-md">
                      {HERO_SLIDES[currentSlide].subtitle}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>
              
              {/* Navigation Arrows */}
              <button
                onClick={prevSlide}
                className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 rounded-full bg-background/80 backdrop-blur-sm border border-white/10 hover:bg-muted transition-colors z-20"
              >
                <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
              </button>
              <button
                onClick={nextSlide}
                className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 rounded-full bg-background/80 backdrop-blur-sm border border-white/10 hover:bg-muted transition-colors z-20"
              >
                <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
              </button>
              
              {/* Dots */}
              <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
                {HERO_SLIDES.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlide(idx)}
                    className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full transition-colors ${
                      idx === currentSlide ? "bg-primary" : "bg-white/30"
                    }`}
                  />
                ))}
              </div>
            </GlassCard>
          </motion.div>

          {/* Recent Projects + Tips Row */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Projects */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Recent Creations
                </h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate("/projects")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  View All
                </Button>
              </div>
              {recentProjects.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No projects yet</p>
                  <Button onClick={() => navigate("/app/create?mode=doc2video")} className="gap-2">
                    <Play className="h-4 w-4" />
                    Create Your First Video
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentProjects.map((project) => (
                    <motion.button
                      key={project.id}
                      onClick={() => navigate(`/app/create?project=${project.id}`)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left group"
                      whileHover={{ x: 4 }}
                    >
                      <div className="p-2 rounded-lg bg-primary/10">
                        {project.project_type === "storytelling" ? (
                          <Headphones className="h-4 w-4 text-primary" />
                        ) : (
                          <Video className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{project.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(project.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <Play className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.button>
                  ))}
                </div>
              )}
            </GlassCard>

            {/* Did You Know */}
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Lightbulb className="h-5 w-5 text-primary" />
                </div>
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
            </GlassCard>
          </motion.div>

          {/* Community Showcase Placeholder */}
          <motion.div variants={itemVariants}>
            <GlassCard className="p-8 text-center border-dashed">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-3">
                Coming Soon
              </div>
              <h3 className="text-lg font-semibold text-muted-foreground mb-2">Community Showcase</h3>
              <p className="text-sm text-muted-foreground/70 max-w-md mx-auto">
                Share your creations with the community. Toggle videos to public, get likes, and discover what others are creating.
              </p>
            </GlassCard>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
