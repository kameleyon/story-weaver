import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { 
  ChevronLeft, 
  ChevronRight,
  Lightbulb,
  Clapperboard,
  Wallpaper,
  Menu,
  Video,
  Users
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRefreshThumbnails } from "@/hooks/useRefreshThumbnails";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemedLogo } from "@/components/ThemedLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { format } from "date-fns";

// Import background images
import dashboardBgDark from "@/assets/dashboard/dashboard-bg-dark.png";
import dashboardBgLight from "@/assets/dashboard/dashboard-bg-light.png";
import defaultThumbnail from "@/assets/dashboard/default-thumbnail.png";

const TIPS = [
  "Use 'Presenter Focus' to control which subjects appear in your visuals",
  "Try the Anime style for dynamic, expressive storytelling",
  "Short videos (< 1 min) work great for social media content",
  "Add 'Character Appearance' descriptions for consistent visuals",
  "The 'Stick Figure' style is perfect for educational explainers",
  "Use brand marks to add your logo to generated images",
];

const GREETINGS = [
  { greeting: "Hey", suffix: "Ready to create?" },
  { greeting: "Welcome back", suffix: "Let's make something great." },
  { greeting: "Good to see you", suffix: "What are we building today?" },
  { greeting: "Hi there", suffix: "Your canvas awaits." },
  { greeting: "Hello", suffix: "Time to bring ideas to life." },
  { greeting: "Welcome", suffix: "Let's get creative." },
];

