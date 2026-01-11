import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import audiomaxLogoLight from "@/assets/audiomax-logo-light.png";
import audiomaxLogoDark from "@/assets/audiomax-logo.png";

interface ThemedLogoProps {
  className?: string;
  alt?: string;
}

export function ThemedLogo({ className = "h-10 w-auto", alt = "AudioMax" }: ThemedLogoProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <img src={audiomaxLogoLight} alt={alt} className={className} />;
  }

  const logoSrc = resolvedTheme === "dark" ? audiomaxLogoDark : audiomaxLogoLight;

  return <img src={logoSrc} alt={alt} className={className} />;
}
