import { Plus, History, User, Settings, LogOut, PanelLeftClose, Moon, Sun, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  SidebarTrigger,
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

// Mock recent projects
const recentProjects = [
  { id: "1", title: "Product Demo Video", date: "2 hours ago", thumbnail: "📹" },
  { id: "2", title: "Tutorial Series Ep.1", date: "Yesterday", thumbnail: "🎬" },
  { id: "3", title: "Marketing Pitch", date: "2 days ago", thumbnail: "📊" },
  { id: "4", title: "Onboarding Guide", date: "3 days ago", thumbnail: "📚" },
  { id: "5", title: "Feature Walkthrough", date: "1 week ago", thumbnail: "✨" },
];

interface AppSidebarProps {
  onNewProject: () => void;
}

export function AppSidebar({ onNewProject }: AppSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <motion.div
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Sparkles className="h-5 w-5" />
          </motion.div>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="text-lg font-bold text-foreground"
              >
                AudioMax
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        
        <div className="mt-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onNewProject}
                className="w-full justify-start gap-2 bg-brand-pop text-brand-dark hover:bg-brand-light"
                size={isCollapsed ? "icon" : "default"}
              >
                <Plus className="h-4 w-4" />
                {!isCollapsed && <span>New Project</span>}
              </Button>
            </TooltipTrigger>
            {isCollapsed && <TooltipContent side="right">New Project</TooltipContent>}
          </Tooltip>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2 px-4">
            <History className="h-4 w-4" />
            {!isCollapsed && <span>Recent Activity</span>}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {recentProjects.map((project) => (
                <SidebarMenuItem key={project.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton className="w-full cursor-pointer transition-colors hover:bg-sidebar-accent">
                        <span className="text-lg">{project.thumbnail}</span>
                        {!isCollapsed && (
                          <div className="flex flex-col items-start overflow-hidden">
                            <span className="truncate text-sm font-medium">{project.title}</span>
                            <span className="text-xs text-muted-foreground">{project.date}</span>
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
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start gap-3 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-brand-accent text-brand-dark">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium">Guest User</span>
                      <span className="text-xs text-muted-foreground">Free Plan</span>
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            {isCollapsed && <TooltipContent side="right">User Menu</TooltipContent>}
          </Tooltip>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuItem className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <History className="mr-2 h-4 w-4" />
              <span>Usage & Billing</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <Sun className="mr-2 h-4 w-4 dark:hidden" />
              <Moon className="mr-2 hidden h-4 w-4 dark:block" />
              <span>Toggle Theme</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
