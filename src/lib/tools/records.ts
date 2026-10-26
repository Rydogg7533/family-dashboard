import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";
import { resolveInboxItem } from "@/app/inbox/actions";

// Records (confirmations, tickets, claims, appointments, contracts) and the Inbox's open questions. A
// record is a reference -- number, date, where the file is -- never the document. Saving one from Ask
// writes the same row the email funnel writes, with the person named as the requester.

const KINDS = ["reservation", "ticket", "government", "insurance_claim", "warranty_return", "appointment", "service_contract", "support_case", "membership_license", "receipt"] as const;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (q: string) => norm(q).split(" ").filter((w) => w.length > 1);
const matches = (ws: string[], hay: string) => { const h = norm(hay); return ws.every((w) => h.includes(w)); };
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

export const recordTools: Tool[] = [
  {
    name: "record.find", title: "Find records", kind: "read", tier: 1,
    description: "Confirmations, tickets, government filings, insurance claims, appointments, contracts, memberships: title, number, date, who for, status. Use for 'what's needed soon', 'the Moab hotel confirmation', 'when is the passport appointment'.",
    input: { text: { type: "string", describe: "Words from the title, number or person", required: false }, kind: { type: "enum", options: [...KINDS], describe: "One kind only", required: false }, soon: { type: "boolean", describe: "true for only what is needed soon", required: false }, limit: { type: "number", describe: "How many; 1 for 'the' one record", required: false } },
    async run(a, c) {
      const { data } = await c.sb.from("records").select("id, kind, title, for_person, confirmation_number, happens_at, needed_until, status, file_ref").neq("status", "archived").order("happens_at", { ascending: true, nullsFirst: false }).limit(500);
      const ws = words(str(a.text)), kind = str(a.kind);
      const rows = ((data ?? []) as { id: string; kind: string; title: string; for_person: string | null; confirmation_number: string | null; happens_at: string | null; needed_until: string | null; status: string; file_ref: string | null }[]).filter((r) => (!ws.length || matches(ws, `${r.title} ${r.confirmation_number ?? ""} ${r.for_person ?? ""} ${r.kind}`)) && (!kind || r.kind === kind) && (a.soon !== true || r.status === "needed_soon"));
      const want = Number.isFinite(Number(a.limit)) && Number(a.limit) > 0 ? Math.min(Number(a.limit), 20) : 20;
      const shown = rows.slice(0, want).map((r) => ({ id: r.id, name: r.title, kind: r.kind.replace("_", " "), number: r.confirmation_number, date: r.happens_at, keptUntil: r.needed_until, who: r.for_person, status: r.status, where: r.file_ref, href: `/records/${r.id}` }));
      return { ok: true, summary: rows.length ? `${rows.length} record${rows.length === 1 ? "" : "s"}${ws.length ? ` matching "${str(a.text)}"` : ""}${a.soon ? " needed soon" : ""}. The person sees them as rows; give the number or date they asked for.` : `No record${ws.length ? ` matching "${str(a.text)}"` : ""}.`, data: shown, href: shown.length === 1 ? shown[0].href : "/records" };
    },
  },
  {
    name: "record.add", title: "Save a record", kind: "write", tier: 2,
    description: "Save a confirmation, ticket, appointment, claim or similar as a record: what it is, the number, when it happens, who it is for. Kept until it is no longer needed (30 days after the date by default), then archived, never deleted.",
    input: {
      title: { type: "string", describe: "What it is, e.g. 'Moab hotel, Nov 3-5'", required: true },
      kind: { type: "enum", options: [...KINDS], describe: "The kind of record", required: true },
      number: { type: "string", describe: "Confirmation or reference number, if given", required: false },
      date: { type: "date", describe: "When it happens or is due", required: false },
      for: { type: "string", describe: "Who it is for, if said", required: false },
      keepUntil: { type: "date", describe: "When it stops being needed; default 30 days after the date", required: false },
    },
    async run(a, c) {
      const { data: me } = await c.sb.from("profiles").select("display_name").eq("id", c.userId).maybeSingle();
      const date = str(a.date) || null;
      const until = str(a.keepUntil) || (date ? addDays(date, 30) : null);
      const row = { kind: str(a.kind), title: str(a.title).slice(0, 200), for_person: str(a.for).slice(0, 80) || null, confirmation_number: str(a.number).slice(0, 80) || null, happens_at: date, needed_until: until, retention_rule: until ? `until ${until}` : "until archived", source_name: "Ask", source_href: "/ask", requested_by: me?.display_name ?? c.email, status: date && addDays(c.today, 14) >= date ? "needed_soon" : "active" };
      const { data, error } = await c.sb.from("records").insert(row).select("id").single();
      if (error) return { ok: false, error: error.message };
      await c.sb.from("activity_log").insert({ actor: row.requested_by, action: "record_saved", subject: `${row.kind}: ${row.title}`, ref: data.id, undoable: false }).then(() => {}, () => {});
      return { ok: true, summary: `Saved ${row.title}${row.confirmation_number ? ` (#${row.confirmation_number})` : ""} under Records › ${row.kind.replace("_", " ")}${until ? `, kept until ${until}` : ""}.`, href: `/records/${data.id}` };
    },
  },
  {
    name: "inbox.list", title: "What's waiting in the Inbox", kind: "read", tier: 1,
    description: "Open Inbox items: things that need a person's answer, each with its question and the choices offered. Use for 'what's in the inbox', 'what needs me'. To answer one, call inbox.answer with the exact choice text.",
    input: {},
    async run(_a, c) {
      const { data } = await c.sb.from("inbox_items").select("id, title, missing, options, requested_by, captured_at, file_path").eq("status", "open").or(`file_path.is.null,read_at.not.is.null,captured_at.lt.${new Date(Date.now() - 3 * 60_000).toISOString()}`).order("captured_at", { ascending: true }).limit(50);
      const rows = ((data ?? []) as { id: string; title: string; missing: string; options: { label?: string; value?: string }[] | string[]; requested_by: string; captured_at: string; file_path: string | null }[]).map((r) => ({ id: r.id, name: r.title, question: r.missing, choices: (r.options ?? []).map((o) => (typeof o === "string" ? o : o.label ?? o.value ?? "")).filter(Boolean), asker: r.requested_by, date: r.captured_at.slice(0, 10), open: r.file_path ? `/api/capture/${r.id}` : null, href: "/inbox" }));
      return { ok: true, summary: rows.length ? `${rows.length} item${rows.length === 1 ? "" : "s"} waiting. The person sees them as rows; say what each is asking.` : "Nothing waiting in the Inbox.", data: rows, href: "/inbox" };
    },
  },
  {
    name: "inbox.answer", title: "Answer an Inbox item", kind: "write", tier: 2,
    description: "Answer one open Inbox item with one of its offered choices, exactly as worded (from inbox.list). This files the document or resolves the question the same way a tap on the Inbox does.",
    input: { id: { type: "string", describe: "The item's id from inbox.list", required: true }, answer: { type: "string", describe: "The choice, exactly as listed", required: true } },
    async run(a, c) {
      const id = str(a.id), answer = str(a.answer);
      const { data: row } = await c.sb.from("inbox_items").select("title, options, status").eq("id", id).maybeSingle();
      if (!row || row.status !== "open") return { ok: false, error: "That item is not open." };
      const choices = ((row.options ?? []) as ({ label?: string; value?: string } | string)[]).map((o) => (typeof o === "string" ? { label: o, value: o } : { label: o.label ?? o.value ?? "", value: o.value ?? o.label ?? "" }));
      const pick = choices.find((o) => o.label === answer || o.value === answer) ?? choices.find((o) => o.label.toLowerCase() === answer.toLowerCase());
      if (!pick) return { ok: false, error: `That is not one of the choices. Offered: ${choices.map((o) => o.label).join(" / ")}.` };
      const r = await resolveInboxItem(id, pick.value, false);
      if (!r.ok) return { ok: false, error: "Could not resolve it." };
      return { ok: true, summary: r.summary ? r.summary : `${row.title}: ${pick.label}.`, href: "/inbox" };
    },
  },
];
