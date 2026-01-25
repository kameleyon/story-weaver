import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft,
  Search,
  SortAsc,
  SortDesc,
  Star,
  Trash2,
  Pencil,
  Eye,
  Download,
  Share2,
  MoreVertical,
  Loader2,
  FolderOpen,
  Video,
  Clapperboard,
  Wallpaper,
  LayoutGrid,
  List,
  Wand2,
  Clock,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemedLogo } from "@/components/ThemedLogo";
import { cn } from "@/lib/utils";

type SortField = "title" | "created_at" | "updated_at";
type SortOrder = "asc" | "desc";
type ViewMode = "grid" | "list";

interface Project {
  id: string;
  title: string;
  description: string | null;
  format: string;
  style: string;
  status: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  project_type?: string;
}

// Style color mapping for visual variety - Teal & Mist palette
const styleColors: Record<string, string> = {
  "3d-pixar": "from-[#4EA69A]/30 to-[#2D6967]/20",
  "anime": "from-[#71C0C2]/30 to-[#4EA69A]/20",
  "realistic": "from-[#0D565F]/30 to-[#2D6967]/20",
  "sketch": "from-[#86D2CA]/20 to-[#DAEEE9]/15",
  "doodle": "from-[#86D2CA]/30 to-[#71C0C2]/20",
  "minimalist": "from-[#DAEEE9]/30 to-[#86D2CA]/15",
  "painterly": "from-[#2D6967]/30 to-[#4EA69A]/20",
  "caricature": "from-[#71C0C2]/30 to-[#0D565F]/20",
  "claymation": "from-[#4EA69A]/35 to-[#86D2CA]/20",
  "crayon": "from-[#86D2CA]/35 to-[#4EA69A]/20",
  "stick": "from-[#0D565F]/30 to-[#71C0C2]/20",
  "storybook": "from-[#2D6967]/30 to-[#86D2CA]/20",
};

