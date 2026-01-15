import { Sparkles, Pencil, Users, Cherry, Camera, Wand2, Box, Hand, PenTool } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type VisualStyle = "minimalist" | "doodle" | "stick" | "anime" | "realistic" | "3d-pixar" | "claymation" | "sketch" | "custom";

interface StyleSelectorProps {
  selected: VisualStyle;
  customStyle: string;
  onSelect: (style: VisualStyle) => void;
  onCustomStyleChange: (value: string) => void;
}

const styles: { id: VisualStyle; label: string; icon: React.ElementType }[] = [
  { id: "minimalist", label: "Minimalist", icon: Sparkles },
  { id: "doodle", label: "Urban Doodle", icon: Pencil },
  { id: "stick", label: "Stick Figure", icon: Users },
  { id: "anime", label: "Anime", icon: Cherry },
  { id: "realistic", label: "Realistic", icon: Camera },
  { id: "3d-pixar", label: "3D Pixar", icon: Box },
  { id: "claymation", label: "Claymation", icon: Hand },
  { id: "sketch", label: "Sketch", icon: PenTool },
  { id: "custom", label: "Custom", icon: Wand2 },
];

export function StyleSelector({ selected, customStyle, onSelect, onCustomStyleChange }: StyleSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Visual Style</h3>
      <div className="grid grid-cols-3 gap-2">
        {styles.map((style) => {
          const IconComponent = style.icon;
          return (
            <motion.button
              key={style.id}
              onClick={() => onSelect(style.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition-all",
                selected === style.id
                  ? "border-primary/50 bg-primary/5 shadow-sm"
                  : "border-transparent bg-muted/30 hover:bg-muted/50"
              )}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <IconComponent className={cn(
                "h-4 w-4",
                selected === style.id ? "text-primary" : "text-muted-foreground"
              )} />
              <span className={cn(
                "text-sm font-medium",
                selected === style.id ? "text-foreground" : "text-muted-foreground"
              )}>{style.label}</span>
            </motion.button>
          );
        })}
      </div>
      
      {selected === "custom" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="pt-2">
            <Input
              placeholder="Describe your custom style..."
              value={customStyle}
              onChange={(e) => onCustomStyleChange(e.target.value)}
              className="rounded-xl border-border/50 bg-muted/30 focus:bg-background"
            />
          </div>
        </motion.div>
      )}
    </div>
  );
}
