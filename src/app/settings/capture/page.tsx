import Link from "next/link";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { H1 } from "@/components/ui";
import CaptureSetup from "@/components/c/CaptureSetup";
import { createClient, getRequestUser, hasSupabaseEnv } from "@/lib/supabase/server";
import { sentTo } from "@/lib/ai-provider";

export const dynamic = "force-dynamic";

// Settings › Camera shortcut (Ryan, 2026-10-29): one tap from the iPhone lock screen, home screen, Action Button or
// Control Center takes a photo and drops it in the Inbox. A web app gets no widgets from Apple; a Shortcut is what it
// gets, and it covers every one of those surfaces. The token is issued here and shown once.
export default async function CaptureSettings() {
  let tokens: { id: string; label: string; created_at: string; last_seen_at: string | null }[] = [], who = "My", received = 0;
  const user = await getRequestUser();
  if (user && hasSupabaseEnv() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const sb = await createClient();
    const { data: prof } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    who = prof?.display_name ?? who;
    const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data } = await svc.from("device_tokens").select("id,label,created_at,last_seen_at").eq("kind", "capture").eq("person", user.id).is("revoked_at", null).order("created_at");
    tokens = data ?? [];
    const c = await sb.from("inbox_items").select("id", { count: "exact", head: true }).eq("origin", "Camera shortcut").eq("created_by", user.id);
    received = c.count ?? 0;
  }
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>Camera shortcut</H1>
      <p className="text-xs text-muted mb-3">Take a photo of a receipt or a paper from your lock screen and it lands in the Inbox, read by AI ({sentTo()}) and filed like anything else. Do not use it for statements or anything with account numbers. No need to open the app.</p>
      <CaptureSetup tokens={tokens} who={who} received={received} />
    </>
  );
}
