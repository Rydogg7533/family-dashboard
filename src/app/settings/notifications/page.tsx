import Link from "next/link";
import { H1 } from "@/components/ui";
import { NotificationSettings } from "@/components/NotificationSettings";
import { getViewer } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

// A key pasted into a dashboard field can carry a stray space, quote or line break; keep only base64url characters.
// An uncompressed P-256 public key is always 87 characters, so anything trailing the 87th is paste debris.
const cleanKey = (k: string) => k.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 87);

export default async function NotificationsPage() {
  const viewer = await getViewer();
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>Notifications</H1>
      <NotificationSettings viewer={viewer.name} vapidKey={cleanKey(process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "")} />
    </>
  );
}