// Circular progress component
const CircularProgress = ({ percentage, size = 80 }: { percentage: number; size?: number }) => {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary) / 0.2)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-semibold text-foreground">{percentage}%</span>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshThumbnails } = useRefreshThumbnails();
  const [currentTip, setCurrentTip] = useState(0);
  const [projectScrollIndex, setProjectScrollIndex] = useState(0);
  const [greetingIndex] = useState(() => Math.floor(Math.random() * GREETINGS.length));

  // Rotate tips
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % TIPS.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  // Fetch credits
  const { data: credits } = useQuery({
    queryKey: ["user-credits", user?.id],
    queryFn: async () => {
      if (!user?.id) return { balance: 0, total: 200 };
      
      const { data } = await supabase
        .from("user_credits")
        .select("credits_balance, total_purchased")
        .eq("user_id", user.id)
        .single();
      
      const balance = data?.credits_balance || 0;
      const total = Math.max(data?.total_purchased || 200, 200);
      
      return { balance, total };
    },
    enabled: !!user?.id,
  });

  // Fetch display name from profiles table
  const { data: profile } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single();
      
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch recent projects with their first generated image
  const { data: recentProjects = [] } = useQuery({
    queryKey: ["dashboard-recent", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // Fetch projects
      const { data: projects } = await supabase
        .from("projects")
        .select("id, title, created_at, updated_at, project_type, style")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(10);
      
      if (!projects?.length) return [];
      
      // Fetch latest complete generation for each project to get thumbnail
      const projectIds = projects.map(p => p.id);
      const { data: generations } = await supabase
        .from("generations")
        .select("project_id, scenes")
        .in("project_id", projectIds)
        .eq("status", "complete")
        .order("created_at", { ascending: false });
      
      // Create a map of project_id -> first image URL
      const thumbnailMap: Record<string, string | null> = {};
      if (generations) {
        for (const gen of generations) {
          // Only use the first generation found for each project
          if (thumbnailMap[gen.project_id] !== undefined) continue;
          
          const scenes = gen.scenes as any[];
          if (Array.isArray(scenes) && scenes.length > 0) {
            // Get first scene's image
            const firstScene = scenes[0];
            const imageUrl = firstScene?.imageUrl || 
                            firstScene?.image_url || 
                            (Array.isArray(firstScene?.imageUrls) ? firstScene.imageUrls[0] : null);
            thumbnailMap[gen.project_id] = imageUrl || null;
          } else {
            thumbnailMap[gen.project_id] = null;
          }
        }
      }
      
      // Refresh signed URLs that may have expired
      const thumbnailInputs = projects.map(p => ({
        projectId: p.id,
        thumbnailUrl: thumbnailMap[p.id] || null,
      }));
      
      const refreshedMap = await refreshThumbnails(thumbnailInputs);
      
      // Attach refreshed thumbnails to projects
      return projects.map(p => ({
        ...p,
        thumbnailUrl: refreshedMap.get(p.id) || null,
      }));
    },
    enabled: !!user?.id,
  });

  const creditsUsed = credits ? credits.total - credits.balance : 0;
  const usagePercentage = credits ? Math.round((creditsUsed / credits.total) * 100) : 0;

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'User';

  const getProjectIcon = (projectType: string) => {
    switch (projectType) {
      case "storytelling":
        return Clapperboard;
      case "smartflow":
        return Wallpaper;
      default:
        return Video;
    }
  };

  const visibleProjects = 4;
  const maxScrollIndex = Math.max(0, recentProjects.length - visibleProjects);

  const scrollProjects = (direction: 'left' | 'right') => {
    if (direction === 'left') {
      setProjectScrollIndex(Math.max(0, projectScrollIndex - 1));
    } else {
      setProjectScrollIndex(Math.min(maxScrollIndex, projectScrollIndex + 1));
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden relative">
      {/* Background Image - more subtle in light mode */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-15 dark:opacity-0 pointer-events-none"
        style={{ 
          backgroundImage: `url(${dashboardBgLight})`,
        }}
      />
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-0 dark:opacity-40 pointer-events-none"
        style={{ 
          backgroundImage: `url(${dashboardBgDark})`,
        }}
      />
      
      {/* Header */}
      <header className="relative z-10 flex h-14 sm:h-16 items-center justify-between border-b border-primary/20 bg-background/80 px-4 sm:px-6 backdrop-blur-sm">
        <div className="flex items-center gap-3 sm:gap-4">
          <SidebarTrigger className="lg:hidden">
            <Menu className="h-5 w-5 text-muted-foreground" />
          </SidebarTrigger>
          <ThemedLogo className="h-8 lg:h-10 w-auto" />
        </div>
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10 space-y-8">
          
          {/* Welcome Section */}
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              {GREETINGS[greetingIndex].greeting}, {displayName}
            </h1>
            <p className="text-muted-foreground">{GREETINGS[greetingIndex].suffix}</p>
          </div>

          {/* Usage Overview + Did You Know Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Usage Overview Card */}
            <div className="rounded-xl border border-primary/75 bg-white/90 dark:bg-card/80 backdrop-blur-sm p-5 shadow-sm">
              <div className="flex items-center gap-5">
                <CircularProgress percentage={usagePercentage} />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-foreground mb-1">Usage Overview</h3>
                  <p className="text-sm text-primary font-medium">{usagePercentage}% Credits Used</p>
                  <p className="text-xs text-gray-600 dark:text-muted-foreground">
                    {credits?.balance || 0} / {credits?.total || 200} Credits Left
                  </p>
                </div>
              </div>
            </div>

            {/* Did You Know Card */}
            <div className="rounded-xl border border-primary/75 bg-white/90 dark:bg-card/80 backdrop-blur-sm p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                  <Lightbulb className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2">Did You Know?</h3>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={currentTip}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="text-sm text-gray-600 dark:text-muted-foreground leading-relaxed"
                    >
                      Tip: {TIPS[currentTip]}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Projects Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Recent Projects</h2>
              <Button 
                variant="link" 
                className="text-brand-primary dark:text-primary font-semibold p-0 h-auto hover:opacity-80"
                onClick={() => navigate("/projects")}
              >
                View All
              </Button>
            </div>

            {recentProjects.length === 0 ? (
              <div className="rounded-xl border border-primary/75 bg-white/90 dark:bg-card/80 backdrop-blur-sm p-8 text-center shadow-sm">
                <p className="text-gray-600 dark:text-muted-foreground mb-4">No projects yet</p>
                <Button onClick={() => navigate("/app/create?mode=doc2video")} className="gap-2">
                  <Video className="h-4 w-4" />
                  Create Your First Project
                </Button>
              </div>
            ) : (
              <div className="relative">
                {/* Scroll Left Button */}
                {projectScrollIndex > 0 && (
                  <button
                    onClick={() => scrollProjects('left')}
                    className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 p-2 rounded-full bg-card border border-primary/75 shadow-sm hover:bg-muted transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4 text-foreground" />
                  </button>
                )}

                {/* Projects Carousel */}
                <div className="overflow-hidden">
                  <motion.div 
                    className="flex gap-4"
                    animate={{ x: -projectScrollIndex * (200 + 16) }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  >
                    {recentProjects.map((project) => {
                      const ProjectIcon = getProjectIcon(project.project_type);
                      return (
                        <div
                          key={project.id}
                          onClick={() => navigate(`/app/create?project=${project.id}`)}
                          className="shrink-0 w-[200px] rounded-xl border border-primary/75 bg-white/90 dark:bg-card/80 backdrop-blur-sm overflow-hidden cursor-pointer hover:border-primary transition-colors shadow-sm group"
                        >
                          {/* Thumbnail area */}
                          <div className="h-24 bg-gradient-to-br from-primary/30 via-primary/15 to-muted/20 flex items-center justify-center relative overflow-hidden">
                            <img 
                              src={project.thumbnailUrl || defaultThumbnail} 
                              alt={project.title}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                            {/* Category icon overlay - always visible */}
                            <div className="absolute bottom-2 right-2 p-1.5 rounded-md bg-black/50 backdrop-blur-sm z-10">
                              <ProjectIcon className="h-4 w-4 text-white" />
                            </div>
                          </div>
                          {/* Info area */}
                          <div className="p-3">
                            <p className="font-medium text-sm text-gray-900 dark:text-foreground truncate group-hover:text-primary transition-colors">
                              {project.title}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-muted-foreground mt-1">
                              Last edited {format(new Date(project.updated_at), "MMM d, yyyy")}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                </div>

                {/* Scroll Right Button */}
                {projectScrollIndex < maxScrollIndex && (
                  <button
                    onClick={() => scrollProjects('right')}
                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 p-2 rounded-full bg-card border border-primary/75 shadow-sm hover:bg-muted transition-colors"
                  >
                    <ChevronRight className="h-4 w-4 text-foreground" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Community Coming Soon Section */}
          <div className="rounded-xl border border-dashed border-primary/50 bg-white/80 dark:bg-card/60 backdrop-blur-sm p-8 text-center shadow-sm">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-primary/20 dark:bg-primary/20 text-brand-primary dark:text-primary text-xs font-semibold mb-3">
              <Users className="h-3 w-3" />
              Coming Soon
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground mb-2">Community Showcase</h3>
            <p className="text-sm text-gray-700 dark:text-muted-foreground max-w-md mx-auto">
              Share your creations with the community. Toggle videos to public, get likes, and discover what others are creating.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
