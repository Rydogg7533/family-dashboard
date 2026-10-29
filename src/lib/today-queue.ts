import type { Task } from "@/lib/data";

// The one queue on Today (decisions 2026-10-28 D23). Ordered so the person works it top to bottom:
//   1. urgent: overdue or due today
//   2. Inbox items waiting on this person's decision
//   3. replies waiting to be sent
//   4. everything else that needs them, soonest due first
// "new" = created after the person last opened Today; that count is the badge on the Today tab and the app icon.
// Client-safe: no server imports.
export type QueueInboxItem = { id: string; title: string; missing: string; captured_at: string; assigned_to: string | null; for_person: string | null; requested_by: string };
export type QueueItem =
  | { kind: "task"; id: string; task: Task; why: string | null; isNew: boolean; at: string }
  | { kind: "inbox"; id: string; item: QueueInboxItem; why: string; isNew: boolean; at: string };

const dayIn = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });

export function buildQueue(tasks: Task[], inbox: QueueInboxItem[], opts: { me: string | null; myName: string | null; tz: string; seenAt: string | null; now?: Date }): QueueItem[] {
  const now = opts.now ?? new Date();
  const today = dayIn(now.toISOString(), opts.tz);
  const isNew = (at: string) => !opts.seenAt || at > opts.seenAt;
  const urgent: QueueItem[] = [], decide: QueueItem[] = [], reply: QueueItem[] = [], rest: QueueItem[] = [];
  for (const t of tasks) {
    if (t.kind === "fyi") continue;
    const item: QueueItem = { kind: "task", id: t.id, task: t, why: null, isNew: isNew(t.created_at), at: t.created_at };
    if (t.due_at) {
      const d = dayIn(t.due_at, opts.tz);
      if (d < today) { urgent.push({ ...item, why: "Overdue" }); continue; }
      if (d === today) { urgent.push({ ...item, why: "Due today" }); continue; }
    }
    if (t.kind === "reply") { reply.push({ ...item, why: "Reply to send" }); continue; }
    rest.push(item);
  }
  for (const i of inbox) {
    const mine = (!i.assigned_to || i.assigned_to === opts.me) && (!i.for_person || !opts.myName || i.for_person.toLowerCase() === opts.myName.toLowerCase());
    if (!mine) continue;
    decide.push({ kind: "inbox", id: i.id, item: i, why: i.assigned_to ? `${i.requested_by} handed you this` : "Waiting on your decision", isNew: isNew(i.captured_at), at: i.captured_at });
  }
  const byDue = (a: QueueItem, b: QueueItem) => {
    const da = a.kind === "task" ? a.task.due_at ?? "" : "", db = b.kind === "task" ? b.task.due_at ?? "" : "";
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1; if (!da && db) return 1;
    return a.at < b.at ? 1 : -1;
  };
  urgent.sort(byDue); rest.sort(byDue);
  decide.sort((a, b) => (a.at < b.at ? 1 : -1)); reply.sort((a, b) => (a.at < b.at ? 1 : -1));
  return [...urgent, ...decide, ...reply, ...rest];
}

export const countNew = (q: QueueItem[]) => q.filter((x) => x.isNew).length;
