// Slice C data: Messages mirror (F16) and the assistant's own thread (F17).
// A window on each person's OWN Messages threads, mirrored by their own Mac. Never a second channel.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export type ThreadKind = "assistant" | "group" | "direct";
export type Thread = { id: string; kind: ThreadKind; name: string; members: string[]; last_line: string; last_at: string; unread: number; pending_yn: number; mirrored: boolean };
export type MessageAction = { kind: "task_proposed" | "task_created" | "schedule_added"; label: string; status: "waiting" | "done"; requested_by: string; for_person: string };
export type Message = {
  id: string; thread_id: string; sender: string; mine: boolean; at: string; text: string;
  attachment?: { kind: "photo" | "link"; label: string } | null;
  action?: MessageAction | null;                   // what the assistant did or proposed from this line
  assistant_kind?: "confirmation" | "command" | "answer" | "notice" | null; // F17 only
};
export type Confirmation = { id: string; question: string; asked_at: string; via: "messages" | "dashboard"; status: "waiting" | "yes" | "no" | "stale"; action_kind: string; requested_by: string; for_person: string; source: string };

// ---- sample data ----
const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();
const t = (hh: number, mm: number) => { const x = new Date(); x.setHours(hh, mm, 0, 0); return x.toISOString(); };

const sampleThreads: Thread[] = [
  { id: "assistant", kind: "assistant", name: "Assistant", members: ["Ryan", "Assistant"], last_line: "Add task: pick up [Child 1] at 4 tomorrow? Reply Y or N", last_at: t(7, 56), unread: 1, pending_yn: 1, mirrored: true },
  { id: "family", kind: "group", name: "Family", members: ["Ryan", "Melissa", "[Child 1]", "[Child 2]"], last_line: "Melissa: can someone grab [Child 1] at 4 tomorrow?", last_at: t(7, 52), unread: 0, pending_yn: 0, mirrored: true },
  { id: "melissa", kind: "direct", name: "Melissa", members: ["Ryan", "Melissa"], last_line: "You: on my way", last_at: h(60), unread: 0, pending_yn: 0, mirrored: true },
  { id: "child1", kind: "direct", name: "[Child 1]", members: ["Ryan", "[Child 1]"], last_line: "[Child 1]: ok", last_at: h(100), unread: 0, pending_yn: 0, mirrored: true },
];

const sampleMessages: Message[] = [
  // Family group
  { id: "m1", thread_id: "family", sender: "Melissa", mine: false, at: t(7, 52), text: "can someone grab [Child 1] at 4 tomorrow? I have the dentist", action: { kind: "task_proposed", label: "Assistant proposed a task from this · waiting for your Y", status: "waiting", requested_by: "Melissa asked", for_person: "Ryan" } },
  { id: "m2", thread_id: "family", sender: "Ryan", mine: true, at: t(7, 55), text: "I've got it" },
  { id: "m3", thread_id: "family", sender: "[Child 2]", mine: false, at: t(7, 58), text: "we need milk", action: { kind: "task_created", label: "Added to the Smith's list", status: "done", requested_by: "[Child 2] asked", for_person: "Family" } },
  { id: "m4", thread_id: "family", sender: "Melissa", mine: false, at: t(8, 1), text: "Coach moved Thursday practice to 5:30 at [Field]", attachment: { kind: "link", label: "team calendar link" } },
  // Melissa direct
  { id: "m10", thread_id: "melissa", sender: "Melissa", mine: false, at: h(61), text: "leaving the office now, can you start dinner?" },
  { id: "m11", thread_id: "melissa", sender: "Ryan", mine: true, at: h(60), text: "on my way" },
  // Child 1 direct
  { id: "m20", thread_id: "child1", sender: "Ryan", mine: true, at: h(101), text: "practice is at 4:30, I'll pick you up from school" },
  { id: "m21", thread_id: "child1", sender: "[Child 1]", mine: false, at: h(100), text: "ok" },
  // Assistant thread (F17)
  { id: "a1", thread_id: "assistant", sender: "Assistant", mine: false, at: t(6, 30), text: "Morning. Cold start 34°, warming to 58. Rain from 3 pm during pickup and practice. Bring: jackets for the kids, umbrella. 2 things need you on the dashboard.", assistant_kind: "notice" },
  { id: "a2", thread_id: "assistant", sender: "Ryan", mine: true, at: t(7, 10), text: "when is the Sienna due?", assistant_kind: "command" },
  { id: "a3", thread_id: "assistant", sender: "Assistant", mine: false, at: t(7, 10), text: "Sienna: insurance card expires in 41 days; registration not due until [MONTH]. Nothing to do yet.", assistant_kind: "answer" },
  { id: "a4", thread_id: "assistant", sender: "Ryan", mine: true, at: t(7, 40), text: "mark the Tahoe oil change done at 143,100", assistant_kind: "command" },
  { id: "a5", thread_id: "assistant", sender: "Assistant", mine: false, at: t(7, 40), text: "Done. Tahoe oil change recorded at 143,100; next at 148,100. Logged.", assistant_kind: "notice", action: { kind: "task_created", label: "Recorded in Vehicles · Undo on the dashboard", status: "done", requested_by: "Ryan asked", for_person: "Ryan" } },
  { id: "a6", thread_id: "assistant", sender: "Assistant", mine: false, at: t(7, 56), text: "From Family (Melissa, 7:52): Add task: pick up [Child 1] at 4 tomorrow? Reply Y or N", assistant_kind: "confirmation", action: { kind: "task_proposed", label: "Waiting for Y or N · also answerable here", status: "waiting", requested_by: "Melissa asked", for_person: "Ryan" } },
];

