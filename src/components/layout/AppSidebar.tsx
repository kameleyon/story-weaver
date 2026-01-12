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
} from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { ThemedLogo } from "@/components/ThemedLogo";

interface AppSidebarProps {
  onNewProject: () => void;
  onOpenProject: (projectId: string) => void;
}

export function AppSidebar({ onNewProject, onOpenProject }: AppSidebarProps) {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const { data: recentProjects = [], isLoading } = useQuery({
    queryKey: ["recent-projects", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("projects")
        .select("id, title, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/50">
      <SidebarHeader className="p-3">
        {/* Logo - only when expanded */}
        {!isCollapsed && (
          <div className="mb-4 px-1">
            <ThemedLogo className="h-12 w-auto" />
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
                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-sidebar-accent/50"
              >
                {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{isCollapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
          </Tooltip>
        </div>

        {/* New Project Button */}
        <div className={`mt-4 ${isCollapsed ? "flex justify-center" : ""}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              {isCollapsed ? (
                <button
                  onClick={onNewProject}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/25 text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
                >
                  <Plus className="h-3 w-3" strokeWidth={2.5} />
                </button>
              ) : (
                <Button
                  onClick={onNewProject}
                  className="w-full justify-start gap-2.5 rounded-full bg-primary/25 text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
                >
                  <Plus className="h-3 w-3" />
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
            <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              <History className="h-3.5 w-3.5" />
              <span>Recent</span>
            </div>
            <SidebarGroupContent className="mt-1">
              <SidebarMenu className="space-y-1">
                {isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : recentProjects.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground/70">No projects yet</div>
                ) : (
                  recentProjects.map((project) => (
                    <SidebarMenuItem key={project.id}>
                      <SidebarMenuButton
                        onClick={() => onOpenProject(project.id)}
                        className="w-full cursor-pointer rounded-lg px-3 py-2.5 transition-colors hover:bg-sidebar-accent/50"
                      >
                        <Video className="h-4 w-4 text-muted-foreground" />
                        <div className="flex flex-col items-start overflow-hidden">
                          <span className="truncate text-sm font-medium">{project.title}</span>
                          <span className="text-[11px] text-muted-foreground/70">
                            {formatDistanceToNow(new Date(project.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={`w-full rounded-lg hover:bg-sidebar-accent/50 ${
                    isCollapsed ? "justify-center px-0" : "justify-start gap-3 px-3"
                  } py-2.5`}
                  size={isCollapsed ? "icon" : "default"}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-muted text-muted-foreground">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex flex-col items-start overflow-hidden">
                      <span className="truncate text-sm font-medium">{user?.email?.split("@")[0] || "User"}</span>
                      <span className="text-[11px] text-muted-foreground/70">Free Plan</span>
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            {isCollapsed && <TooltipContent side="right">Account</TooltipContent>}
          </Tooltip>
          <DropdownMenuContent align="start" side="top" className="w-56 rounded-xl border-border/50 shadow-lg">
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
  );
}
