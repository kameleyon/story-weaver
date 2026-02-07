import { Film, Sparkles, UserCircle, Palette, Wand2 } from "lucide-react";

export type AnimationStyle = "talking-avatar" | "character-animation" | "motion-graphics" | "cinematic";

interface AnimationStyleSelectorProps {
  selected: AnimationStyle;
  onSelect: (style: AnimationStyle) => void;
}

const animationStyles: { id: AnimationStyle; label: string; description: string; icon: typeof Film }[] = [
  {
    id: "talking-avatar",
    label: "Talking Avatar",
    description: "Lip-sync with head movement",
    icon: UserCircle,
  },
  {
    id: "character-animation",
    label: "Character Animation",
    description: "Full body gestures",
    icon: Sparkles,
  },
  {
    id: "motion-graphics",
    label: "Motion Graphics",
    description: "Animated text & graphics",
    icon: Palette,
  },
  {
    id: "cinematic",
    label: "Cinematic",
    description: "Film-quality scenes",
    icon: Film,
  },
];

export function AnimationStyleSelector({ selected, onSelect }: AnimationStyleSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70 flex items-center gap-2">
        <Wand2 className="h-3.5 w-3.5" />
        Animation Style
      </label>
      <div className="grid grid-cols-2 gap-3">
        {animationStyles.map(({ id, label, description, icon: Icon }) => {
          const isSelected = selected === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border transition-all text-left ${
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border/50 bg-card/30 hover:border-primary/30 hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-foreground/80"}`}>
                  {label}
                </span>
              </div>
              <span className="text-xs text-muted-foreground/70">{description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
