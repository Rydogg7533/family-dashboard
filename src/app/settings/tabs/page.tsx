import Link from "next/link";
import { H1 } from "@/components/ui";
import { TabBarSettings } from "@/components/TabBarSettings";
import { getTabKeys } from "@/lib/tabs-server";

export const dynamic = "force-dynamic";

export default async function TabsPage() {
  const keys = await getTabKeys();
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>Tab bar</H1>
      <p className="text-sm text-muted mb-4">Pick what sits at the bottom of every screen, in order. Five fit on a phone; add more and the bar scrolls. More is always there and always last — everything you leave off stays one tap away under it.</p>
      <TabBarSettings initial={keys} />
    </>
  );
}
