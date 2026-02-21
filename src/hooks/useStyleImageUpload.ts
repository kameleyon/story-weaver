import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useStyleImageUpload() {
  const [uploading, setUploading] = useState(false);

  const uploadStyleImage = async (file: File): Promise<string | null> => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return null;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("You must be logged in to upload images");
      return null;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from("style-references")
        .upload(path, file, { upsert: false });

      if (error) {
        toast.error("Failed to upload image");
        console.error("[style-upload]", error);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from("style-references")
        .getPublicUrl(path);

      return urlData.publicUrl;
    } catch (err) {
      console.error("[style-upload]", err);
      toast.error("Failed to upload image");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const deleteStyleImage = async (url: string) => {
    try {
      // Extract path from public URL
      const match = url.match(/style-references\/(.+)$/);
      if (!match) return;
      await supabase.storage.from("style-references").remove([match[1]]);
    } catch (err) {
      console.error("[style-delete]", err);
    }
  };

  return { uploadStyleImage, deleteStyleImage, uploading };
}
