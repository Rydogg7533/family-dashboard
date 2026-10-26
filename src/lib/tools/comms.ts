import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";
import { sendLine } from "@/app/messages/actions";

// Messages, mail, calls, places. All of these are the asker's own (row-level security: own threads, own
// mailbox, own places), so Ask shows a person their own, never a spouse's. A message line goes out as the
// person, through the hub's Messages mirror, in a thread they already have; mail is read, never sent, and a
// reply is drafted on its task, never from here.

type Ctx = Parameters<Tool["run"]>[1];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9@.]+/g, " ").trim();
const words = (q: string) => norm(q).split(" ").filter((w) => w.length > 1);
const matches = (ws: string[], hay: string) => { const h = norm(hay); return ws.every((w) => h.includes(w)); };

async function threads(c: Ctx, text: string) {
  const { data } = await c.sb.from("messages_threads").select("id, kind, name, members, last_line, last_at, unread").order("last_at", { ascending: false }).limit(200);
  const ws = words(text);
  return ((data ?? []) as { id: string; kind: string; name: string; members: string[]; last_line: string | null; last_at: string | null; unread: number }[]).filter((t) => !ws.length || matches(ws, `${t.name} ${(t.members ?? []).join(" ")}`));
}

export const commsTools: Tool[] = [
  {
    name: "message.find", title: "Find a message thread", kind: "read", tier: 1,
    description: "The asker's own text-message threads mirrored from their phone: name, members, last line, unread count. Use before message.send, and for 'what did Melissa say', 'any unread texts'.",
    input: { text: { type: "string", describe: "A person or group name", required: false } },
    async run(a, c) {
      const rows = await threads(c, str(a.text));
      return { ok: true, summary: rows.length ? `${rows.length} thread${rows.length === 1 ? "" : "s"}${str(a.text) ? ` matching "${str(a.text)}"` : ""}. Each carries its id for message.send.` : `No thread${str(a.text) ? ` matching "${str(a.text)}"` : ""} is mirrored for you.`, data: rows.slice(0, 20).map((t) => ({ id: t.id, name: t.name, kind: t.kind, members: t.members, last: t.last_line, date: t.last_at ? t.last_at.slice(0, 10) : null, unread: t.unread, href: `/messages/${encodeURIComponent(t.id)}` })), href: "/messages" };
    },
  },
  {
    name: "message.send", title: "Send a text", kind: "write", tier: 2,
    description: "Send a line in one of the asker's own message threads, as them, through their phone. Find the thread with message.find first. The text goes exactly as given; say it back on the confirm card.",
    input: { threadId: { type: "string", describe: "From message.find", required: true }, text: { type: "string", describe: "The message, in the person's words", required: true } },
    async run(a) {
      const r = await sendLine(str(a.threadId), str(a.text));
      if (!r.ok) return { ok: false, error: r.error ?? "Could not send it." };
      return { ok: true, summary: `Queued to send: "${str(a.text)}". It goes out from your phone within a minute.`, href: `/messages/${encodeURIComponent(str(a.threadId))}` };
    },
  },
  {
    name: "mail.find", title: "Find mail", kind: "read", tier: 1,
    description: "The asker's own mailbox as the app sees it: who it is from, subject, date, whether it has attachments. Returns names and links, not the body. Use for 'did the school email', 'find the insurance email'.",
    input: { text: { type: "string", describe: "Sender, subject words or address", required: true }, limit: { type: "number", describe: "How many; 1 for 'the' one email", required: false } },
    async run(a, c) {
      const ws = words(str(a.text));
      if (!ws.length) return { ok: false, error: "Say who or what to look for." };
      const { data } = await c.sb.from("mail_messages").select("id, from_name, from_addr, subject, sent_at, unread, attachments").eq("folder", "inbox").is("left_inbox_at", null).order("sent_at", { ascending: false, nullsFirst: false }).limit(500);
      const rows = ((data ?? []) as { id: string; from_name: string | null; from_addr: string | null; subject: string | null; sent_at: string | null; unread: boolean; attachments: unknown[] | null }[]).filter((m) => matches(ws, `${m.from_name ?? ""} ${m.from_addr ?? ""} ${m.subject ?? ""}`));
      const want = Number.isFinite(Number(a.limit)) && Number(a.limit) > 0 ? Math.min(Number(a.limit), 20) : 20;
      const shown = rows.slice(0, want).map((m) => ({ id: m.id, name: m.subject || "(no subject)", from: m.from_name || m.from_addr, date: m.sent_at ? m.sent_at.slice(0, 10) : null, unread: m.unread, files: Array.isArray(m.attachments) ? m.attachments.length : 0, href: `/mail/${m.id}` }));
      return { ok: true, summary: rows.length ? `${rows.length} email${rows.length === 1 ? "" : "s"} match "${str(a.text)}"${rows.length > want ? `; showing the newest ${want}` : ""}. The person sees them as rows.` : `No email matching "${str(a.text)}" in your mailbox here.`, data: shown, href: shown.length === 1 ? shown[0].href : "/mail" };
    },
  },
  {
    name: "voice.find", title: "Phone calls the assistant made", kind: "read", tier: 1,
    description: "Calls the assistant has been asked to make or has made: purpose, who, status, outcome, when. Every call announces the assistant and the recording. Use for 'did you call the dentist', 'what happened on the AAA call'.",
    input: { text: { type: "string", describe: "Words from the purpose or who was called", required: false } },
    async run(a, c) {
      const { data } = await c.sb.from("voice_calls").select("id, purpose, callee, status, outcome, summary, requested_at, duration_min").order("requested_at", { ascending: false }).limit(30);
      const ws = words(str(a.text));
      const rows = ((data ?? []) as { id: string; purpose: string; callee: string; status: string; outcome: string | null; summary: string | null; requested_at: string; duration_min: number | null }[]).filter((r) => !ws.length || matches(ws, `${r.purpose} ${r.callee}`));
      return { ok: true, summary: rows.length ? `${rows.length} call${rows.length === 1 ? "" : "s"}. The person sees them as rows; the outcome field says what happened.` : "No calls on record.", data: rows.map((r) => ({ id: r.id, name: `${r.purpose} · ${r.callee}`, status: r.status, outcome: r.outcome, detail: r.summary, date: r.requested_at.slice(0, 10), minutes: r.duration_min, href: "/voice" })), href: "/voice" };
    },
  },
  {
    name: "place.find", title: "Places", kind: "read", tier: 1,
    description: "The asker's own named places (home, school, work, the gym) and how often they go. Use for 'how often do I go to the gym', 'what places do you know'. Where someone is right now is on the Family page, not here.",
    input: { text: { type: "string", describe: "A place name, to narrow", required: false } },
    async run(a, c) {
      const { data } = await c.sb.from("places").select("id, name, meaning, usual_activity, visits, indoors").order("visits", { ascending: false }).limit(100);
      const ws = words(str(a.text));
      const rows = ((data ?? []) as { id: string; name: string; meaning: string | null; usual_activity: string | null; visits: number; indoors: boolean | null }[]).filter((p) => !ws.length || matches(ws, `${p.name} ${p.meaning ?? ""} ${p.usual_activity ?? ""}`));
      return { ok: true, summary: rows.length ? `${rows.length} place${rows.length === 1 ? "" : "s"}.` : "No places named yet.", data: rows.map((p) => ({ id: p.id, name: p.name, meaning: p.meaning, activity: p.usual_activity, visits: p.visits, href: "/places" })), href: "/places" };
    },
  },
];
