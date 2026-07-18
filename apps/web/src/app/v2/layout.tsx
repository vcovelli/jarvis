import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

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
    <div className="app-shell flex min-h-dvh flex-col bg-[radial-gradient(circle_at_top,#1b2235,#060912)] text-zinc-50 lg:flex-row">
      <Sidebar basePath="/v2" />
      <JarvisStateProvider>
        <main className="mx-auto flex-1 min-w-0 w-full max-w-7xl px-4 pb-24 pt-20 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:py-8 xl:px-10 xl:py-10">
          {children}
        </main>
      </JarvisStateProvider>
    </div>
  );
}
