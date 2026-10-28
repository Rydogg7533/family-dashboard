import "server-only";
// Sitters through Ask (spec: claude/stewardos-sitter-ask-intents-2026-10-27.md, D5 conversational). The hinge: a visit is planned
// only when a sitter is named (or "tonight"); "I need a sitter Friday" is a question back, never a night. Nothing texts a sitter.
import type { Tool, ToolCtx } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";
import { getSitters, getNights } from "@/lib/data-sitter";
import { createNight, bookNight, openNights, matchSitter, type NightCtx } from "@/lib/sitter-nights";
import { addSitterFromContact, addSitterNew, searchContactsForSitter, updateSitter } from "@/app/settings/sitter/templates-actions";
import { fmtWhen } from "@/lib/sitter-shared";
import { debriefNight } from "@/app/sitter/actions";

const nc = (c: ToolCtx): NightCtx => ({ sb: c.sb, userId: c.userId, actor: c.email });
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;
const timeOr = (v: unknown, d: string) => (TIME.test(str(v)) ? str(v) : d);
const nightRow = (n: { id: string; title: string; status: string; sitter_name: string | null; starts_at: string; ends_at: string; place: string | null }) => ({
  id: n.id, name: n.status === "needed" ? `Sitter needed ${fmtWhen(n.starts_at)}` : `${n.sitter_name ?? "Sitter"} ${fmtWhen(n.starts_at)} to ${fmtWhen(n.ends_at)}`, status: n.status, sitter: n.sitter_name, where: n.place, date: n.starts_at.slice(0, 10), href: `/sitter/review/${n.id}`,
});
// The one open night the person means: by date if given, else the only open one, else the nearest with a hint about the others.
async function pickNight(c: ToolCtx, date: string, want?: (s: string) => boolean) {
  let list = await openNights(nc(c)); if (want) list = list.filter((n) => want(n.status));
  if (date) list = list.filter((n) => n.starts_at.slice(0, 10) === date);
  if (!list.length) return { night: null, error: date ? `No sitter visit is planned for ${date}.` : "No sitter visit is open." };
  if (list.length > 1 && !date) return { night: null, error: `More than one visit is open: ${list.map((n) => nightRow(n).name).join("; ")}. Say which date.` };
  return { night: list[0], error: null };
}

