import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AuthProvider } from "@/app/contexts/AuthContext";
import Navbar from "@/app/components/Navbar";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Arcseal - Matchmaking Lobby",
  description: "Stage 2: Main Menu, Leaderboards and Profiles",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable, "dark")}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-50">
        <AuthProvider>
          <Navbar />
          <main className="flex flex-col flex-1 w-full">{children}</main>
          <Toaster theme="dark" position="top-right" richColors closeButton />
        </AuthProvider>
      </body>
    </html>
  );
}
