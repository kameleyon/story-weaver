import { useState, useEffect } from "react";

const SIDEBAR_STATE_KEY = "audiomax-sidebar-state";

export function useSidebarState() {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(SIDEBAR_STATE_KEY);
      return stored !== null ? JSON.parse(stored) : true;
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify(isOpen));
  }, [isOpen]);

  const toggle = () => setIsOpen((prev) => !prev);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  return { isOpen, setIsOpen, toggle, open, close };
}
