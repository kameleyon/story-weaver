import { Monitor, Smartphone, Square } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type VideoFormat = "landscape" | "portrait" | "square";

interface FormatSelectorProps {
  selected: VideoFormat;
  onSelect: (format: VideoFormat) => void;
}

const formats: { id: VideoFormat; label: string; ratio: string; icon: React.ReactNode; badge?: string }[] = [
  { id: "landscape", label: "Landscape", ratio: "16:9", icon: <Monitor className="h-5 w-5" /> },
  { id: "portrait", label: "Portrait", ratio: "9:16", icon: <Smartphone className="h-5 w-5" />, badge: "Best for Shorts" },
  { id: "square", label: "Square", ratio: "1:1", icon: <Square className="h-5 w-5" /> },
];

export function FormatSelector({ selected, onSelect }: FormatSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Format</h3>
      <div className="grid grid-cols-3 gap-3">
        {formats.map((format) => (
          <motion.button
            key={format.id}
            onClick={() => onSelect(format.id)}
            className={cn(
              "relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
              selected === format.id
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-muted-foreground/30"
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {format.badge && (
              <span className="absolute -top-2 right-2 rounded-full bg-brand-pop px-2 py-0.5 text-[10px] font-medium text-brand-dark">
                {format.badge}
              </span>
            )}
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                selected === format.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {format.icon}
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">{format.label}</p>
              <p className="text-xs text-muted-foreground">{format.ratio}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
