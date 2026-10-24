import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PullToRefresh } from "@/components/RefreshControls";
import { Nav } from "@/components/Nav";
import { AppearanceProvider } from "@/components/AppearanceProvider";
import { QuickBar } from "@/components/QuickBar";
import { TopBar } from "@/components/TopBar";
import { RecentTracker } from "@/components/RecentPages";
import { MainFrame } from "@/components/MainFrame";


export const metadata: Metadata = {
  title: "StewardOS",
  description: "What needs you today.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-180.png" },
  appleWebApp: { title: "StewardOS" },
};
export const viewport: Viewport = { themeColor: "#1F6FA3", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=Dancing+Script:wght@700&display=swap" /></head>
      <body className="min-h-full flex flex-col">
        <AppearanceProvider>
          <TopBar />
          <PullToRefresh />
          <MainFrame>{children}</MainFrame>
          <QuickBar />
          <RecentTracker />
          <Nav />
        </AppearanceProvider>
      </body>
    </html>
  );
}
