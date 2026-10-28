import { createClient, getRequestUser, hasSupabaseEnv } from "@/lib/supabase/server";

export type Status = { key: string; state: "ok" | "warn" | "error" | "unknown"; summary: string; detail: string | null; value_num: number | null; updated_at: string };
export type RegisterRow = { id: string; source: string; kind: string | null; status: "DONE" | "RUNNING" | "TODO" | "WAIT" | "OUT"; landed_at: string | null; route: string | null; backup: string | null; last_verified: string | null; open_items: string | null; owner: string | null; sort_order: number };
export type Task = { id: string; kind: "reply" | "do" | "decide" | "fyi"; title: string; summary: string | null; origin_kind: string; origin_ref: string | null; due_at: string | null; tier: number; status: string; created_at: string; person?: string | null; audience?: "one" | "both"; fyi?: string[]; done_by?: string | null; updated_at?: string | null };
export type LogRow = { id: number; at: string; actor: string; action: string; subject: string; undoable: boolean };

export const HEARTBEAT_MAX_HOURS = 26;

// ---- sample data (shown when Supabase is not configured) ----
const now = Date.now();
const h = (n: number) => new Date(now - n * 3600_000).toISOString();

const sampleStatus: Status[] = [
  { key: "heartbeat", state: "ok", summary: "Mac mini reported 8:05 am", detail: null, value_num: null, updated_at: h(1) },
  { key: "mirror", state: "ok", summary: "Nightly mirror OK 2:31 am · 4 pairs, 0 differences", detail: "Organized, Code, _Inbox, Base-Drop Studio vault", value_num: null, updated_at: h(7) },
  { key: "time_machine", state: "warn", summary: "Time Machine set to Manual (by design while Ryan's 5TB is connected)", detail: null, value_num: null, updated_at: h(7) },
  { key: "free_space_mini", state: "warn", summary: "89 GB free of 1 TB", detail: null, value_num: 8.9, updated_at: h(1) },
  { key: "free_space_8tb", state: "ok", summary: "6.2 TB free of 7.3 TB", detail: null, value_num: 85, updated_at: h(1) },
];

const sampleRegister: RegisterRow[] = [
  { id: "1", source: "Mac mini home folder", kind: "Computer", status: "DONE", landed_at: "~/Organized", route: "Batches 1–23", backup: "8TB nightly mirror", last_verified: "2026-10-17", open_items: "~/_to_delete review", owner: "Ryan", sort_order: 1 },
  { id: "2", source: "Ryan's Backup (1.9 TB Seagate)", kind: "Old backup drive", status: "RUNNING", landed_at: "8TB/Archive, Media, Family", route: "Batch 14 rows 1–11", backup: "Drive kept as-is (read-only)", last_verified: "2026-10-18", open_items: "Row 11 (Current Photos unique), Dropbox extras", owner: "Ryan", sort_order: 2 },
  { id: "3", source: "iCloud Drive (304 GB)", kind: "Cloud", status: "WAIT", landed_at: null, route: "Inventory done; sort after external drive", backup: "—", last_verified: "2026-10-12", open_items: "BIG files deferred", owner: "Ryan", sort_order: 3 },
  { id: "4", source: "iMac backup 2024-02 (Ryan's 5TB)", kind: "Time Machine snapshot", status: "DONE", landed_at: "8TB/Archive/iMac 2024-02 snapshot", route: "Batch 12–13", backup: "5TB untouched", last_verified: "2026-10-17", open_items: null, owner: "Ryan", sort_order: 4 },
  { id: "5", source: "iCloud Photos (83k items)", kind: "Cloud photos", status: "TODO", landed_at: null, route: "After external drive", backup: "—", last_verified: null, open_items: "Compare with iPhoto 2012-2016", owner: "Ryan", sort_order: 5 },
  { id: "6", source: "Google Drive / Takeout per account", kind: "Cloud", status: "TODO", landed_at: null, route: "Takeout export", backup: "—", last_verified: null, open_items: null, owner: "Ryan", sort_order: 6 },
  { id: "7", source: "Daughter's iCloud", kind: "Cloud", status: "OUT", landed_at: null, route: "Out of scope (decision 2026-10-17)", backup: "—", last_verified: null, open_items: null, owner: null, sort_order: 7 },
];

