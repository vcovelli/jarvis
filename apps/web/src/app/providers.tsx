"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";

import { applyThemeToDocument, getStoredTheme } from "@/lib/theme";

function ThemeSync() {
  useEffect(() => {
    applyThemeToDocument(getStoredTheme());
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus refetchInterval={0} refetchWhenOffline={false}>
      <ThemeSync />
      {children}
    </SessionProvider>
  );
}
