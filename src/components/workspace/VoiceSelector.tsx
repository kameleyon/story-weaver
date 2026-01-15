import { User, UserRound } from "lucide-react";
import { motion } from "framer-motion";

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
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Voice
      </label>
      <div className="flex gap-3">
        {voices.map((voice) => {
          const Icon = voice.icon;
          const isSelected = selected === voice.id;

          return (
            <motion.button
              key={voice.id}
              onClick={() => onSelect(voice.id)}
              className={`flex items-center gap-2 rounded-xl border-2 px-5 py-3 transition-all ${
                isSelected
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border/50 bg-transparent text-muted-foreground hover:border-border hover:bg-muted/30"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Icon className="h-4 w-4" />
              <span className="text-sm font-medium">{voice.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
