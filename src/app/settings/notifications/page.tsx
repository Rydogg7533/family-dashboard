import Link from "next/link";
import { H1 } from "@/components/ui";
import { NotificationSettings } from "@/components/NotificationSettings";
import { getViewer } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const viewer = await getViewer();
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>Notifications</H1>
      <NotificationSettings viewer={viewer.name} vapidKey={process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
    </>
  );
}
