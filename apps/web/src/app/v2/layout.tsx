import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { FirstRunWalkthrough } from "@/components/FirstRunWalkthrough";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Sidebar } from "@/components/Sidebar";
import { authOptions } from "@/lib/auth";
import { JarvisStateProvider } from "@/lib/jarvisStore";

export const metadata: Metadata = {
  title: "Jarvis OS — Console",
  description: "Versioned console shell with mood, journal, todos, and sleep modules.",
};

export default async function V2Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  return (
    <JarvisStateProvider>
      <FirstRunWalkthrough />
      <PullToRefresh />
      <div className="app-shell theme-shell flex h-dvh min-h-dvh overflow-hidden flex-col lg:flex-row">
        <Sidebar basePath="/v2" />
        <main className="flex min-h-0 flex-1 min-w-0 w-full max-w-none flex-col overflow-x-hidden overflow-y-auto overscroll-contain scroll-pb-[calc(var(--jarvis-mobile-nav-height)+2rem)] px-3 pb-[calc(var(--jarvis-mobile-nav-height)+2rem)] pt-16 sm:px-4 sm:pt-14 lg:px-4 lg:py-4 xl:px-5">
          {children}
        </main>
      </div>
    </JarvisStateProvider>
  );
}
