import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

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
      <PullToRefresh />
      <div className="app-shell flex min-h-dvh flex-col bg-[radial-gradient(circle_at_top,#1b2235,#060912)] text-zinc-50 lg:flex-row">
        <Sidebar basePath="/v2" />
        <main className="mx-auto flex-1 min-w-0 w-full max-w-7xl px-4 pb-[calc(var(--jarvis-mobile-nav-height)+1rem)] pt-20 sm:px-6 sm:pt-16 lg:px-8 lg:py-8 xl:px-10 xl:py-10">
          {children}
        </main>
      </div>
    </JarvisStateProvider>
  );
}
