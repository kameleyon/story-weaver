import { toast as sonnerToast } from "sonner";
import type { ReactNode } from "react";

type ToastInput = {
  title?: ReactNode;
  description?: ReactNode;
  variant?: "default" | "destructive";
  action?: ReactNode;
  [key: string]: unknown;
};

function toast(input: ToastInput) {
  const { title, description, variant } = input;
  const msg = typeof title === "string" ? title : typeof description === "string" ? description : "";
  const desc = typeof title === "string" && typeof description === "string" ? description : undefined;

  if (variant === "destructive") {
    sonnerToast.error(msg || "Error", desc ? { description: desc } : undefined);
  } else {
    sonnerToast(msg, desc ? { description: desc } : undefined);
  }

  const id = String(Date.now());
  return {
    id,
    dismiss: () => sonnerToast.dismiss(),
    update: (_props: Partial<ToastInput>) => {},
  };
}

function useToast() {
  return {
    toast,
    dismiss: (toastId?: string) => sonnerToast.dismiss(),
    toasts: [] as any[],
  };
}

export { useToast, toast };
