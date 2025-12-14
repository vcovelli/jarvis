import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Jarvis OS — v2 Console",
  description: "Versioned console shell with mood, journal, todos, and sleep modules.",
};

export default function V2Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top,_#1b2235,_#060912)] text-zinc-50">
      <Sidebar basePath="/v2" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-10">{children}</main>
    </div>
  );
}
