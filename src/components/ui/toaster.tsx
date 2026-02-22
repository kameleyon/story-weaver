import * as React from "react";

// The Toaster component is no longer needed since we use Sonner directly.
// This file is kept for import compatibility but renders nothing extra.
// Sonner's <Toaster /> in App.tsx handles all toast rendering.

export function Toaster(): React.ReactElement | null {
  return null;
}
