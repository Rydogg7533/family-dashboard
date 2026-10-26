import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";
import { defaultAssignment } from "@/lib/task-defaults";

// A task somebody typed. It carries an origin like every other task — "Ryan added this" rather than a
// blank — so the queue keeps its promise that everything on it says where it came from.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\b(the|a|an|to|for|of|and|my|our|is|it|about|please|call|re)\b/g, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => new Set(norm(s).split(" ").filter(Boolean));
export function closeness(a: string, b: string) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let same = 0; for (const w of A) if (B.has(w)) same++;
  return same / Math.min(A.size, B.size);
}

export const taskTools: Tool[] = [
  {
    name: "task.find", title: "Find tasks", kind: "read", tier: 1,
    description: "Search the household's open tasks by words in the title. Use before adding one, and to answer what is on someone's list.",
    input: { text: { type: "string", describe: "Words to look for in the task title", required: false } },
    async run(a, c) {
      const { data } = await c.sb.from("tasks").select("id, title, kind, status, due_at, person").eq("status", "open").limit(200);
      const q = str(a.text);
      const rows = (data ?? []) as { id: string; title: string; kind: string; due_at: string | null }[];
      const hits = q ? rows.filter((t) => closeness(q, t.title) >= 0.5 || t.title.toLowerCase().includes(q.toLowerCase())) : rows.slice(0, 20);
      return { ok: true, summary: `${hits.length} open task${hits.length === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}`, data: hits.map((t) => ({ id: t.id, title: t.title, kind: t.kind, due: t.due_at })) };
    },
  },
  {
    name: "task.add", title: "Add a task", kind: "write", tier: 2,
    description: "Put a task on the household list. Check task.find first: if something close is already open, say so instead of adding a second one.",
    input: {
      title: { type: "string", describe: "What needs doing, in a few words", required: true },
      due: { type: "date", describe: "When it is due, if the person said", required: false },
      kind: { type: "enum", options: ["do", "decide", "reply"], describe: "do = an errand, decide = a choice to make, reply = someone is waiting", required: false },
      note: { type: "string", describe: "Anything else the person said about it", required: false },
      mine: { type: "boolean", describe: "true only if the person said it is just for them; a household job goes to everyone by default", required: false },
    },
    async run(a, c) {
      const title = str(a.title).slice(0, 160);
      const { data: open } = await c.sb.from("tasks").select("id, title").eq("status", "open").limit(200);
      const near = ((open ?? []) as { id: string; title: string }[]).find((t) => closeness(title, t.title) >= 0.7);
      // D90: a household job shows for both and whoever gets to it first clears it. defaultAssignment
      // already encodes that -- "anything else about the household goes to both" -- and Inbox filing,
      // child unlocks and warranties all use it. Only an explicit "just me" narrows it.
      const assign = a.mine === true
        ? { person: c.userId, audience: "one" as const, fyi: [] as string[] }
        : await defaultAssignment(c.sb, c.userId);
      const row = {
        person: assign.person, audience: assign.audience, fyi: assign.fyi,
        kind: ["do", "decide", "reply"].includes(str(a.kind)) ? str(a.kind) : "do",
        title, summary: str(a.note) || null, due_at: str(a.due) || null,
        origin_kind: "person", origin_ref: c.userId, status: "open",
      };
      const { data, error } = await c.sb.from("tasks").insert(row).select("id").single();
      if (error) return { ok: false, error: error.message };
      const id = data.id as string;
      return { ok: true, summary: near ? `Added "${title}". Note: "${near.title}" is already open and looks close.` : `Added "${title}"`, href: `/tasks/${id}`, data: { id, alreadyOpen: near?.title ?? null } };
    },
  },
  {
    name: "task.done", title: "Mark a task done", kind: "write", tier: 1,
    description: "Mark one open task finished. Find its id with task.find first.",
    input: { id: { type: "string", describe: "The task's id", required: true } },
    async run(a, c) {
      const { data, error } = await c.sb.from("tasks").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", str(a.id)).eq("status", "open").select("title").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "That task is not open." };
      return { ok: true, summary: `Done: ${data.title}` };
    },
  },
];
