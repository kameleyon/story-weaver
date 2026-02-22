// Thin wrapper around sonner — kept for shadcn API compatibility.
// All actual toasting is handled by sonner; no global mutable state needed.

import { toast as sonnerToast } from "sonner";

type ToastProps = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  action?: React.ReactNode;
};

function toast({ title, description, variant, ...rest }: ToastProps) {
  if (variant === "destructive") {
    return sonnerToast.error(title, { description });
  }
  return sonnerToast(title, { description });
}

function useToast() {
  return {
    toast,
    dismiss: sonnerToast.dismiss,
    toasts: [] as ToastProps[],
  };
}

export { useToast, toast };