const sampleTasks: Task[] = [
  { id: "t1", kind: "reply", title: "Insurance renewal question", summary: "Agent asks whether to keep the deductible and wants the declarations page back. Draft is ready; one attachment still missing.", origin_kind: "email", origin_ref: null, due_at: h(-20), tier: 3, status: "open", created_at: h(18) },
  { id: "t2", kind: "do", title: "Sign the field-trip permission form", summary: "From the school office · form attached · due Friday", origin_kind: "email", origin_ref: null, due_at: h(-96), tier: 2, status: "open", created_at: h(30) },
  { id: "t3", kind: "decide", title: "Extend the laptop protection plan?", summary: "Warranty ends in 30 days · Devices register", origin_kind: "system", origin_ref: null, due_at: h(-700), tier: 2, status: "open", created_at: h(40) },
  { id: "t4", kind: "fyi", title: "Amex statement arrived; close runs Thursday", summary: "Filed to Finance/Statements/2026", origin_kind: "email", origin_ref: null, due_at: null, tier: 1, status: "open", created_at: h(5) },
];

const sampleLog: LogRow[] = [
  { id: 1, at: h(2), actor: "agent", action: "filed", subject: "Amex statement → Finance/Statements/2026", undoable: true },
  { id: 2, at: h(3), actor: "agent", action: "archived", subject: "3 marketing emails", undoable: true },
  { id: 3, at: h(7), actor: "system", action: "mirrored", subject: "Nightly mirror: 4 pairs, 0 differences", undoable: false },
];

// ---- readers ----
export async function getStatus(): Promise<Status[]> {
  if (!hasSupabaseEnv()) return sampleStatus;
  const sb = await createClient();
  const { data } = await sb.from("system_status").select("*").order("key");
  return reconcile((data as Status[]) ?? []);
}

// The mirror row reports the LAST nightly run, so after a "not mounted" failure it stays red until the next
// 2:30 AM run even once the drive is back. When the mini's own later reading says the 8TB is mounted again,
// the failure is history, not a live fault: show it amber with what happens next, so the red banner clears
// on the first refresh after the hourly report sees the drive. The row in the database is not changed.
function reconcile(status: Status[]): Status[] {
  const mirror = status.find((s) => s.key === "mirror"), drive = status.find((s) => s.key === "free_space_8tb");
  if (!mirror || !drive || mirror.state !== "error" || drive.state !== "ok" || !/not mounted/i.test(mirror.summary)) return status;
  const failedAt = mirror.summary.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/)?.[1];
  return status.map((s) => s === mirror ? { ...s, state: "warn" as const,
    summary: `Missed ${failedAt ? `the ${failedAt} run` : "last night's run"} (8TB was unplugged). The drive is back; the next nightly run catches up.`,
    detail: s.summary } : s);
}

export async function getRegister(): Promise<RegisterRow[]> {
  if (!hasSupabaseEnv()) return sampleRegister;
  const sb = await createClient();
  const { data } = await sb.from("source_register").select("*").order("sort_order").order("source");
  return (data as RegisterRow[]) ?? [];
}

export async function getOpenTasks(): Promise<Task[]> {
  if (!hasSupabaseEnv()) return sampleTasks;
  const sb = await createClient();
  // A snoozed task comes back by itself when its time passes. Nothing else wakes them: before this, a
  // snoozed task stayed snoozed forever, which made Snooze a quiet way to lose a task.
  await sb.from("tasks").update({ status: "open", snoozed_until: null, updated_at: new Date().toISOString() }).eq("status", "snoozed").lte("snoozed_until", new Date().toISOString()).then(() => {}, () => {});
  const { data } = await sb.from("tasks").select("*").eq("status", "open").order("due_at", { ascending: true, nullsFirst: false });
  return (data as Task[]) ?? [];
}

