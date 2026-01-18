import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type VoiceInclination = 
  | "neutral"
  | "sighs"
  | "laughs"
  | "emotional"
  | "dramatic";

interface InclinationSelectorProps {
  selected: VoiceInclination;
  onSelect: (inclination: VoiceInclination) => void;
}

const INCLINATIONS: { id: VoiceInclination; label: string; description: string }[] = [
  { id: "neutral", label: "Neutral", description: "Clean narration" },
  { id: "sighs", label: "Sighs", description: "Reflective pauses" },
  { id: "laughs", label: "Laughs", description: "Light chuckles" },
  { id: "emotional", label: "Emotional", description: "Heartfelt delivery" },
  { id: "dramatic", label: "Dramatic", description: "Intense emphasis" },
];

export function InclinationSelector({ selected, onSelect }: InclinationSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
        Voice Inclination
      </h3>
      <div className="flex flex-wrap gap-2">
        {INCLINATIONS.map((item) => {
          const isSelected = selected === item.id;
          return (
            <motion.button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left transition-all",
                isSelected
                  ? "border-primary/50 bg-primary/5 shadow-sm"
                  : "border-transparent bg-muted dark:bg-white/10 hover:bg-muted/80 dark:hover:bg-white/15"
              )}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <span className={cn(
                "text-sm font-medium block",
                isSelected ? "text-foreground" : "text-muted-foreground"
              )}>
                {item.label}
              </span>
              <span className="text-xs text-muted-foreground/70">{item.description}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
