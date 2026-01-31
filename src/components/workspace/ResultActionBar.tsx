import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download,
  FolderArchive,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Scene } from "@/hooks/useGenerationPipeline";

interface ResultActionBarProps {
  projectId?: string;
  title: string;
  scenes: Scene[];
  format: "landscape" | "portrait" | "square";
  onExportVideo: () => void;
  onDownloadImages: () => void;
  onRegenerateAll?: () => void;
  onNewProject: () => void;
  isExporting?: boolean;
  isDownloadingImages?: boolean;
  hasImages?: boolean;
  hasVideo?: boolean;
}

export function ResultActionBar({
  projectId,
  title,
  scenes,
  format,
  onExportVideo,
  onDownloadImages,
  onRegenerateAll,
  onNewProject,
  isExporting = false,
  isDownloadingImages = false,
  hasImages = true,
  hasVideo = true,
}: ResultActionBarProps) {
  const navigate = useNavigate();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  const handleShare = async () => {
    if (!projectId) {
      toast({
        title: "Cannot share",
        description: "Project must be saved first",
        variant: "destructive",
      });
      return;
    }

    setIsShareDialogOpen(true);
    setIsCreatingShare(true);
    setHasCopied(false);

    try {
      // Check if share already exists
      const { data: existingShare } = await supabase
        .from("project_shares")
        .select("share_token")
        .eq("project_id", projectId)
        .maybeSingle();

      let token = existingShare?.share_token;

      if (!token) {
        // Create new share
        token = crypto.randomUUID();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) throw new Error("Not authenticated");

        const { error } = await supabase.from("project_shares").insert({
          project_id: projectId,
          user_id: user.id,
          share_token: token,
        });

        if (error) throw error;
      }

      const url = `${window.location.origin}/share/${token}`;
      setShareUrl(url);
    } catch (error) {
      console.error("Failed to create share:", error);
      toast({
        title: "Failed to create share link",
        description: "Please try again",
        variant: "destructive",
      });
      setIsShareDialogOpen(false);
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setHasCopied(true);
      toast({
        title: "Link copied!",
        description: "Share this link with anyone to let them view your video",
      });
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!projectId) return;

    setIsDeleting(true);

    try {
      // Delete generations first (cascade)
      await supabase.from("generations").delete().eq("project_id", projectId);
      
      // Delete project shares
      await supabase.from("project_shares").delete().eq("project_id", projectId);
      
      // Delete project characters
      await supabase.from("project_characters").delete().eq("project_id", projectId);
      
      // Delete the project
      const { error } = await supabase.from("projects").delete().eq("id", projectId);

      if (error) throw error;

      toast({
        title: "Project deleted",
        description: "Your project has been permanently deleted",
      });

      navigate("/app/projects");
    } catch (error) {
      console.error("Failed to delete project:", error);
      toast({
        title: "Failed to delete",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  return (
    <>
      {/* Action Bar */}
      <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-4">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* Primary: Export Video */}
          <Button
            type="button"
            onClick={onExportVideo}
            disabled={isExporting || !hasVideo}
            className="gap-2 min-w-[140px]"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export Video
              </>
            )}
          </Button>

          {/* Download Images */}
          <Button
            type="button"
            variant="outline"
            onClick={onDownloadImages}
            disabled={isDownloadingImages || !hasImages}
            className="gap-2"
          >
            {isDownloadingImages ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <FolderArchive className="h-4 w-4" />
                Download Images
              </>
            )}
          </Button>

          {/* Share Video */}
          <Button
            type="button"
            variant="outline"
            onClick={handleShare}
            disabled={!projectId}
            className="gap-2"
          >
            <Link2 className="h-4 w-4" />
            Share Video
          </Button>

          {/* Regenerate All */}
          {onRegenerateAll && (
            <Button
              type="button"
              variant="outline"
              onClick={onRegenerateAll}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Regenerate All
            </Button>
          )}

          {/* Create Another */}
          <Button
            type="button"
            variant="outline"
            onClick={onNewProject}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Another
          </Button>

          {/* Delete */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={!projectId}
            className="gap-2 text-muted-foreground hover:text-destructive hover:border-destructive/50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Share Dialog */}
      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Video</DialogTitle>
            <DialogDescription>
              Anyone with this link can view your video (view only - they cannot edit, download, or save).
            </DialogDescription>
          </DialogHeader>
          
          {isCreatingShare ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  value={shareUrl}
                  readOnly
                  className="flex-1 text-sm"
                />
                <Button
                  type="button"
                  onClick={handleCopyLink}
                  className="shrink-0"
                >
                  {hasCopied ? "Copied!" : "Copy Link"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This link will remain active until you delete the project.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{title}"? This action cannot be undone and will permanently remove the project, all generated content, and any share links.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                "Delete Project"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
