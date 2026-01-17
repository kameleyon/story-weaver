import { Monitor, Smartphone, Square } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type VideoFormat = "landscape" | "portrait" | "square";

interface FormatSelectorProps {
  selected: VideoFormat;
  onSelect: (format: VideoFormat) => void;
  disabledFormats?: VideoFormat[];
}

const formats: { id: VideoFormat; label: string; ratio: string; icon: React.ElementType; badge?: string }[] = [
  { id: "landscape", label: "Landscape", ratio: "16:9", icon: Monitor },
  { id: "portrait", label: "Portrait", ratio: "9:16", icon: Smartphone, badge: "Shorts" },
  { id: "square", label: "Square", ratio: "1:1", icon: Square },
];

export function FormatSelector({ selected, onSelect, disabledFormats = [] }: FormatSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Format</h3>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {formats.map((format) => {
          const IconComponent = format.icon;
          const isDisabled = disabledFormats.includes(format.id);
          return (
            <motion.button
              key={format.id}
              onClick={() => !isDisabled && onSelect(format.id)}
              disabled={isDisabled}
              className={cn(
                "relative flex flex-col items-center gap-2 sm:gap-3 rounded-xl border p-3 sm:p-4 transition-all",
                isDisabled
                  ? "cursor-not-allowed opacity-40 border-transparent bg-muted/30"
                  : selected === format.id
                  ? "border-primary/50 bg-primary/10 shadow-sm"
                  : "border-transparent bg-muted/50 hover:bg-muted/60"
              )}
              whileHover={isDisabled ? {} : { scale: 1.01 }}
              whileTap={isDisabled ? {} : { scale: 0.99 }}
            >
              {format.badge && !isDisabled && (
                <span className="absolute -top-2 right-1 sm:right-2 rounded-full bg-primary px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[10px] font-medium text-primary-foreground">
                  {format.badge}
                </span>
              )}
              <div
                className={cn(
                  "flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-xl transition-colors",
                  isDisabled
                    ? "bg-muted/30 text-muted-foreground/50"
                    : selected === format.id 
                    ? "bg-primary/10 text-primary" 
                    : "bg-muted/50 text-muted-foreground"
                )}
              >
                <IconComponent className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="text-center">
                <p className={cn(
                  "text-xs sm:text-sm font-medium",
                  isDisabled
                    ? "text-muted-foreground/50"
                    : selected === format.id 
                    ? "text-foreground" 
                    : "text-muted-foreground"
                )}>{format.label}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground/70">{format.ratio}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
