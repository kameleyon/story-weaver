import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type VideoLength = "short" | "brief" | "presentation";

interface LengthSelectorProps {
  selected: VideoLength;
  onSelect: (length: VideoLength) => void;
}

const lengths: { id: VideoLength; label: string; duration: string }[] = [
  { id: "short", label: "Short", duration: "< 2 min" },
  { id: "brief", label: "Brief", duration: "< 5 min" },
  { id: "presentation", label: "Presentation", duration: "< 10 min" },
];

export function LengthSelector({ selected, onSelect }: LengthSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Length</h3>
      <div className="flex gap-2">
        {lengths.map((length) => (
          <motion.button
            key={length.id}
            onClick={() => onSelect(length.id)}
            className={cn(
              "flex-1 rounded-xl border-2 px-4 py-3 transition-all",
              selected === length.id
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-muted-foreground/30"
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <p className="text-sm font-medium">{length.label}</p>
            <p className="text-xs text-muted-foreground">{length.duration}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
