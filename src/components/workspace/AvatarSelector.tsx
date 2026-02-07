import { User, Users, Bot, Sparkles } from "lucide-react";

export type AvatarType = "realistic-male" | "realistic-female" | "stylized" | "custom";

interface AvatarSelectorProps {
  selected: AvatarType;
  onSelect: (avatar: AvatarType) => void;
}

const avatarOptions: { id: AvatarType; label: string; icon: typeof User }[] = [
  { id: "realistic-male", label: "Realistic Male", icon: User },
  { id: "realistic-female", label: "Realistic Female", icon: Users },
  { id: "stylized", label: "Stylized Avatar", icon: Bot },
  { id: "custom", label: "Custom Character", icon: Sparkles },
];

export function AvatarSelector({ selected, onSelect }: AvatarSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70 flex items-center gap-2">
        <User className="h-3.5 w-3.5" />
        Avatar / Character
      </label>
      <div className="grid grid-cols-2 gap-2">
        {avatarOptions.map(({ id, label, icon: Icon }) => {
          const isSelected = selected === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all ${
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border/50 bg-card/30 hover:border-primary/30 hover:bg-muted/30"
              }`}
            >
              <Icon className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-sm ${isSelected ? "text-foreground font-medium" : "text-foreground/80"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
