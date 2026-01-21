import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
  gradient?: boolean;
}

export function GlassCard({ children, className, gradient, ...props }: GlassCardProps) {
  return (
    <motion.div
      className={cn(
        "relative rounded-2xl overflow-hidden",
        "bg-white/5 dark:bg-white/5 backdrop-blur-xl",
        "border border-white/10 dark:border-white/10",
        "shadow-xl transition-all duration-300",
        "hover:shadow-2xl hover:shadow-primary/10",
        "hover:-translate-y-1",
        className
      )}
      {...props}
    >
      {/* Subtle shine effect on top edge */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      
      {/* Optional gradient glow */}
      {gradient && (
        <div className="absolute -inset-px bg-gradient-to-br from-primary/20 via-transparent to-accent/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10" />
      )}
      
      {children}
    </motion.div>
  );
}
