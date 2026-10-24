import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { TabletPairing, type Tablet } from "@/components/c/TabletPairing";
import { isOwnerViewer } from "@/lib/owner";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export default async function TabletSettings() {
  const isOwner = await isOwnerViewer();
  let tablets: Tablet[] = [];
  // device_tokens holds credentials and is closed to browsers: read only label and dates, never the token.
  if (hasSupabaseEnv() && isOwner && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data } = await svc.from("device_tokens").select("id,label,created_at,last_seen_at").eq("kind", "kitchen").is("revoked_at", null).order("created_at");
    tablets = (data ?? []).map((t) => ({ id: t.id, label: t.label, createdAt: t.created_at, lastSeenAt: t.last_seen_at }));
  }
  return (
    <>
      <Link href="/settings/sitter" className="text-xs font-semibold text-accent">‹ Sitter sheet</Link>
      <H1>Kitchen tablet</H1>
      <p className="text-sm text-muted mb-3">Any tablet or old computer with a browser. Pair it once; after that it shows a quiet clock, and the sitter sheet only while a confirmed sitter night is happening.</p>
      <TabletPairing tablets={tablets} isOwner={isOwner} />
      <Card className="mt-3 text-xs text-muted">Tips: set the tablet never to sleep while plugged in, open the pairing link, then add the page to its Home Screen (Share › Add to Home Screen) so it opens full screen. The tablet can only show the one confirmed sitter sheet. It cannot open anything else in the app.</Card>
    </>
  );
}
