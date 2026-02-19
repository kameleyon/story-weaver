import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function DeleteAccountDialog() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const canDelete = confirmText === "DELETE";

  const handleDelete = async () => {
    if (!canDelete) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase.functions.invoke("delete-account");

      if (error) throw error;

      toast({
        title: "Account scheduled for deletion",
        description: "Your account and all associated data will be permanently deleted. You will be signed out now.",
      });

      // Sign out after short delay so the toast is visible
      setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.href = "/";
      }, 2000);
    } catch (error: any) {
      console.error("Error deleting account:", error);
      toast({
        title: "Error deleting account",
        description: error.message || "Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); setConfirmText(""); }}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="rounded-full">
          Delete Account
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Account
          </DialogTitle>
          <DialogDescription>
            This action is <strong>permanent and irreversible</strong>. All your projects, generations, voice clones, and credits will be permanently deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm text-destructive font-medium">This will permanently delete:</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>• All your projects and generated videos</li>
              <li>• All voice clones and audio files</li>
              <li>• Your subscription and remaining credits</li>
              <li>• Your profile and account data</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-delete">
              Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete || isDeleting}
            className="gap-2 rounded-full"
          >
            {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Permanently Delete Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
