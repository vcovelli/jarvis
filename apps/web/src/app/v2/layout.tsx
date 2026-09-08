import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { FirstRunWalkthrough } from "@/components/FirstRunWalkthrough";
import { MobileSyncStatus } from "@/components/MobileSyncStatus";
import { WalkthroughCoach } from "@/components/onboarding/WalkthroughCoach";
import { PageViewport } from "@/components/PageViewport";
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
      <FirstRunWalkthrough>
        <MobileSyncStatus />
        <div className="app-shell theme-shell flex h-dvh min-h-dvh overflow-hidden flex-col lg:flex-row">
          <Sidebar basePath="/v2" />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PageViewport>
              {children}
            </PageViewport>
            <WalkthroughCoach />
          </div>
        </div>
      </FirstRunWalkthrough>
    </JarvisStateProvider>
  );
}
