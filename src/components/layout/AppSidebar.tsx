import {
  Plus,
  User,
  Settings,
  LogOut,
  Moon,
  Sun,
  Video,
  Loader2,
  PanelLeftClose,
  PanelLeft,
  History,
  Trash2,
  MoreVertical,
  FolderOpen,
  Crown,
  Check,
  Sparkles,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription, STRIPE_PLANS } from "@/hooks/useSubscription";
import { ProjectSearch } from "@/components/layout/ProjectSearch";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface AppSidebarProps {
  onNewProject: () => void;
  onOpenProject: (projectId: string) => void;
}

const PREMIUM_PERKS = [
  "20 Videos per month",
  "All visual styles included",
  "Priority rendering",
  "Custom branding",
  "HD exports",
  "Email support",
];

export function AppSidebar({ onNewProject, onOpenProject }: AppSidebarProps) {
  const { state, openMobile, isMobile, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed" && !isMobile;
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const { plan, subscribed, cancelAtPeriodEnd, createCheckout, isLoading: subscriptionLoading } = useSubscription();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; title: string } | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  // Show upgrade modal for freemium or cancelled users (once per session)
  useEffect(() => {
    if (subscriptionLoading) return;
    
    const hasSeenModal = sessionStorage.getItem("upgrade-modal-shown");
    const shouldShowModal = (plan === "free" || cancelAtPeriodEnd) && !hasSeenModal;
    
    if (shouldShowModal) {
      // Delay modal appearance for better UX
      const timer = setTimeout(() => {
        setUpgradeModalOpen(true);
        sessionStorage.setItem("upgrade-modal-shown", "true");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [plan, cancelAtPeriodEnd, subscriptionLoading]);

  const handleUpgradeNow = async () => {
    try {
      setUpgradeLoading(true);
      await createCheckout(STRIPE_PLANS.premium.monthly.priceId, "subscription");
      setUpgradeModalOpen(false);
    } catch (error) {
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setUpgradeLoading(false);
    }
  };

  const getPlanDisplayName = () => {
    if (cancelAtPeriodEnd) return "Cancelled";
    switch (plan) {
      case "premium": return "Premium";
      case "pro": return "Pro";
      case "platinum": return "Platinum";
      default: return "Free Plan";
    }
  };

  const { data: recentProjects = [], isLoading } = useQuery({
    queryKey: ["recent-projects", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("projects")
        .select("id, title, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects-search"] });
      toast.success("Project deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete project: " + error.message);
    },
  });

  const handleDeleteProject = (project: { id: string; title: string }, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (projectToDelete) {
      deleteProjectMutation.mutate(projectToDelete.id);
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <>
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/50">
      <SidebarHeader className="p-3">
        {/* Search bar - only when expanded */}
        {!isCollapsed && (
          <div className="mb-3 sm:mb-4">
            <ProjectSearch onSelectProject={onOpenProject} />
          </div>
        )}

        {/* Collapse/Expand Toggle */}
        <div className={`flex ${isCollapsed ? "justify-center" : "justify-end"}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-accent"
              >
                {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{isCollapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
          </Tooltip>
        </div>

        {/* New Project Button */}
        <div className={`mt-3 sm:mt-4 ${isCollapsed ? "flex justify-center" : ""}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              {isCollapsed ? (
                <button
                  onClick={onNewProject}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/40 text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </button>
              ) : (
                <Button
                  onClick={onNewProject}
                  className="w-full justify-start gap-2 sm:gap-2.5 rounded-full bg-primary/40 text-sm text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
                >
                  <Plus className="h-4 w-4" />
                  <span className="font-medium">New Project</span>
                </Button>
              )}
            </TooltipTrigger>
            {isCollapsed && <TooltipContent side="right">New Project</TooltipContent>}
          </Tooltip>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {!isCollapsed && (
          <SidebarGroup>
            <div className="flex items-center gap-2 px-3 py-2 text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              <History className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Recent</span>
            </div>
            <SidebarGroupContent className="mt-1">
              <SidebarMenu className="space-y-0.5 sm:space-y-1">
                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : recentProjects.length === 0 ? (
                  <div className="px-3 py-2 text-xs sm:text-sm text-muted-foreground/70">No projects yet</div>
                ) : (
                  recentProjects.map((project) => (
                    <SidebarMenuItem key={project.id} className="group relative">
                      <SidebarMenuButton
                        onClick={() => onOpenProject(project.id)}
                        className="w-full cursor-pointer rounded-lg px-3 py-2 sm:py-2.5 pr-8 transition-colors hover:bg-sidebar-accent/50"
                      >
                        <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                        <div className="flex flex-col items-start overflow-hidden">
                          <span className="truncate text-xs sm:text-sm font-medium">{project.title}</span>
                          <span className="text-[10px] sm:text-[11px] text-muted-foreground/70">
                            {formatDistanceToNow(new Date(project.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 sm:h-6 sm:w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive cursor-pointer text-sm"
                            onClick={(e) => handleDeleteProject(project, e as unknown as React.MouseEvent)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
            {recentProjects.length > 0 && (
              <div className="mt-2 px-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-xs sm:text-sm text-muted-foreground hover:text-accent hover:bg-sidebar-accent"
                  onClick={() => navigate("/projects")}
                >
                  <FolderOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  View All Projects
                </Button>
              </div>
            )}
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-2 sm:p-3">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={`w-full rounded-lg hover:bg-sidebar-accent hover:text-accent ${
                    isCollapsed ? "justify-center px-0" : "justify-start gap-2 sm:gap-3 px-2 sm:px-3"
                  } py-2 sm:py-2.5`}
                  size={isCollapsed ? "icon" : "default"}
                >
                  <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                    <AvatarFallback className="bg-muted text-muted-foreground">
                      <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex flex-col items-start overflow-hidden">
                      <span className="truncate text-xs sm:text-sm font-medium">{user?.email?.split("@")[0] || "User"}</span>
                      <span className="text-[10px] sm:text-[11px] text-muted-foreground/70">{getPlanDisplayName()}</span>
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            {isCollapsed && <TooltipContent side="right">Account</TooltipContent>}
          </Tooltip>
          <DropdownMenuContent align="start" side="top" className="w-56 rounded-xl border-border/50 shadow-sm">
            <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => navigate("/settings")}>
              <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => navigate("/usage")}>
              <History className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Usage & Billing</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/50" />
            <DropdownMenuItem
              className="cursor-pointer rounded-lg"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Sun className="mr-2 h-4 w-4 text-muted-foreground dark:hidden" />
              <Moon className="mr-2 hidden h-4 w-4 text-muted-foreground dark:block" />
              <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/50" />
            <DropdownMenuItem
              className="cursor-pointer rounded-lg text-destructive focus:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{projectToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upgrade to Premium Modal */}
      <Dialog open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10">
              <Crown className="h-7 w-7 text-primary" />
            </div>
            <DialogTitle className="text-xl font-semibold">
              Upgrade to Premium
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Unlock the full potential of AudioMax with Premium features
            </DialogDescription>
          </DialogHeader>
          
          <div className="my-4 space-y-3">
            {PREMIUM_PERKS.map((perk, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                  <Check className="h-3 w-3 text-primary" />
                </div>
                <span className="text-sm">{perk}</span>
              </div>
            ))}
          </div>

          <div className="mt-2 rounded-lg bg-muted/50 p-3 text-center">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-2xl font-bold">$7.99</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
          </div>

          <DialogFooter className="mt-4 flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button 
              onClick={handleUpgradeNow}
              disabled={upgradeLoading}
              className="w-full gap-2"
            >
              {upgradeLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Upgrade Now
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setUpgradeModalOpen(false)}
              className="w-full text-muted-foreground hover:text-foreground"
            >
              No thanks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
