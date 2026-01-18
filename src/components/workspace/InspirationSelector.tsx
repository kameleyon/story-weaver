import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type InspirationStyle = 
  | "none"
  | "aaron-sorkin"
  | "quentin-tarantino"
  | "nora-ephron"
  | "david-mamet"
  | "agatha-christie"
  | "neil-gaiman"
  | "maya-angelou"
  | "ernest-hemingway";

interface InspirationSelectorProps {
  selected: InspirationStyle;
  onSelect: (style: InspirationStyle) => void;
}

const INSPIRATIONS: { id: InspirationStyle; label: string; description: string }[] = [
  { id: "none", label: "None (Neutral)", description: "Clean, straightforward narrative" },
  { id: "aaron-sorkin", label: "Aaron Sorkin", description: "Sharp, rapid-fire dialogue" },
  { id: "quentin-tarantino", label: "Quentin Tarantino", description: "Bold, unconventional narratives" },
  { id: "nora-ephron", label: "Nora Ephron", description: "Warm, romantic wit" },
  { id: "david-mamet", label: "David Mamet", description: "Terse, rhythmic dialogue" },
  { id: "agatha-christie", label: "Agatha Christie", description: "Mystery and suspense" },
  { id: "neil-gaiman", label: "Neil Gaiman", description: "Mythical storytelling" },
  { id: "maya-angelou", label: "Maya Angelou", description: "Poetic, uplifting prose" },
  { id: "ernest-hemingway", label: "Ernest Hemingway", description: "Sparse, powerful minimalism" },
];

export function InspirationSelector({ selected, onSelect }: InspirationSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
        Writing Inspiration
      </h3>
      <Select value={selected} onValueChange={(val) => onSelect(val as InspirationStyle)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a writing style" />
        </SelectTrigger>
        <SelectContent>
          {INSPIRATIONS.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              <div className="flex flex-col">
                <span className="font-medium">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
