import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jarvis OS — Mood Console",
  description:
    "Minimal Jarvis-inspired dashboard for logging moods and testing the UI shell.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="flex min-h-screen bg-[radial-gradient(circle_at_top,_#1b2235,_#060912)] text-zinc-50">
          <Sidebar />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-10">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