// Done and dismissed, newest first. They are not gone. Most tasks are marked done BY HAND because the
// app cannot watch the job happen -- nothing tells it the furnace filter was changed -- so Done is a
// person's assertion, and an assertion can be wrong or mistapped. Everything here can be put back.
export async function getFinishedTasks(limit = 60): Promise<Task[]> {
  if (!hasSupabaseEnv()) return [];
  const sb = await createClient();
  const { data } = await sb.from("tasks").select("*").in("status", ["done", "dismissed"]).order("updated_at", { ascending: false }).limit(limit);
  return (data as Task[]) ?? [];
}

// Who can hold a task: adults only. is_member() is role <> 'child', so a child can neither read nor
// update a task -- assigning one to a child makes something nobody can see or finish. Both the tabs
// and the who-picker used to take "the first id that is not you", which in a three-person household
// picks whoever happens to come first.
export async function getTaskMembers(): Promise<{ id: string; name: string }[]> {
  if (!hasSupabaseEnv()) return [];
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("id, display_name, role, created_at").neq("role", "child").order("created_at");
  return (data ?? []).map((p) => ({ id: p.id as string, name: String(p.display_name ?? "Member") }));
}

export async function getLog(limit = 50): Promise<LogRow[]> {
  if (!hasSupabaseEnv()) return sampleLog;
  const sb = await createClient();
  const { data } = await sb.from("activity_log").select("*").order("at", { ascending: false }).limit(limit);
  return (data as LogRow[]) ?? [];
}

export async function getDisplayName(): Promise<string> {
  if (!hasSupabaseEnv()) return "Ryan";
  const sb = await createClient();
  const user = await getRequestUser();
  if (!user) return "";
  const { data } = await sb.from("profiles").select("display_name").eq("id", user.id).single();
  return data?.display_name ?? user.email ?? "";
}

// ---- derived ----
export function overall(status: Status[]) {
  const hb = status.find((s) => s.key === "heartbeat");
  const stale = !hb || Date.now() - new Date(hb.updated_at).getTime() > HEARTBEAT_MAX_HOURS * 3600_000;
  if (stale) return { level: "error" as const, text: `No report from the Mac mini in ${HEARTBEAT_MAX_HOURS}+ hours` };
  // One short line on Today; the whole summary stays on System health (Ryan, 2026-10-27: the mail summary dump).
  const errs = status.filter((s) => s.state === "error");
  if (errs.length) return { level: "error" as const, text: errs.length === 1 ? shortStatus(errs[0]) : `${shortStatus(errs[0])} · ${errs.length - 1} more` };
  if (status.some((s) => s.state === "warn")) return { level: "warn" as const, text: `${status.filter((s) => s.state === "warn").length} thing(s) need attention` };
  return { level: "ok" as const, text: "All good" };
}

// "mail_sync" + "Mail: admin@x: ERROR fetch failed (UND_ERR_SOCKET); admin@y: inbox …" → "Mail: admin@x: fetch failed (UND_ERR_SOCKET)".
export function shortStatus(s: Status) {
  const first = (s.summary ?? "").split(";")[0].replace(/\bERROR\s+/i, "").trim();
  const text = first.length > 110 ? first.slice(0, 107) + "…" : first;
  return text || s.key.replace(/_/g, " ");
}

export function ago(iso: string | null) {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export async function getPeopleNames(): Promise<Record<string, string>> {
  if (!hasSupabaseEnv()) return {};
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("id,display_name");
  return Object.fromEntries((data ?? []).map((p) => [p.id as string, String(p.display_name ?? "")]));
}
