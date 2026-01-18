import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type VoiceInclination = 
  | "none"
  | "clear_throat"
  | "sigh"
  | "sush"
  | "cough"
  | "groan"
  | "sniff"
  | "gasp"
  | "chuckle"
  | "laugh";

interface InclinationSelectorProps {
  selected: VoiceInclination[];
  onSelect: (inclinations: VoiceInclination[]) => void;
  disabled?: boolean;
  onDisabledChange?: (disabled: boolean) => void;
}

const INCLINATIONS: { id: VoiceInclination; label: string; tag: string }[] = [
  { id: "clear_throat", label: "Clear Throat", tag: "[clear throat]" },
  { id: "sigh", label: "Sigh", tag: "[sigh]" },
  { id: "sush", label: "Sush", tag: "[sush]" },
  { id: "cough", label: "Cough", tag: "[cough]" },
  { id: "groan", label: "Groan", tag: "[groan]" },
  { id: "sniff", label: "Sniff", tag: "[sniff]" },
  { id: "gasp", label: "Gasp", tag: "[gasp]" },
  { id: "chuckle", label: "Chuckle", tag: "[chuckle]" },
  { id: "laugh", label: "Laugh", tag: "[laugh]" },
];

export function InclinationSelector({ selected, onSelect, disabled, onDisabledChange }: InclinationSelectorProps) {
  const toggleInclination = (id: VoiceInclination) => {
    if (selected.includes(id)) {
      onSelect(selected.filter(i => i !== id));
    } else {
      onSelect([...selected, id]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          Voice Expressions
        </h3>
      </div>
      
      {/* Disable toggle */}
      <button
        onClick={() => onDisabledChange?.(!disabled)}
        className={cn(
          "flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-left transition-all",
          disabled
            ? "border-primary/30 bg-primary/5"
            : "border-transparent bg-muted dark:bg-white/10 hover:bg-muted/80"
        )}
      >
        <div className={cn(
          "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
          disabled ? "border-primary bg-primary" : "border-muted-foreground/40"
        )}>
          {disabled && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
        </div>
        <span className={cn(
          "text-sm",
          disabled ? "text-foreground" : "text-muted-foreground"
        )}>
          Disable voice expressions
        </span>
        <span className="text-xs text-muted-foreground/60 ml-1">
          (no [chuckle], [sigh], etc.)
        </span>
      </button>

      {/* Inclination tags - only show if not disabled */}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          {INCLINATIONS.map((item) => {
            const isSelected = selected.includes(item.id);
            return (
              <motion.button
                key={item.id}
                onClick={() => toggleInclination(item.id)}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-sm transition-all",
                  isSelected
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-transparent bg-muted dark:bg-white/10 hover:bg-muted/80 text-muted-foreground"
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {item.tag}
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