export const sitterTools: Tool[] = [
  {
    name: "sitter.find", title: "Sitter visits and sitters", kind: "read", tier: 1,
    description: "What is planned with sitters, who the approved sitters are, or past visits. what=visits lists open and upcoming visits (needed, planned, confirmed); what=sitters lists the approved sitters with phone and last visit; what=past lists ended visits (optionally for one sitter). Use before planning or answering any sitter question.",
    input: { what: { type: "enum", options: ["visits", "sitters", "past"], describe: "Which list", required: true }, sitter: { type: "string", describe: "A sitter's first name, to narrow past visits" } },
    async run(a, c) {
      const what = str(a.what);
      if (what === "sitters") {
        const list = (await getSitters()).filter((s) => s.approvedAt);
        return { ok: true, summary: list.length ? `${list.length} approved sitter${list.length === 1 ? "" : "s"}: ${list.map((s) => s.name).join(", ")}` : "No approved sitters yet.", data: list.map((s) => ({ id: s.id, name: s.name, phone: s.phone, relationship: s.relationship, rate: s.rateText, lastVisit: s.lastVisitAt, href: `/settings/sitter/people/${s.id}` })) };
      }
      if (what === "past") {
        const q = str(a.sitter).toLowerCase();
        const rows = (await getNights(["ended"], 20)).filter((n) => !q || (n.sitterName ?? "").toLowerCase().includes(q));
        return { ok: true, summary: rows.length ? `${rows.length} past visit${rows.length === 1 ? "" : "s"}${q ? ` with ${rows[0].sitterName}` : ""}; the last was ${fmtWhen(rows[0].startsAt)}.` : `No past visits${q ? ` with ${q}` : ""}.`, data: rows.map((n) => ({ id: n.id, name: `${n.sitterName ?? "Sitter"} ${fmtWhen(n.startsAt)}`, sitter: n.sitterName, date: n.startsAt.slice(0, 10), href: `/settings/sitter` })) };
      }
      const list = await openNights(nc(c));
      return { ok: true, summary: list.length ? list.map((n) => nightRow(n).name + (n.status === "needed" ? " (no sitter yet)" : n.status === "confirmed" ? " (on the tablet)" : "")).join("; ") : "No sitter visit is planned.", data: list.map(nightRow) };
    },
  },
  {
    name: "sitter.plan", title: "Plan a sitter visit", kind: "write", tier: 2,
    description: "Plan a visit with a sitter who IS booked: the date, when the parents leave and are back, and the sitter's name. The usual instructions are applied automatically; the person reviews the sheet on the page this returns. Only call this when the person named the sitter or said the sitter is coming (\"Emma's sitting Friday\", \"we have a sitter tonight\"). If they only said they need a sitter, do not call this: ask whether they have someone, and use sitter.need if they are still looking.",
    input: { date: { type: "date", describe: "The day", required: true }, leave: { type: "string", describe: "When the parents leave, 24-hour HH:MM (default 18:00)" }, back: { type: "string", describe: "When they are back, HH:MM (default 22:00)" }, sitter: { type: "string", describe: "The sitter's name as the person said it", required: true }, place: { type: "string", describe: "Where the parents will be, if said" } },
    async run(a, c) {
      const date = str(a.date); if (!DATE.test(date)) return { ok: false, error: "Which day?" };
      const sitter = str(a.sitter); if (!sitter) return { ok: false, error: "Who is sitting? If nobody yet, use sitter.need." };
      const m = await matchSitter(sitter);
      if (m === "ambiguous") return { ok: false, error: `More than one approved sitter is called ${sitter}. Which one?` };
      const r = await createNight(nc(c), { date, leaveTime: timeOr(a.leave, "18:00"), backTime: timeOr(a.back, "22:00"), sitterName: sitter, sitterPersonId: m ? m.id : null, place: str(a.place) });
      if (!r.ok) return { ok: false, error: r.error ?? "Could not plan it." };
      const note = m ? "" : ` ${sitter} isn't on your sitter list; say "add ${sitter} as a sitter" if you want them on it.`;
      return { ok: true, summary: `Planned ${date} with ${m ? m.name : sitter}, usual instructions in. Open the sheet to look or confirm.${note}`, href: `/sitter/review/${r.id}`, data: { id: r.id, approved: !!m } };
    },
  },
  {
    name: "sitter.need", title: "Note that a sitter is needed", kind: "write", tier: 1,
    description: "The person needs a sitter on a day but has not found one. Records it (it shows on Today as 'still need a sitter'); nothing is scheduled and no reminders fire until someone is booked. Also the right call when they want the instructions ready before a sitter is found.",
    input: { date: { type: "date", describe: "The day", required: true }, leave: { type: "string", describe: "When the parents leave, HH:MM (default 18:00)" }, back: { type: "string", describe: "When they are back, HH:MM (default 22:00)" }, place: { type: "string", describe: "Where the parents will be, if said" } },
    async run(a, c) {
      const date = str(a.date); if (!DATE.test(date)) return { ok: false, error: "Which day?" };
      const r = await createNight(nc(c), { date, leaveTime: timeOr(a.leave, "18:00"), backTime: timeOr(a.back, "22:00"), place: str(a.place), needed: true });
      if (!r.ok) return { ok: false, error: r.error ?? "Could not note it." };
      return { ok: true, summary: `Noted: sitter needed ${date}. Say who when someone says yes; the sheet can be prepared any time.`, href: `/sitter/review/${r.id}`, data: { id: r.id } };
    },
  },
  {
    name: "sitter.booked", title: "A sitter said yes", kind: "write", tier: 2,
    description: "Someone agreed to sit for a day that was noted as needing a sitter (\"Emma's in\", \"got Grandma for Friday\"). Puts their name on that visit and schedules it with the usual instructions.",
    input: { sitter: { type: "string", describe: "Who said yes", required: true }, date: { type: "date", describe: "The day, if more than one visit is waiting" } },
    async run(a, c) {
      const { night, error } = await pickNight(c, str(a.date), (s) => s === "needed");
      if (!night) return { ok: false, error: error ?? "Nothing is waiting for a sitter." };
      const r = await bookNight(nc(c), night.id, str(a.sitter));
      if (!r.ok) return { ok: false, error: r.error ?? "Could not book it." };
      return { ok: true, summary: `${str(a.sitter)} is booked for ${fmtWhen(night.starts_at)}. The usual instructions are in; confirm the sheet when you leave.`, href: `/sitter/review/${night.id}` };
    },
  },
  {
    name: "sitter.addLine", title: "Add a line to the sitter sheet", kind: "write", tier: 1,
    description: "Add something for one visit only (\"no dessert tonight\", \"pizza's in the fridge\", \"bedtime is 9\"). It goes on that visit's sheet and the tablet, not into any template. Needs an open visit; if none, say so rather than guessing.",
    input: { text: { type: "string", describe: "The line, as the sitter should read it", required: true }, date: { type: "date", describe: "Which visit, if more than one is open" } },
    async run(a, c) {
      const text = str(a.text).slice(0, 400); if (!text) return { ok: false, error: "What should it say?" };
      const { night, error } = await pickNight(c, str(a.date));
      if (!night) return { ok: false, error: error ?? "No sitter visit is open. Plan one first." };
      const { data: n } = await c.sb.from("sitter_nights").select("status, sheet, draft").eq("id", night.id).maybeSingle();
      if (!n) return { ok: false, error: "That visit was not found." };
      const draft = (n.draft ?? {}) as { lines?: string[] };
      const lines = [...(draft.lines ?? []), text].slice(-20);
      const patch: Record<string, unknown> = { draft: { ...draft, lines } };
      if (n.status === "confirmed") patch.sheet = [...((n.sheet ?? []) as unknown[]), { id: `line-${Date.now()}`, section: "tonight", label: "Tonight", text, photo: null, on: true }];
      const { error: e } = await c.sb.from("sitter_nights").update(patch).eq("id", night.id);
      if (e) return { ok: false, error: e.message };
      return { ok: true, summary: `Added to ${nightRow(night).name}: "${text}"${n.status === "confirmed" ? " (on the tablet now)" : ""}.`, href: `/sitter/review/${night.id}` };
    },
  },
  {
    name: "sitter.cancel", title: "Cancel a sitter visit", kind: "write", tier: 2,
    description: "The sitter is not coming, or a sitter is no longer needed. Cancels that visit (kept in history, never deleted).",
    input: { date: { type: "date", describe: "Which visit, if more than one is open" } },
    async run(a, c) {
      const { night, error } = await pickNight(c, str(a.date));
      if (!night) return { ok: false, error: error ?? "No sitter visit is open." };
      const { error: e } = await c.sb.from("sitter_nights").update({ status: "cancelled", visit_only: null }).eq("id", night.id);
      if (e) return { ok: false, error: e.message };
      return { ok: true, summary: `Cancelled ${nightRow(night).name}.` };
    },
  },
  {
    name: "sitter.remember", title: "Remember something for next time", kind: "write", tier: 1,
    description: "After a visit: a line to keep for every future visit (\"remember Audrey needs the hall light on\", \"next time tell the sitter the gate sticks\"). Goes into the house template, or a named child's template, as a normal line. Also records what the sitter was paid if said.",
    input: { text: { type: "string", describe: "The line, as the sitter should read it next time", required: true }, child: { type: "string", describe: "A child's first name when the line is about one child; omit for the house" }, paid: { type: "string", describe: "What the sitter was paid, as said ($60 Venmo)" } },
    async run(a, c) {
      const { data: last } = await c.sb.from("sitter_nights").select("id").eq("status", "ended").order("ends_at", { ascending: false }).limit(1).maybeSingle();
      if (!last) return { ok: false, error: "No visit has ended yet; add it to a template under Settings › Sitter instead." };
      let target = "general";
      const kid = str(a.child).toLowerCase();
      if (kid) { const { data: kids } = await c.sb.from("children").select("id, display_name").is("archived_at", null); const k = (kids ?? []).find((x) => String(x.display_name).toLowerCase().startsWith(kid)); if (!k) return { ok: false, error: `No child called ${str(a.child)}.` }; target = k.id; }
      const r = await debriefNight(last.id, { remember: str(a.text), target, payNote: str(a.paid) });
      if (!r.ok) return { ok: false, error: r.error ?? "Could not save." };
      return { ok: true, summary: r.note ?? "Saved.", href: "/settings/sitter" };
    },
  },
  {
    name: "sitter.person", title: "Add or update an approved sitter", kind: "write", tier: 2,
    description: "Put someone on the approved sitters list, or update a sitter's details. Name and mobile are the only required details for a new sitter (a mobile is needed so the sheet can show it; if the person did not give one, ask for it before calling). Anything else (how you know them, adult or teen, rate, drives, availability, notes) is optional: take what was said, never ask for the rest one by one. For a new sitter, finishLater=true saves name and phone and makes a task to fill in the rest; ask once \"all the details now, or name and phone and finish later?\" unless they already gave several details. If the name matches a contact, the contact is used (no new one made).",
    input: { name: { type: "string", describe: "Full name as said", required: true }, phone: { type: "string", describe: "Mobile number" }, relationship: { type: "string", describe: "How the family knows them" }, ageBand: { type: "enum", options: ["adult", "teen"], describe: "Adult or teen" }, age: { type: "number", describe: "Age, if a teen and said" }, rate: { type: "string", describe: "Rate as said ($15/hr)" }, drives: { type: "boolean", describe: "Drives / has a car" }, availability: { type: "string", describe: "When they can sit" }, notes: { type: "string", describe: "Anything else worth keeping" }, finishLater: { type: "boolean", describe: "Save just name and phone and make a task for the rest" } },
    async run(a, c) {
      const name = str(a.name); if (!name) return { ok: false, error: "Who?" };
      const fields = { ...(str(a.relationship) ? { relationship: str(a.relationship) } : {}), ...(str(a.ageBand) ? { ageBand: str(a.ageBand) as "adult" | "teen" } : {}), ...(typeof a.age === "number" ? { age: a.age } : {}), ...(str(a.rate) ? { rateText: str(a.rate) } : {}), ...(typeof a.drives === "boolean" ? { drives: a.drives } : {}), ...(str(a.availability) ? { availabilityText: str(a.availability) } : {}), ...(str(a.notes) ? { notes: str(a.notes) } : {}) };
      // Already approved: an update.
      const existing = (await getSitters()).find((s) => s.name.toLowerCase() === name.toLowerCase() || s.name.toLowerCase().split(" ")[0] === name.toLowerCase());
      if (existing) {
        if (!Object.keys(fields).length) return { ok: true, summary: `${existing.name} is already on the sitter list.`, href: `/settings/sitter/people/${existing.id}` };
        const r = await updateSitter(existing.id, fields); if (!r.ok) return { ok: false, error: r.error ?? "Could not update." };
        return { ok: true, summary: `Updated ${existing.name}: ${Object.keys(fields).join(", ")}.`, href: `/settings/sitter/people/${existing.id}` };
      }
      const later = a.finishLater === true;
      const cards = await searchContactsForSitter(name);
      const exact = cards.filter((x) => x.name.toLowerCase() === name.toLowerCase());
      if (exact.length > 1) return { ok: false, error: `Two contacts are called ${name} (${exact.map((x) => x.phone ? `…${x.phone.replace(/\D/g, "").slice(-4)}` : "no phone").join(", ")}). Which one?` };
      if (exact.length === 1) {
        const r = await addSitterFromContact(exact[0].id, fields, later); if (!r.ok) return { ok: false, error: r.error ?? "Could not add." };
        return { ok: true, summary: `${r.note ?? `${name} is on the sitter list.`}${later ? " A task to finish the details is on your list." : ""}`, href: r.id ? `/settings/sitter/people/${r.id}` : "/settings/sitter" };
      }
      const phone = str(a.phone); if (!phone) return { ok: false, error: `${name} isn't in Contacts. What's their mobile?` };
      const [first, ...rest] = name.split(/\s+/);
      const r = await addSitterNew(first, rest.join(" "), phone, fields, later); if (!r.ok) return { ok: false, error: r.error ?? "Could not add." };
      return { ok: true, summary: `${r.note ?? `${name} is on the sitter list.`}${later ? " A task to finish the details is on your list." : ""}`, href: r.id ? `/settings/sitter/people/${r.id}` : "/settings/sitter" };
    },
  },
];
