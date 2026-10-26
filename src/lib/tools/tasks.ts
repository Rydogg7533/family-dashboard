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

type Ctx = Parameters<Tool["run"]>[1];
type Adult = { id: string; name: string };
async function adults(c: Ctx): Promise<Adult[]> {
  const { data } = await c.sb.from("profiles").select("id, display_name, role, created_at").neq("role", "child").order("created_at");
  return (data ?? []).map((p) => ({ id: p.id as string, name: String(p.display_name ?? "Member") }));
}
// "me", "household"/"both"/"everyone", or an adult's name (first name is enough). null when nobody matches.
function whoIs(target: string, me: string, people: Adult[]): { person: string; audience: "one" | "both"; name: string } | null {
  const t = target.toLowerCase().trim();
  if (!t || /^(me|mine|myself|just me)$/.test(t)) return { person: me, audience: "one", name: "you" };
  if (/^(household|both|everyone|anyone|us|all)$/.test(t)) return { person: me, audience: "both", name: "the household" };
  const p = people.find((x) => x.name.toLowerCase() === t) ?? people.find((x) => x.name.toLowerCase().startsWith(t)) ?? people.find((x) => t.includes(x.name.toLowerCase()));
  return p ? { person: p.id, audience: "one", name: p.name } : null;
}
async function logTask(c: Ctx, action: string, subject: string, ref: string) {
  const { data: me } = await c.sb.from("profiles").select("display_name").eq("id", c.userId).maybeSingle();
  const who = me?.display_name ?? c.email;
  await c.sb.from("activity_log").insert({ actor: who, action, subject: `${who} ${subject}`.slice(0, 120), ref, undoable: true }).then(() => {}, () => {});
  return who;
}
const taskRow = (t: { id: string; title: string; kind: string; due_at: string | null; audience?: string; person?: string }, people: Adult[], me: string) => ({
  id: t.id, name: t.title, kind: t.kind, date: t.due_at, who: t.audience === "both" ? "household" : t.person === me ? "you" : (people.find((p) => p.id === t.person)?.name ?? "someone"), href: `/tasks/${t.id}`,
});

