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
  selected: VoiceInclination;
  onSelect: (inclination: VoiceInclination) => void;
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
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
        Voice Expressions
      </h3>
      
      {/* Disable toggle - radio style */}
      <button
        onClick={() => {
          onDisabledChange?.(!disabled);
          if (!disabled) {
            onSelect("none");
          }
        }}
        className={cn(
          "flex items-center gap-3 w-full rounded-xl border px-4 py-2.5 text-left transition-all",
          disabled
            ? "border-primary/50 bg-primary/5 shadow-sm"
            : "border-transparent dark:border-white/10 bg-muted dark:bg-white/10 hover:bg-muted/80 dark:hover:bg-white/15"
        )}
      >
        <div className={cn(
          "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
          disabled ? "border-primary" : "border-muted-foreground/40"
        )}>
          {disabled && <div className="w-2 h-2 rounded-full bg-primary" />}
        </div>
        <div>
          <span className={cn(
            "text-sm font-medium",
            disabled ? "text-foreground" : "text-muted-foreground"
          )}>
            Disable voice expressions
          </span>
          <span className="text-xs text-muted-foreground/60 ml-2">
            (no [chuckle], [sigh], etc.)
          </span>
        </div>
      </button>

      {/* Inclination options - only show if not disabled */}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          {INCLINATIONS.map((item) => {
            const isSelected = selected === item.id;
            return (
              <motion.button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2 transition-all",
                  isSelected
                    ? "border-primary/50 bg-primary/5 shadow-sm"
                    : "border-transparent dark:border-white/10 bg-muted dark:bg-white/10 hover:bg-muted/80 dark:hover:bg-white/15"
                )}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <div className={cn(
                  "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                  isSelected ? "border-primary" : "border-muted-foreground/40"
                )}>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                </div>
                <span className={cn(
                  "text-sm font-medium",
                  isSelected ? "text-foreground" : "text-muted-foreground"
                )}>
                  {item.tag}
                </span>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
