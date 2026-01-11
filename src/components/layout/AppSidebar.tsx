import { Plus, History, User, Settings, LogOut, Moon, Sun, Video, Film, Clapperboard, Presentation, Play } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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

// Mock recent projects with Lucide icons
const recentProjects = [
  { id: "1", title: "Product Demo Video", date: "2 hours ago", icon: Video },
  { id: "2", title: "Tutorial Series Ep.1", date: "Yesterday", icon: Film },
  { id: "3", title: "Marketing Pitch", date: "2 days ago", icon: Clapperboard },
  { id: "4", title: "Onboarding Guide", date: "3 days ago", icon: Presentation },
  { id: "5", title: "Feature Walkthrough", date: "1 week ago", icon: Play },
];

interface AppSidebarProps {
  onNewProject: () => void;
}

export function AppSidebar({ onNewProject }: AppSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/50">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <ThemedLogo className="h-8 w-auto" />
          </motion.div>
        </div>
        
        <div className="mt-6">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onNewProject}
                className="w-full justify-start gap-2.5 rounded-full bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
                size={isCollapsed ? "icon" : "default"}
              >
                <Plus className="h-4 w-4" />
                {!isCollapsed && <span className="font-medium">New Project</span>}
              </Button>
            </TooltipTrigger>
            {isCollapsed && <TooltipContent side="right">New Project</TooltipContent>}
          </Tooltip>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            <History className="h-3.5 w-3.5" />
            {!isCollapsed && <span>Recent</span>}
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-2">
            <SidebarMenu className="space-y-1">
              {recentProjects.map((project) => {
                const IconComponent = project.icon;
                return (
                  <SidebarMenuItem key={project.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton className="w-full cursor-pointer rounded-lg px-3 py-2.5 transition-colors hover:bg-sidebar-accent/50">
                          <IconComponent className="h-4 w-4 text-muted-foreground" />
                          {!isCollapsed && (
                            <div className="flex flex-col items-start overflow-hidden">
                              <span className="truncate text-sm font-medium">{project.title}</span>
                              <span className="text-[11px] text-muted-foreground/70">{project.date}</span>
                            </div>
                          )}
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          <div>
                            <p className="font-medium">{project.title}</p>
                            <p className="text-xs text-muted-foreground">{project.date}</p>
                          </div>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start gap-3 rounded-lg px-3 py-2.5 hover:bg-sidebar-accent/50">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-muted text-muted-foreground">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex flex-col items-start overflow-hidden">
                      <span className="truncate text-sm font-medium">
                        {user?.email?.split("@")[0] || "User"}
                      </span>
                      <span className="text-[11px] text-muted-foreground/70">Free Plan</span>
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            {isCollapsed && <TooltipContent side="right">User Menu</TooltipContent>}
          </Tooltip>
          <DropdownMenuContent align="start" side="top" className="w-56 rounded-xl border-border/50 shadow-lg">
            <DropdownMenuItem 
              className="cursor-pointer rounded-lg"
              onClick={() => navigate("/settings")}
            >
              <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="cursor-pointer rounded-lg"
              onClick={() => navigate("/usage")}
            >
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
