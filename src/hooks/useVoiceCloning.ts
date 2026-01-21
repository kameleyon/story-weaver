import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface UserVoice {
  id: string;
  user_id: string;
  voice_name: string;
  voice_id: string;
  sample_url: string;
  description: string | null;
  created_at: string;
}

export function useVoiceCloning() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isCloning, setIsCloning] = useState(false);

  // Fetch user's voices
  const { data: voices = [], isLoading: voicesLoading } = useQuery({
    queryKey: ["user-voices", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("user_voices")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as UserVoice[];
    },
    enabled: !!user?.id,
  });

  // Upload audio file to storage
  const uploadAudio = async (file: Blob, fileName: string): Promise<string> => {
    if (!user?.id) throw new Error("User not authenticated");

    const filePath = `${user.id}/${Date.now()}-${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from("voice_samples")
      .upload(filePath, file, {
        contentType: file.type || "audio/mpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Failed to upload audio file");
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("voice_samples")
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  };

  // Clone voice mutation
  const cloneVoiceMutation = useMutation({
    mutationFn: async ({ file, name, description }: { file: Blob; name: string; description?: string }) => {
      setIsCloning(true);
      
      // Upload audio file first
      const audioUrl = await uploadAudio(file, `${name.replace(/\s+/g, "_")}.mp3`);
      
      // Call clone-voice edge function
      const { data, error } = await supabase.functions.invoke("clone-voice", {
        body: { audioUrl, voiceName: name, description },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Failed to clone voice");

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-voices"] });
      toast.success("Voice cloned successfully!");
    },
    onError: (error: Error) => {
      console.error("Clone voice error:", error);
      toast.error(error.message || "Failed to clone voice");
    },
    onSettled: () => {
      setIsCloning(false);
    },
  });

  // Delete voice mutation
  const deleteVoiceMutation = useMutation({
    mutationFn: async (voiceId: string) => {
      const { error } = await supabase
        .from("user_voices")
        .delete()
        .eq("id", voiceId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-voices"] });
      toast.success("Voice deleted");
    },
    onError: (error: Error) => {
      toast.error("Failed to delete voice: " + error.message);
    },
  });

  return {
    voices,
    voicesLoading,
    isCloning,
    cloneVoice: cloneVoiceMutation.mutateAsync,
    deleteVoice: deleteVoiceMutation.mutate,
  };
}
