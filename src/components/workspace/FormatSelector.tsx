import { Monitor, Smartphone, Square } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type VideoFormat = "landscape" | "portrait" | "square";

interface FormatSelectorProps {
  selected: VideoFormat;
  onSelect: (format: VideoFormat) => void;
}

const formats: { id: VideoFormat; label: string; ratio: string; icon: React.ElementType; badge?: string }[] = [
  { id: "landscape", label: "Landscape", ratio: "16:9", icon: Monitor },
  { id: "portrait", label: "Portrait", ratio: "9:16", icon: Smartphone, badge: "Shorts" },
  { id: "square", label: "Square", ratio: "1:1", icon: Square },
];

export function FormatSelector({ selected, onSelect }: FormatSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Format</h3>
      <div className="grid grid-cols-3 gap-3">
        {formats.map((format) => {
          const IconComponent = format.icon;
          return (
            <motion.button
              key={format.id}
              onClick={() => onSelect(format.id)}
              className={cn(
                "relative flex flex-col items-center gap-3 rounded-xl border p-4 transition-all",
                selected === format.id
                  ? "border-primary/50 bg-primary/5 shadow-sm"
                  : "border-transparent bg-muted/30 hover:bg-muted/50"
              )}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              {format.badge && (
                <span className="absolute -top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                  {format.badge}
                </span>
              )}
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                  selected === format.id ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"
                )}
              >
                <IconComponent className="h-5 w-5" />
              </div>
              <div className="text-center">
                <p className={cn(
                  "text-sm font-medium",
                  selected === format.id ? "text-foreground" : "text-muted-foreground"
                )}>{format.label}</p>
                <p className="text-xs text-muted-foreground/70">{format.ratio}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