export default function Projects() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectToRename, setProjectToRename] = useState<Project | null>(null);
  const [projectToShare, setProjectToShare] = useState<Project | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["all-projects", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Project[];
    },
    enabled: !!user?.id,
  });

  // Mutations
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-projects"] });
      queryClient.invalidateQueries({ queryKey: ["recent-projects"] });
      toast.success("Project deleted");
    },
    onError: (error) => toast.error("Failed to delete: " + error.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("projects").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-projects"] });
      queryClient.invalidateQueries({ queryKey: ["recent-projects"] });
      setSelectedIds(new Set());
      toast.success("Projects deleted");
    },
    onError: (error) => toast.error("Failed to delete: " + error.message),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase.from("projects").update({ title }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-projects"] });
      queryClient.invalidateQueries({ queryKey: ["recent-projects"] });
      toast.success("Project renamed");
    },
    onError: (error) => toast.error("Failed to rename: " + error.message),
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase.from("projects").update({ is_favorite }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-projects"] });
      queryClient.invalidateQueries({ queryKey: ["recent-projects"] });
    },
    onError: (error) => toast.error("Failed to update: " + error.message),
  });

  // Filter and sort
  const filteredProjects = useMemo(() => {
    let result = projects.filter((p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    result.sort((a, b) => {
      if (a.is_favorite !== b.is_favorite) {
        return a.is_favorite ? -1 : 1;
      }

      let aVal: string | number = a[sortField];
      let bVal: string | number = b[sortField];

      if (sortField === "created_at" || sortField === "updated_at") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (sortOrder === "asc") {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    return result;
  }, [projects, searchQuery, sortField, sortOrder]);

  // Selection handlers
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProjects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProjects.map((p) => p.id)));
    }
  };

  // Action handlers
  const handleView = (project: Project) => {
    navigate(`/app/create?project=${project.id}`);
  };

  const handleRename = (project: Project) => {
    setProjectToRename(project);
    setNewTitle(project.title);
    setRenameDialogOpen(true);
  };

  const confirmRename = () => {
    if (projectToRename && newTitle.trim()) {
      renameMutation.mutate({ id: projectToRename.id, title: newTitle.trim() });
      setRenameDialogOpen(false);
      setProjectToRename(null);
    }
  };

  const handleDelete = (project: Project) => {
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

  const handleBulkDelete = () => {
    if (selectedIds.size > 0) {
      setBulkDeleteDialogOpen(true);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedIds));
    setBulkDeleteDialogOpen(false);
  };

  const handleToggleFavorite = (project: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    toggleFavoriteMutation.mutate({ id: project.id, is_favorite: !project.is_favorite });
  };

  const handleShare = (project: Project) => {
    setProjectToShare(project);
    setShareDialogOpen(true);
  };

  const copyShareLink = () => {
    if (projectToShare) {
      const url = `${window.location.origin}/app/create?project=${projectToShare.id}`;
      navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
      setShareDialogOpen(false);
    }
  };

  const handleDownload = async (project: Project) => {
    const data = {
      title: project.title,
      description: project.description,
      format: project.format,
      style: project.style,
      created_at: project.created_at,
      updated_at: project.updated_at,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.title.replace(/[^a-z0-9]/gi, "_")}_project.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Project metadata downloaded");
  };

  const getStyleGradient = (style: string) => {
    return styleColors[style] || "from-primary/20 to-primary/10";
  };

  const SortIcon = sortOrder === "asc" ? SortAsc : SortDesc;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center gap-4 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/app")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <ThemedLogo className="h-8" />
          <div className="flex-1" />
        </div>
      </header>

      <main className="container px-4 py-8">
        {/* Hero Section */}
        <div className="relative mb-10 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-background to-background border border-border/50 p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <FolderOpen className="h-6 w-6 text-primary" />
              </div>
              <Badge variant="secondary" className="text-xs">
                {projects.length} Total
              </Badge>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">Your Projects</h1>
            <p className="text-muted-foreground max-w-lg">
              Manage, organize, and access all your video creations in one place
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card border-border/50"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
              <SelectTrigger className="w-[140px] bg-card border-border/50">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="created_at">Created</SelectItem>
                <SelectItem value="updated_at">Updated</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
              className="border-border/50"
            >
              <SortIcon className="h-4 w-4" />
            </Button>
            <div className="flex rounded-lg border border-border/50 overflow-hidden">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("grid")}
                className="rounded-none border-0"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("list")}
                className="rounded-none border-0"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            {selectedIds.size > 0 && (
              <Button variant="destructive" onClick={handleBulkDelete} className="gap-2">
                <Trash2 className="h-4 w-4" />
                Delete ({selectedIds.size})
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="p-6 rounded-full bg-muted/50 mb-6">
              <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No projects found</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              {searchQuery ? "Try a different search term" : "Create your first project to get started"}
            </p>
            {!searchQuery && (
              <Button onClick={() => navigate("/app/create?mode=doc2video")} className="gap-2">
                <Wand2 className="h-4 w-4" />
                Create Project
              </Button>
            )}
          </motion.div>
        ) : viewMode === "grid" ? (
          /* Grid View */
          <motion.div 
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            <AnimatePresence mode="popLayout">
              {filteredProjects.map((project, index) => (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <Card 
                    className={cn(
                      "group cursor-pointer overflow-hidden border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5",
                      selectedIds.has(project.id) && "ring-2 ring-primary"
                    )}
                    onClick={() => handleView(project)}
                  >
                    {/* Gradient Header */}
                    <div className={cn(
                      "h-24 relative bg-gradient-to-br",
                      getStyleGradient(project.style)
                    )}>
                      <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
                      
                      {/* Quick Actions */}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-7 w-7 bg-background/80 backdrop-blur-sm"
                          onClick={(e) => handleToggleFavorite(project, e)}
                        >
                          <Star className={cn(
                            "h-3.5 w-3.5",
                            project.is_favorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                          )} />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="secondary"
                              size="icon"
                              className="h-7 w-7 bg-background/80 backdrop-blur-sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleView(project); }}>
                              <Eye className="mr-2 h-4 w-4" />
                              Open
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRename(project); }}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleShare(project); }}>
                              <Share2 className="mr-2 h-4 w-4" />
                              Share
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(project); }}>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); handleDelete(project); }}
                              className="text-muted-foreground focus:text-foreground"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Checkbox */}
                      <div className="absolute top-2 left-2">
                        <Checkbox
                          checked={selectedIds.has(project.id)}
                          onCheckedChange={() => toggleSelect(project.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="bg-background/80 backdrop-blur-sm border-white/20"
                        />
                      </div>

                      {/* Project Type Icon */}
                      <div className="absolute bottom-2 left-3">
                        <div className="p-2 rounded-lg bg-background/80 backdrop-blur-sm">
                          {project.project_type === "storytelling" ? (
                            <Clapperboard className="h-4 w-4 text-primary" />
                          ) : project.project_type === "smartflow" || project.project_type === "smart-flow" ? (
                            <Wallpaper className="h-4 w-4 text-primary" />
                          ) : (
                            <Video className="h-4 w-4 text-primary" />
                          )}
                        </div>
                      </div>

                      {/* Favorite Badge */}
                      {project.is_favorite && (
                        <div className="absolute bottom-2 right-3">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        </div>
                      )}
                    </div>

                    <CardContent className="p-4">
                      <h3 className="font-semibold truncate mb-2 group-hover:text-primary transition-colors">
                        {project.title}
                      </h3>
                      
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {project.format}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {project.style.replace(/-/g, " ")}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          /* List View */
          <div className="rounded-xl border border-border/50 overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedIds.size === filteredProjects.length && filteredProjects.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead className="hidden md:table-cell">Format</TableHead>
                  <TableHead className="hidden lg:table-cell">Style</TableHead>
                  <TableHead className="hidden sm:table-cell">Updated</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredProjects.map((project, index) => (
                    <motion.tr
                      key={project.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50 border-border/50 group",
                        selectedIds.has(project.id) && "bg-primary/5"
                      )}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(project.id)}
                          onCheckedChange={() => toggleSelect(project.id)}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => handleToggleFavorite(project, e)}
                        >
                          <Star
                            className={cn(
                              "h-4 w-4 transition-colors",
                              project.is_favorite
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-muted-foreground hover:text-yellow-400"
                            )}
                          />
                        </Button>
                      </TableCell>
                      <TableCell onClick={() => handleView(project)}>
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-lg bg-gradient-to-br",
                            getStyleGradient(project.style)
                          )}>
                            {project.project_type === "storytelling" ? (
                              <Clapperboard className="h-4 w-4 text-primary" />
                            ) : project.project_type === "smartflow" || project.project_type === "smart-flow" ? (
                              <Wallpaper className="h-4 w-4 text-primary" />
                            ) : (
                              <Video className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <span className="font-medium group-hover:text-primary transition-colors">
                            {project.title}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell onClick={() => handleView(project)} className="hidden md:table-cell">
                        <Badge variant="outline" className="capitalize text-xs">
                          {project.project_type === "storytelling" 
                            ? "Story" 
                            : project.project_type === "smartflow" || project.project_type === "smart-flow"
                              ? "Smart Flow"
                              : "Explainer"}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={() => handleView(project)} className="hidden md:table-cell">
                        <span className="capitalize text-muted-foreground">{project.format}</span>
                      </TableCell>
                      <TableCell onClick={() => handleView(project)} className="hidden lg:table-cell">
                        <span className="capitalize text-muted-foreground">{project.style.replace(/-/g, " ")}</span>
                      </TableCell>
                      <TableCell onClick={() => handleView(project)} className="hidden sm:table-cell">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="text-sm">{formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</span>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => handleView(project)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Open
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleRename(project)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleShare(project)}>
                              <Share2 className="mr-2 h-4 w-4" />
                              Share
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownload(project)}>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(project)}
                              className="text-muted-foreground focus:text-foreground"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        )}

        {/* Footer Stats */}
        <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}
            {selectedIds.size > 0 && ` • ${selectedIds.size} selected`}
          </span>
          {filteredProjects.length > 0 && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Video className="h-3.5 w-3.5" />
                <span>{filteredProjects.filter(p => p.project_type !== "storytelling").length} videos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clapperboard className="h-3.5 w-3.5" />
                <span>{filteredProjects.filter(p => p.project_type === "storytelling").length} stories</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Delete Dialog */}
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
              className="bg-muted text-foreground hover:bg-muted/80"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Projects</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} project{selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              className="bg-muted text-foreground hover:bg-muted/80"
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>Enter a new name for this project.</DialogDescription>
          </DialogHeader>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Project title"
            onKeyDown={(e) => e.key === "Enter" && confirmRename()}
            className="bg-muted/50"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmRename} disabled={!newTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Project</DialogTitle>
            <DialogDescription>
              Copy the link below to share this project.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              readOnly
              value={projectToShare ? `${window.location.origin}/app/create?project=${projectToShare.id}` : ""}
              className="flex-1 bg-muted/50"
            />
            <Button onClick={copyShareLink}>Copy</Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
