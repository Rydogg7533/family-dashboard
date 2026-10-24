import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { SheetItem } from "@/lib/sitter-shared";

// The kitchen tablet has no login. It proves itself with a paired token (device_tokens, kind 'kitchen'), and everything it reads comes through the service
// role here, limited to the one confirmed night that is happening now. Nothing else in the household is reachable from this path.
const service = () => createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
export const TABLET_COOKIE = "kt";

export async function verifyTablet(token: string | undefined | null): Promise<boolean> {
  if (!token || token.length < 20 || token.length > 200 || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const svc = service();
  const { data } = await svc.from("device_tokens").select("id").eq("kind", "kitchen").eq("token", token).is("revoked_at", null).maybeSingle();
  if (!data) return false;
  await svc.from("device_tokens").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id).then(() => {}, () => {});
  return true;
}

export type TabletState =
  | { kind: "idle" }
  | { kind: "waiting"; title: string }
  | { kind: "active"; title: string; place: string | null; sitterName: string | null; backBy: string; note: string | null; noteAt: string | null; visitOnly: string | null; items: (SheetItem & { photoUrl: string | null })[] };

export async function getTabletState(): Promise<TabletState> {
  const svc = service(); const nowIso = new Date().toISOString();
  const { data: act } = await svc.from("sitter_nights").select("*").eq("status", "confirmed").gt("ends_at", nowIso).order("starts_at").limit(1).maybeSingle();
  if (!act) {
    // A parent has been prompted but has not confirmed: show only that the sheet is not ready. No household data.
    const { data: wait } = await svc.from("sitter_nights").select("title").eq("status", "awaiting_review").gt("ends_at", nowIso).limit(1).maybeSingle();
    return wait ? { kind: "waiting", title: wait.title } : { kind: "idle" };
  }
  const items = (act.sheet ?? []) as SheetItem[];
  const photoIds = Array.from(new Set(items.map((i) => i.photo).filter((x): x is string => !!x)));
  const urls = new Map<string, string>();
  if (photoIds.length) {
    const { data: ph } = await svc.from("item_photos").select("id, path, thumb_path, removed_at").in("id", photoIds);
    for (const p of ph ?? []) { if (p.removed_at) continue; const { data } = await svc.storage.from("captures").createSignedUrl(p.thumb_path ?? p.path, 3600); if (data) urls.set(p.id, data.signedUrl); }
  }
  return {
    kind: "active", title: act.title, place: act.place, sitterName: act.sitter_name, backBy: act.ends_at, note: act.note, noteAt: act.note_at, visitOnly: act.visit_only,
    items: items.map((i) => ({ ...i, photoUrl: i.photo ? urls.get(i.photo) ?? null : null })),
  };
}
