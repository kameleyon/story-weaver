import { forwardRef, HTMLAttributes } from "react";
import audiomaxLogo from "@/assets/audiomax-logo-full.png";

interface ThemedLogoProps extends HTMLAttributes<HTMLImageElement> {
  className?: string;
  alt?: string;
}

export const ThemedLogo = forwardRef<HTMLImageElement, ThemedLogoProps>(
  ({ className = "h-10 w-auto", alt = "AudioMax", ...props }, ref) => {
    return <img ref={ref} src={audiomaxLogo} alt={alt} className={className} {...props} />;
  }
);

ThemedLogo.displayName = "ThemedLogo";
