import { useState } from "react";
import { Paintbrush } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type VisualStyle = "minimalist" | "doodle" | "stick" | "anime" | "realistic" | "custom";

interface StyleSelectorProps {
  selected: VisualStyle;
  customStyle: string;
  onSelect: (style: VisualStyle) => void;
  onCustomStyleChange: (value: string) => void;
}

const styles: { id: VisualStyle; label: string; emoji: string }[] = [
  { id: "minimalist", label: "Modern Minimalist", emoji: "✨" },
  { id: "doodle", label: "Urban Doodle", emoji: "🎨" },
  { id: "stick", label: "Stick Figure", emoji: "🖊️" },
  { id: "anime", label: "Anime", emoji: "🌸" },
  { id: "realistic", label: "Realistic", emoji: "🎬" },
  { id: "custom", label: "Custom", emoji: "🎯" },
];

export function StyleSelector({ selected, customStyle, onSelect, onCustomStyleChange }: StyleSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Visual Style</h3>
      <div className="grid grid-cols-3 gap-2">
        {styles.map((style) => (
          <motion.button
            key={style.id}
            onClick={() => onSelect(style.id)}
            className={cn(
              "flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-all",
              selected === style.id
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-muted-foreground/30"
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="text-lg">{style.emoji}</span>
            <span className="text-sm font-medium">{style.label}</span>
          </motion.button>
        ))}
      </div>
      
      {selected === "custom" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-2 pt-2">
            <Paintbrush className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Describe your custom style..."
              value={customStyle}
              onChange={(e) => onCustomStyleChange(e.target.value)}
              className="flex-1"
            />
          </div>
        </motion.div>
      )}
    </div>
  );
}
