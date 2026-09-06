import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { FirstRunWalkthrough } from "@/components/FirstRunWalkthrough";
import { PageViewport } from "@/components/PageViewport";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Sidebar } from "@/components/Sidebar";
import { authOptions } from "@/lib/auth";
import { JarvisStateProvider } from "@/lib/jarvisStore";

export const metadata: Metadata = {
  title: "Jarvis OS — Console",
  description: "Private planning, reflection, health, finance, assistant, and systems workspace.",
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
        <PageViewport>
          {children}
        </PageViewport>
      </div>
    </JarvisStateProvider>
  );
}
