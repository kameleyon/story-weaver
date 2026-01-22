import { useTheme } from "next-themes";
import { useEffect, useState, forwardRef, HTMLAttributes } from "react";
import audiomaxLogoLight from "@/assets/audiomax-logo-light.png";
import audiomaxLogoDark from "@/assets/audiomax-logo-dark.png";

interface ThemedLogoProps extends HTMLAttributes<HTMLImageElement> {
  className?: string;
  alt?: string;
}

export const ThemedLogo = forwardRef<HTMLImageElement, ThemedLogoProps>(
  ({ className = "h-10 w-auto", alt = "AudioMax", ...props }, ref) => {
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Avoid hydration mismatch
    useEffect(() => {
      setMounted(true);
    }, []);

    if (!mounted) {
      return <img ref={ref} src={audiomaxLogoLight} alt={alt} className={className} {...props} />;
    }

    const logoSrc = resolvedTheme === "dark" ? audiomaxLogoDark : audiomaxLogoLight;

    return <img ref={ref} src={logoSrc} alt={alt} className={className} {...props} />;
  }
);

ThemedLogo.displayName = "ThemedLogo";
