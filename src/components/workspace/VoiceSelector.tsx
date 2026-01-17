import { User, UserRound } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type VoiceGender = "male" | "female";

interface VoiceSelectorProps {
  selected: VoiceGender;
  onSelect: (voice: VoiceGender) => void;
}

const voices: { id: VoiceGender; label: string; icon: typeof User }[] = [
  { id: "male", label: "Male", icon: User },
  { id: "female", label: "Female", icon: UserRound },
];

export function VoiceSelector({ selected, onSelect }: VoiceSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Voice</h3>
      <div className="flex gap-2">
        {voices.map((voice) => {
          const Icon = voice.icon;
          const isSelected = selected === voice.id;

          return (
            <motion.button
              key={voice.id}
              onClick={() => onSelect(voice.id)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-4 py-2.5 transition-all",
                isSelected
                  ? "border-primary/50 bg-primary/5 shadow-sm"
                  : "border-border bg-muted hover:bg-muted/80 hover:border-border"
              )}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <Icon className={cn("h-4 w-4", isSelected ? "text-primary" : "text-muted-foreground")} />
              <span className={cn(
                "text-sm font-medium",
                isSelected ? "text-foreground" : "text-muted-foreground"
              )}>{voice.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
