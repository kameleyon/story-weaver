import { Activity } from "lucide-react";
import { Slider } from "@/components/ui/slider";

export type MotionIntensity = "subtle" | "moderate" | "expressive";

interface MotionIntensitySliderProps {
  value: MotionIntensity;
  onChange: (value: MotionIntensity) => void;
}

const intensityValues: MotionIntensity[] = ["subtle", "moderate", "expressive"];
const intensityLabels: Record<MotionIntensity, string> = {
  subtle: "Subtle",
  moderate: "Moderate",
  expressive: "Expressive",
};

export function MotionIntensitySlider({ value, onChange }: MotionIntensitySliderProps) {
  const currentIndex = intensityValues.indexOf(value);

  const handleSliderChange = (values: number[]) => {
    const index = Math.round(values[0]);
    onChange(intensityValues[index]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70 flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" />
          Motion Intensity
        </label>
        <span className="text-sm font-medium text-primary">{intensityLabels[value]}</span>
      </div>
      <Slider
        value={[currentIndex]}
        min={0}
        max={2}
        step={1}
        onValueChange={handleSliderChange}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-muted-foreground/60">
        <span>Calm</span>
        <span>Natural</span>
        <span>Dynamic</span>
      </div>
    </div>
  );
}
