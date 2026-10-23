import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PullToRefresh } from "@/components/RefreshControls";
import { Nav } from "@/components/Nav";
import { AppearanceProvider } from "@/components/AppearanceProvider";
import { QuickBar } from "@/components/QuickBar";
import { TopBar } from "@/components/TopBar";
import { RecentTracker } from "@/components/RecentPages";


export const metadata: Metadata = {
  title: "Family Dashboard",
  description: "What needs you today.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-180.png" },
};
export const viewport: Viewport = { themeColor: "#1F6FA3", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&display=swap" /></head>
      <body className="min-h-full flex flex-col">
        <AppearanceProvider>
          <TopBar />
          <PullToRefresh />
          <main className="flex-1 w-full max-w-md mx-auto px-5 pt-[calc(44px+env(safe-area-inset-top)+16px)] pb-[var(--page-bottom)]">{children}</main>
          <QuickBar />
          <RecentTracker />
          <Nav />
        </AppearanceProvider>
      </body>
    </html>
  );
}
