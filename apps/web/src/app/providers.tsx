"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";

import { getStoredTheme } from "@/lib/theme";

function ThemeSync() {
  useEffect(() => {
    const theme = getStoredTheme();
    document.documentElement.dataset.theme = theme;
    document.body?.setAttribute("data-theme", theme);
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeSync />
      {children}
    </SessionProvider>
  );
}
