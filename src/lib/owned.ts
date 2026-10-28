import "server-only";
import type { createClient } from "@/lib/supabase/server";

// D18, the things lifecycle: one view over the three registers that hold what the household owns (items, devices,
// vehicles), so Ask can answer "do we already have one of these?", link a replacement, and record a fate. Nothing here
// deletes: a thing that leaves gets a status and a date, and keeps its history.
type Sb = Awaited<ReturnType<typeof createClient>>;
export type Register = "item" | "device" | "vehicle";
export type Ref = `${Register}:${string}`;
export type Fate = "spare" | "sell" | "give" | "hand_down" | "trade_in" | "trash" | "lost" | "undecided" | "gone";
export const FATES: Fate[] = ["spare", "sell", "give", "hand_down", "trade_in", "trash", "lost", "undecided", "gone"];
export const SOURCES = ["bought", "gift", "hand_me_down", "inherited", "won"] as const;

export type Owned = { ref: Ref; register: Register; id: string; name: string; owner: string; status: string; since: string | null; detail: string; href: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (q: string) => norm(q).split(" ").filter((w) => w.length > 1 && !["the", "new", "old", "one", "for", "and", "our", "my"].includes(w));
const UUID = /^[0-9a-f-]{36}$/i;

export const parseRef = (s: string): { register: Register; id: string } | null => { const m = /^(item|device|vehicle):([0-9a-f-]{36})$/i.exec((s ?? "").trim()); return m ? { register: m[1] as Register, id: m[2] } : null; };

// Household members by first name: adults are profiles, children are children (which may or may not have a profile).
export async function people(sb: Sb) {
  const [{ data: ps }, { data: cs }] = await Promise.all([sb.from("profiles").select("id, display_name, role"), sb.from("children").select("id, display_name, profile_id").is("archived_at", null)]);
  const adults = (ps ?? []).filter((p) => p.role !== "child").map((p) => ({ kind: "person" as const, id: p.id as string, profileId: p.id as string, name: String(p.display_name ?? "") }));
  const kids = (cs ?? []).map((c) => ({ kind: "child" as const, id: c.id as string, profileId: (c.profile_id as string | null) ?? null, name: String(c.display_name ?? "") }));
  return [...adults, ...kids];
}
export async function whoIs(sb: Sb, name: string) {
  const q = norm(name); if (!q) return null;
  const all = await people(sb);
  return all.find((p) => norm(p.name) === q) ?? all.find((p) => norm(p.name).startsWith(q)) ?? null;
}

// Everything owned that matches some words, across the three registers. Only things still in the house (or undecided).
export async function findOwned(sb: Sb, text: string, opts: { includeGone?: boolean } = {}): Promise<Owned[]> {
  const ws = words(text);
  const ppl = await people(sb); const nameOf = (kind: string, id: string | null) => (id && ppl.find((p) => (kind === "child" ? p.kind === "child" && p.id === id : p.profileId === id))?.name) || "Family";
  const [{ data: items }, { data: devices }, { data: vehicles }] = await Promise.all([
    sb.from("items").select("id, name, category, brand, model, owner_kind, owner_id, status, created_at, location").is("deleted_at", null).limit(1000),
    sb.from("devices").select("id, name, kind, make, person, status, purchase_date, created_at").limit(300),
    sb.from("vehicles").select("id, name, short, year, make, model, driver, status, created_at").limit(50),
  ]);
  const here = (s: string) => ["active", "in use", "spare", "loaned", "for sale", "undecided", "needed"].includes(s) || (opts.includeGone && s === "gone");
  const out: Owned[] = [];
  for (const r of items ?? []) if (here(String(r.status))) out.push({ ref: `item:${r.id}`, register: "item", id: r.id as string, name: String(r.name), owner: nameOf(String(r.owner_kind), r.owner_id as string | null), status: String(r.status), since: (r.created_at as string)?.slice(0, 10) ?? null, detail: [r.brand, r.model, r.category].filter(Boolean).join(" "), href: `/things/${r.id}` });
  for (const r of devices ?? []) if (here(String(r.status))) out.push({ ref: `device:${r.id}`, register: "device", id: r.id as string, name: String(r.name), owner: nameOf("person", r.person as string | null), status: String(r.status), since: ((r.purchase_date ?? r.created_at) as string)?.slice(0, 10) ?? null, detail: [r.make, r.kind].filter(Boolean).join(" "), href: `/devices/${r.id}` });
  for (const r of vehicles ?? []) if (here(String(r.status ?? "active"))) out.push({ ref: `vehicle:${r.id}`, register: "vehicle", id: r.id as string, name: String(r.name), owner: nameOf("person", r.driver as string | null), status: String(r.status ?? "active"), since: (r.created_at as string)?.slice(0, 10) ?? null, detail: [r.year, r.make, r.model, r.short].filter(Boolean).join(" "), href: `/vehicles/${r.id}` });
  if (!ws.length) return out;
  const score = (o: Owned) => { const hay = norm(`${o.name} ${o.detail} ${o.owner}`); return ws.filter((w) => hay.includes(w)).length; };
  return out.map((o) => ({ o, s: score(o) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.o);
}

export async function getOwned(sb: Sb, ref: string): Promise<Owned | null> {
  const p = parseRef(ref); if (!p) return null;
  return (await findOwned(sb, "", { includeGone: true })).find((o) => o.id === p.id && o.register === p.register) ?? null;
}

// The fate of a thing that was replaced or is leaving. Household hand-downs change the owner and keep the thing active.
export async function applyFate(sb: Sb, ref: string, fate: Fate, to: string | undefined, note: string | undefined, actor: string): Promise<{ ok: true; said: string } | { ok: false; error: string }> {
  const p = parseRef(ref); if (!p) return { ok: false, error: "Which thing? Find it first." };
  const cur = await getOwned(sb, ref); if (!cur) return { ok: false, error: "That thing is not in the register." };
  const today = new Date().toISOString().slice(0, 10); const now = new Date().toISOString();
  const target = to ? await whoIs(sb, to) : null;
  if ((fate === "hand_down" || (fate === "give" && target)) && to && !target && fate === "hand_down") return { ok: false, error: `Who is ${to}? Nobody in the household by that name.` };
  const n = note?.trim().slice(0, 300) || undefined;
  if (p.register === "item") {
    let patch: Record<string, unknown>;
    if (target && (fate === "hand_down" || fate === "give")) patch = { owner_kind: target.kind, owner_id: target.id, status: "active", status_at: null, status_note: null, notes: `Handed down to ${target.name} ${today}${n ? ` (${n})` : ""}`, fate_asked_at: null };
    else if (fate === "spare") patch = { status: "active", status_at: null, status_note: `spare${n ? `: ${n}` : ""}`, fate_asked_at: null };
    else patch = { status: fate === "sell" || fate === "trade_in" ? "sold" : fate === "give" ? "given_away" : fate === "trash" ? "discarded" : fate === "lost" ? "lost" : fate, status_at: today, status_note: [fate === "trade_in" ? "trade-in" : null, to && !target ? `to ${to}` : null, n].filter(Boolean).join("; ") || null, fate_asked_at: fate === "undecided" || fate === "gone" ? now : null };
    const { error } = await sb.from("items").update({ ...patch, updated_by: actor, updated_at: now }).eq("id", p.id);
    if (error) return { ok: false, error: error.message };
  } else if (p.register === "device") {
    let patch: Record<string, unknown>;
    if (target && (fate === "hand_down" || fate === "give")) patch = target.profileId ? { person: target.profileId, status: "in use", note: `Handed down to ${target.name} ${today}${n ? ` (${n})` : ""}`, fate_asked_at: null } : { status: "in use", note: `${target.name}'s now (handed down ${today})${n ? ` (${n})` : ""}`, fate_asked_at: null };
    else if (fate === "spare") patch = { status: "spare", fate_asked_at: null };
    else if (fate === "sell") patch = { status: "for sale", note: n ?? null, fate_asked_at: null };
    else if (fate === "undecided" || fate === "gone") patch = { status: fate, fate_asked_at: now };
    else if (fate === "lost") patch = { status: "lost", fate_asked_at: null };
    else patch = { status: "retired", note: [fate === "trade_in" ? "traded in" : fate === "give" ? `given${to ? ` to ${to}` : " away"}` : "discarded", today, n].filter(Boolean).join(" · "), fate_asked_at: null };
    const { error } = await sb.from("devices").update({ ...patch, updated_by: actor, updated_at: now }).eq("id", p.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const status = fate === "spare" ? "active" : fate === "sell" || fate === "trade_in" ? "sold" : fate === "give" || fate === "hand_down" ? (target?.profileId ? "active" : "given_away") : fate === "trash" ? "scrapped" : fate;
    const patch: Record<string, unknown> = { status, fate_asked_at: fate === "undecided" || fate === "gone" ? now : null };
    if (target?.profileId && (fate === "hand_down" || fate === "give")) patch.driver = target.profileId;
    const { error } = await sb.from("vehicles").update({ ...patch, updated_by: actor, updated_at: now }).eq("id", p.id);
    if (error) return { ok: false, error: error.message };
  }
  await sb.from("activity_log").insert({ actor, action: "fate", subject: cur.name, ref: p.id, undoable: false, detail: `${fate}${to ? ` → ${to}` : ""}` }).then(() => {}, () => {});
  const said = target && (fate === "hand_down" || fate === "give") ? `${cur.name} is ${target.name}'s now` : fate === "spare" ? `${cur.name} is kept as a spare` : fate === "undecided" ? `${cur.name} is marked undecided; I'll check back in a few weeks` : fate === "gone" ? `${cur.name} is marked gone; the review will ask once how it went` : fate === "sell" ? `${cur.name} is marked for sale` : fate === "trade_in" ? `${cur.name} is marked traded in` : fate === "give" ? `${cur.name} is marked given away${to ? ` to ${to}` : ""}` : fate === "trash" ? `${cur.name} is marked discarded` : `${cur.name} is marked lost`;
  return { ok: true, said };
}

// The new thing points at the old and the old at the new, across registers.
export async function linkReplacement(sb: Sb, newRef: string, oldRef: string) {
  const a = parseRef(newRef), b = parseRef(oldRef); if (!a || !b) return;
  const table = (r: Register) => (r === "item" ? "items" : r === "device" ? "devices" : "vehicles");
  await sb.from(table(a.register)).update({ replaces: oldRef }).eq("id", a.id).then(() => {}, () => {});
  await sb.from(table(b.register)).update({ replaced_by: newRef }).eq("id", b.id).then(() => {}, () => {});
}

// Undecided or gone things the review should ask about: never asked, or asked more than 30 days ago.
export async function stillDeciding(sb: Sb): Promise<Owned[]> {
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
  const all = await findOwned(sb, "", { includeGone: true });
  const rows: Owned[] = [];
  const check = async (table: string, register: Register) => {
    const { data } = await sb.from(table).select("id, fate_asked_at, status").in("status", ["undecided", "gone"]);
    for (const r of data ?? []) if (!r.fate_asked_at || String(r.fate_asked_at) < cutoff) { const o = all.find((x) => x.register === register && x.id === r.id); if (o) rows.push(o); }
  };
  await Promise.all([check("items", "item"), check("devices", "device"), check("vehicles", "vehicle")]);
  return rows;
}
export const isUuid = (s: string) => UUID.test(s);