export const taskTools: Tool[] = [
  {
    name: "task.find", title: "Find tasks", kind: "read", tier: 1,
    description: "Open tasks, by words in the title, by whose list (me, a named adult, household), or only the late ones. Use before adding one, to answer 'what's on my list', 'what does Melissa have', 'what's overdue'. The person sees the rows; do not repeat them.",
    input: {
      text: { type: "string", describe: "Words to look for in the task title", required: false },
      who: { type: "string", describe: "Whose list: 'me', an adult's name, or 'household' (jobs for everyone). Leave unset for everything open.", required: false },
      late: { type: "boolean", describe: "true for only tasks past their due date", required: false },
      limit: { type: "number", describe: "How many; 1 for 'the' one task", required: false },
    },
    async run(a, c) {
      const people = await adults(c);
      const { data } = await c.sb.from("tasks").select("id, title, kind, status, due_at, person, audience, fyi").eq("status", "open").order("due_at", { ascending: true, nullsFirst: false }).limit(300);
      const q = str(a.text), whoQ = str(a.who);
      let rows = (data ?? []) as { id: string; title: string; kind: string; due_at: string | null; person: string; audience: string; fyi: string[] | null }[];
      if (whoQ) {
        const w = whoIs(whoQ, c.userId, people);
        if (!w) return { ok: false, error: `Nobody called "${whoQ}" holds tasks. Adults here: ${people.map((p) => p.name).join(", ")}.` };
        rows = w.audience === "both" ? rows.filter((t) => t.audience === "both") : rows.filter((t) => t.audience === "both" || t.person === w.person);
      }
      if (a.late === true) rows = rows.filter((t) => t.due_at && t.due_at.slice(0, 10) < c.today);
      if (q) rows = rows.filter((t) => closeness(q, t.title) >= 0.5 || t.title.toLowerCase().includes(q.toLowerCase()));
      const want = Number.isFinite(Number(a.limit)) && Number(a.limit) > 0 ? Math.min(Number(a.limit), 30) : 30;
      const shown = rows.slice(0, want).map((t) => taskRow(t, people, c.userId));
      return { ok: true, summary: `${rows.length} open task${rows.length === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}${whoQ ? ` for ${whoQ}` : ""}${a.late === true ? ", late" : ""}${rows.length > want ? `; showing ${want}` : ""}.`, data: shown, href: shown.length === 1 ? shown[0].href : "/tasks" };
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
      for: { type: "string", describe: "An adult's name, when the person said it is for someone else ('for Melissa')", required: false },
    },
    async run(a, c) {
      const title = str(a.title).slice(0, 160);
      const { data: open } = await c.sb.from("tasks").select("id, title").eq("status", "open").limit(200);
      const near = ((open ?? []) as { id: string; title: string }[]).find((t) => closeness(title, t.title) >= 0.7);
      // D90: a household job shows for both and whoever gets to it first clears it. defaultAssignment
      // already encodes that -- "anything else about the household goes to both" -- and Inbox filing,
      // child unlocks and warranties all use it. Only an explicit "just me" or a named adult narrows it.
      const people = await adults(c);
      const named = str(a.for) ? whoIs(str(a.for), c.userId, people) : null;
      if (str(a.for) && !named) return { ok: false, error: `Nobody called "${str(a.for)}" holds tasks. Adults here: ${people.map((p) => p.name).join(", ")}.` };
      const assign = named && named.audience === "one"
        ? { person: named.person, audience: "one" as const, fyi: people.map((p) => p.id).filter((id) => id !== named.person) }
        : a.mine === true
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
      const { data: me } = await c.sb.from("profiles").select("display_name").eq("id", c.userId).maybeSingle();
      const { data, error } = await c.sb.from("tasks").update({ status: "done", done_by: me?.display_name ?? c.email, updated_at: new Date().toISOString() }).eq("id", str(a.id)).eq("status", "open").select("title").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "That task is not open." };
      await logTask(c, "task_done", `handled: ${String(data.title).slice(0, 80)}`, str(a.id));
      return { ok: true, summary: `Done: ${data.title}`, href: "/tasks?who=done" };
    },
  },
  {
    name: "task.snooze", title: "Snooze a task", kind: "write", tier: 1,
    description: "Put an open task aside until a date (default tomorrow). It comes back on its own. Find the id with task.find first.",
    input: { id: { type: "string", describe: "The task's id", required: true }, until: { type: "date", describe: "When it should come back; default tomorrow", required: false } },
    async run(a, c) {
      const until = str(a.until) || new Date(Date.parse(c.today) + 86_400_000).toISOString().slice(0, 10);
      if (until <= c.today) return { ok: false, error: "Snooze needs a day after today." };
      const { data, error } = await c.sb.from("tasks").update({ status: "snoozed", snoozed_until: `${until}T08:00:00`, updated_at: new Date().toISOString() }).eq("id", str(a.id)).eq("status", "open").select("title").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "That task is not open." };
      await logTask(c, "task_snoozed", `snoozed until ${until}: ${String(data.title).slice(0, 80)}`, str(a.id));
      return { ok: true, summary: `Snoozed until ${until}: ${data.title}`, href: `/tasks/${str(a.id)}` };
    },
  },
  {
    name: "task.drop", title: "Drop a task", kind: "write", tier: 2,
    description: "Dismiss an open task that should not be done at all. It goes to the finished list and can be put back. Find the id with task.find first.",
    input: { id: { type: "string", describe: "The task's id", required: true } },
    async run(a, c) {
      const { data: me } = await c.sb.from("profiles").select("display_name").eq("id", c.userId).maybeSingle();
      const { data, error } = await c.sb.from("tasks").update({ status: "dismissed", done_by: me?.display_name ?? c.email, updated_at: new Date().toISOString() }).eq("id", str(a.id)).eq("status", "open").select("title").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "That task is not open." };
      await logTask(c, "task_dismissed", `dropped: ${String(data.title).slice(0, 80)}`, str(a.id));
      return { ok: true, summary: `Dropped: ${data.title}. It is on the finished list if you change your mind.`, href: "/tasks?who=done" };
    },
  },
  {
    name: "task.reopen", title: "Put a task back", kind: "write", tier: 1,
    description: "Put a finished, dropped or snoozed task back on the open list.",
    input: { id: { type: "string", describe: "The task's id", required: true } },
    async run(a, c) {
      const { data, error } = await c.sb.from("tasks").update({ status: "open", done_by: null, snoozed_until: null, updated_at: new Date().toISOString() }).eq("id", str(a.id)).in("status", ["done", "dismissed", "snoozed"]).select("title").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "That task is already open, or it is not yours to change." };
      await logTask(c, "task_reopened", `put back: ${String(data.title).slice(0, 80)}`, str(a.id));
      return { ok: true, summary: `Back on the list: ${data.title}`, href: `/tasks/${str(a.id)}` };
    },
  },
  {
    name: "task.assign", title: "Change who a task is for", kind: "write", tier: 1,
    description: "Give an open task to 'me', a named adult, or the 'household' (everyone; whoever gets to it first clears it). The others get a heads-up on their list. Find the id with task.find first.",
    input: { id: { type: "string", describe: "The task's id", required: true }, to: { type: "string", describe: "'me', an adult's name, or 'household'", required: true } },
    async run(a, c) {
      const people = await adults(c);
      const w = whoIs(str(a.to), c.userId, people);
      if (!w) return { ok: false, error: `Nobody called "${str(a.to)}" holds tasks. Adults here: ${people.map((p) => p.name).join(", ")}.` };
      const fyi = w.audience === "both" ? [] : people.map((p) => p.id).filter((id) => id !== w.person);
      const { data, error } = await c.sb.from("tasks").update({ person: w.person, audience: w.audience, fyi, updated_at: new Date().toISOString() }).eq("id", str(a.id)).eq("status", "open").select("title").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "That task is not open." };
      await logTask(c, "task_assigned", `gave to ${w.name}: ${String(data.title).slice(0, 80)}`, str(a.id));
      return { ok: true, summary: `${data.title} is for ${w.name} now.`, href: `/tasks/${str(a.id)}` };
    },
  },
  {
    name: "task.take", title: "Take a task", kind: "write", tier: 1,
    description: "The person takes a household task as their own ('I've got this', 'I'll take it'). It leaves everyone else's list.",
    input: { id: { type: "string", describe: "The task's id", required: true } },
    async run(a, c) {
      const { data: t } = await c.sb.from("tasks").select("fyi").eq("id", str(a.id)).maybeSingle();
      const { data, error } = await c.sb.from("tasks").update({ person: c.userId, audience: "one", fyi: ((t?.fyi as string[] | null) ?? []).filter((x) => x !== c.userId), updated_at: new Date().toISOString() }).eq("id", str(a.id)).eq("status", "open").select("title").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "That task is not open." };
      await logTask(c, "task_taken", `took: ${String(data.title).slice(0, 80)}`, str(a.id));
      return { ok: true, summary: `Yours: ${data.title}`, href: `/tasks/${str(a.id)}` };
    },
  },
];