const sampleConfirmations: Confirmation[] = [
  { id: "c1", question: "Add task: pick up [Child 1] at 4 tomorrow?", asked_at: t(7, 56), via: "messages", status: "waiting", action_kind: "task", requested_by: "Melissa asked", for_person: "Ryan", source: "Family thread" },
  { id: "c2", question: "Add to schedule: Thursday practice 5:30 at [Field]?", asked_at: t(8, 2), via: "dashboard", status: "waiting", action_kind: "schedule", requested_by: "Melissa asked", for_person: "[Child 1]", source: "Family thread" },
  { id: "c3", question: "Add milk to the Smith's list?", asked_at: h(30), via: "messages", status: "yes", action_kind: "list", requested_by: "[Child 2] asked", for_person: "Family", source: "Family thread" },
];

// ---- readers ----
export async function getThreads(): Promise<Thread[]> {
  if (!hasSupabaseEnv()) return sampleThreads;
  const sb = await createClient();
  // unread = replies not yet seen IN THE APP (notifications of type message with no dismissed_at), so the list pills
  // and the tab badge always agree. Messages' own is_read count would say something different after reading on a phone.
  const [{ data }, { data: fresh }] = await Promise.all([
    sb.from("messages_threads").select("*").order("last_at", { ascending: false }),
    sb.from("notifications").select("url").eq("type", "message").is("dismissed_at", null),
  ]);
  const unread = new Map<string, number>();
  for (const n of fresh ?? []) { const id = String(n.url ?? "").replace(/^\/messages\//, ""); unread.set(id, (unread.get(id) ?? 0) + 1); }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), kind: r.kind as ThreadKind, name: String(r.name), members: (r.members as string[]) ?? [], last_line: String(r.last_line ?? ""), last_at: String(r.last_at),
    unread: unread.get(String(r.id)) ?? 0, pending_yn: Number(r.pending_yn ?? 0), mirrored: Boolean(r.mirrored),
  }));
}

export async function getThread(id: string): Promise<Thread | null> {
  const all = await getThreads();
  return all.find((t) => t.id === id) ?? null;
}

export async function getMessages(threadId: string): Promise<Message[]> {
  if (!hasSupabaseEnv()) return sampleMessages.filter((m) => m.thread_id === threadId);
  const sb = await createClient();
  const { data } = await sb.from("messages").select("*").eq("thread_id", threadId).order("at", { ascending: false }).limit(200);
  // newest 200, shown oldest-first (the old query kept the OLDEST 200 and hid new lines)
  return ((data ?? []) as Array<Record<string, unknown>>).reverse().map((r) => ({
    id: String(r.id), thread_id: String(r.thread_id), sender: String(r.sender), mine: Boolean(r.is_me), at: String(r.at), text: String(r.text ?? ""),
    attachment: (r.attachment as Message["attachment"]) ?? null, action: (r.action as MessageAction) ?? null, assistant_kind: (r.assistant_kind as Message["assistant_kind"]) ?? null,
  }));
}

export async function getConfirmations(): Promise<Confirmation[]> {
  if (!hasSupabaseEnv()) return sampleConfirmations;
  const sb = await createClient();
  const { data } = await sb.from("assistant_confirmations").select("*").order("asked_at", { ascending: false }).limit(20);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), question: String(r.question), asked_at: String(r.asked_at), via: r.via as Confirmation["via"], status: r.status as Confirmation["status"], action_kind: String(r.action_kind), requested_by: String(r.requested_by ?? "System"), for_person: String(r.asked_for ?? ""), source: String(r.source_name ?? "Messages"),
  }));
}

export { clock } from "@/lib/c-shared";

// Chips: judgments the engine marked "shown" for this thread, keyed by message id. Taken/ignored ones are not chips.
export type Suggestion = { id: string; message_id: string; kind: "task" | "calendar" | "reply" | "receipt"; title: string; payload: Record<string, unknown>; reason: string };
export async function getSuggestions(threadId: string): Promise<Suggestion[]> {
  if (!hasSupabaseEnv()) return [];
  const sb = await createClient();
  const { data } = await sb.from("message_suggestions").select("id,message_id,kind,title,payload,reason").eq("thread_id", threadId).eq("status", "shown").order("created_at", { ascending: false }).limit(50);
  return (data ?? []).filter((r) => r.kind !== "none" && r.title) as Suggestion[];
}
