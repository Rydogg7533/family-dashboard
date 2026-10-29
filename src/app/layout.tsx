import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PullToRefresh } from "@/components/RefreshControls";
import { Nav } from "@/components/Nav";
import { AppearanceProvider } from "@/components/AppearanceProvider";
import { QuickBar } from "@/components/QuickBar";
import { TopBar } from "@/components/TopBar";
import { RecentTracker } from "@/components/RecentPages";
import { MainFrame } from "@/components/MainFrame";
import { getDisplayName } from "@/lib/data";
import { hasAiKey } from "@/lib/ai";
import { getTabKeys } from "@/lib/tabs-server";
import { DEFAULT_TABS } from "@/lib/tabs";
import { hasSupabaseEnv } from "@/lib/supabase/server";


export const metadata: Metadata = {
  title: "StewardOS",
  description: "What needs you today.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-180.png" },
  appleWebApp: { title: "StewardOS" },
};
// interactiveWidget: where the browser supports it (Chrome, and Safari from 17.4) the keyboard resizes the layout
// viewport itself and the browser animates it, so the Ask sheet needs no correction at all; older browsers ignore it
// and fall back to the visualViewport tracking in AskSheet.
export const viewport: Viewport = { themeColor: "#1F6FA3", width: "device-width", initialScale: 1, interactiveWidget: "resizes-content" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The + button's Ask sheet needs who is asking (the thread is kept per person) and whether a model is set.
  const who = (await getDisplayName().catch(() => "")) || "You";
  const tabKeys = await getTabKeys().catch(() => DEFAULT_TABS);
  return (
    <html lang="en" className="h-full antialiased">
      <head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=Dancing+Script:wght@700&display=swap" /></head>
      <body className="min-h-full flex flex-col">
        <AppearanceProvider>
          <TopBar />
          <PullToRefresh />
          <MainFrame>{children}</MainFrame>
          <QuickBar who={who} sample={!hasAiKey()} />
          <RecentTracker />
          <Nav tabKeys={tabKeys} live={hasSupabaseEnv()} />
        </AppearanceProvider>
      </body>
    </html>
  );
}
