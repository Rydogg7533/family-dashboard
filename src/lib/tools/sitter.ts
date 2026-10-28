import "server-only";
// Sitters through Ask (spec: claude/stewardos-sitter-ask-intents-2026-10-27.md, D5 conversational). The hinge: a visit is planned
// only when a sitter is named (or "tonight"); "I need a sitter Friday" is a question back, never a night. Nothing texts a sitter.
import type { Tool, ToolCtx } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";
import { getSitters, getNights } from "@/lib/data-sitter";
import { addDaysIso, hasGoogleCal, listEvents } from "@/lib/google-calendar";
import { createNight, bookNight, openNights, matchSitter, type NightCtx } from "@/lib/sitter-nights";
import { addSitterFromContact, addSitterNew, searchContactsForSitter, updateSitter } from "@/app/settings/sitter/templates-actions";
import { fmtWhen, groupSheet } from "@/lib/sitter-shared";
import { choiceOptions, compileFor, defaultChoices } from "@/lib/sitter-compile";
import { getNight } from "@/lib/data-sitter";
import { confirmNight } from "@/app/sitter/actions";
import { debriefNight } from "@/app/sitter/actions";

const nc = (c: ToolCtx): NightCtx => ({ sb: c.sb, userId: c.userId, actor: c.email });
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;
// "2026-11-03" → "Tuesday, Nov 3": the person never sees a raw date (D5).
const fmtDay = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }); };
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

// What an assistant needs before cancelling a booked sitter: her number, the calendar event for the visit, and what else is on
// the calendar at those hours (the reason she was booked). Read only; the texting and the calendar removal are separate, confirmed steps.
type OpenNight = Awaited<ReturnType<typeof openNights>>[number];
async function visitContext(n: OpenNight) {
  const person = n.sitter_person_id ? (await getSitters()).find((s) => s.id === n.sitter_person_id) : null;
  const key = (n.event_key ?? "").split("|"); const own = key.length === 2 ? { calendarId: key[0], id: key[1] } : null;
  let around: { calendarId: string; id: string; title: string; start: string }[] = [], ownEvent: { calendarId: string; id: string; title: string } | null = null;
  if (hasGoogleCal()) {
    try {
      const day = n.starts_at.slice(0, 10); const evs = await listEvents(addDaysIso(day, -1), addDaysIso(day, 2));
      const t0 = Date.parse(n.starts_at), t1 = Date.parse(n.ends_at);
      if (own) { const e = evs.find((x) => x.id === own.id && x.calendarId === own.calendarId); if (e) ownEvent = { calendarId: e.calendarId, id: e.id, title: e.title }; }
      around = evs.filter((e) => !e.allDay && !(own && e.id === own.id) && Date.parse(e.startIso) < t1 && Date.parse(e.endIso) > t0).slice(0, 5).map((e) => ({ calendarId: e.calendarId, id: e.id, title: e.title, start: e.start ?? "" }));
    } catch { /* calendar unreachable: the visit still cancels */ }
  }
  return { sitterPhone: person?.phone ?? null, booked: !!(n.sitter_name || n.sitter_person_id), calendarEvent: ownEvent, around };
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
      const rows = await Promise.all(list.map(async (n, i) => ({ ...nightRow(n), ...(i < 3 ? await visitContext(n) : {}) })));
      return { ok: true, summary: list.length ? list.map((n) => nightRow(n).name + (n.status === "needed" ? " (no sitter yet)" : n.status === "confirmed" ? " (on the tablet)" : "")).join("; ") : "No sitter visit is planned.", data: rows };
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
      return { ok: true, summary: `Planned ${fmtDay(date)} with ${m ? m.name : sitter}, usual instructions in.${note}`, href: `/sitter/review/${r.id}`, data: { id: r.id, approved: !!m } };
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
      return { ok: true, summary: `Noted: sitter needed ${fmtDay(date)}. Tell me who when someone says yes.`, href: `/sitter/review/${r.id}`, data: { id: r.id } };
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
      return { ok: true, summary: `${str(a.sitter)} is booked for ${fmtWhen(night.starts_at)}; the usual instructions are in.`, href: `/sitter/review/${night.id}` };
    },
  },
  {
    name: "sitter.sheet", title: "Read a visit's sheet", kind: "read", tier: 1,
    description: "What the sitter sheet for an open visit says right now: the house template and each child's template in use, who is home, and every line grouped by section with whether it is on. Use this to answer 'what's on the sheet', 'bring up the details', 'what will the tablet show', or before changing anything on it.",
    input: { date: { type: "date", describe: "Which visit, if more than one is open" } },
    async run(a, c) {
      const { night, error } = await pickNight(c, str(a.date));
      if (!night) return { ok: false, error: error ?? "No sitter visit is open." };
      const n = await getNight(night.id); if (!n) return { ok: false, error: "That visit was not found." };
      const opts = await choiceOptions(); const { from, ...ch } = await defaultChoices(n, opts);
      const items = n.sheet.length && n.status === "confirmed" ? n.sheet : await compileFor(ch, opts);
      const groups = groupSheet(items);
      const gName = opts.general.find((t) => t.id === ch.generalTemplateId)?.name ?? "none";
      const kids = opts.children.map((k) => ch.childrenHome.includes(k.id) ? `${k.name}: ${k.templates.find((t) => t.id === ch.childTemplates[k.id])?.name ?? "no template"}` : `${k.name} away`).join("; ");
      const on = items.filter((i) => i.on).length;
      const text = groups.map((g) => `${g.label}: ${g.items.map((i) => `${i.on ? "" : "[off] "}${i.text}`).join(" | ")}`).join("\n");
      return { ok: true, summary: `${nightRow(night).name}${n.status === "confirmed" ? " (on the tablet)" : n.status === "needed" ? " (no sitter yet)" : ""}. House template: ${gName}${from === "last" ? " (same as last time)" : ""}. Kids: ${kids || "none set up"}. ${on} line${on === 1 ? "" : "s"} on${items.length - on ? `, ${items.length - on} off (health lines stay off until asked for)` : ""}.${items.length ? "\n" + text : " The sheet is empty: the templates have no lines yet (Settings › Sitter)."}`, href: `/sitter/review/${night.id}`, data: { id: night.id, status: n.status, house: gName, kids, lines: groups.map((g) => ({ section: g.label, lines: g.items.map((i) => ({ text: i.text, on: i.on })) })) } };
    },
  },
  {
    name: "sitter.choose", title: "Choose the instructions for a visit", kind: "write", tier: 1,
    description: "Change which templates a visit uses or which children are home: a house template by name ('use the overnight sheet'), a child's template by child and name ('Audrey's weekend one'), or a child away ('Lily's not home'). Names are matched against the templates under Settings › Sitter.",
    input: { date: { type: "date", describe: "Which visit, if more than one is open" }, house: { type: "string", describe: "A house template name" }, child: { type: "string", describe: "A child's first name, when changing that child's template or presence" }, template: { type: "string", describe: "That child's template name" }, away: { type: "boolean", describe: "true when that child is not home for this visit; false to put them back" } },
    async run(a, c) {
      const { night, error } = await pickNight(c, str(a.date));
      if (!night) return { ok: false, error: error ?? "No sitter visit is open." };
      const n = await getNight(night.id); if (!n) return { ok: false, error: "That visit was not found." };
      if (n.status === "confirmed") return { ok: false, error: "That sheet is already on the tablet; untick lines on its page, or add a line with sitter.addLine." };
      const opts = await choiceOptions(); const d = await defaultChoices(n, opts);
      const ch = { generalTemplateId: d.generalTemplateId, childTemplates: { ...d.childTemplates }, childrenHome: [...d.childrenHome] };
      const changed: string[] = [];
      const house = str(a.house).toLowerCase();
      if (house) { const t = opts.general.find((x) => x.name.toLowerCase() === house) ?? opts.general.find((x) => x.name.toLowerCase().includes(house)); if (!t) return { ok: false, error: `No house template called ${str(a.house)}. You have: ${opts.general.map((x) => x.name).join(", ")}.` }; ch.generalTemplateId = t.id; changed.push(`house: ${t.name}`); }
      const kid = str(a.child).toLowerCase();
      if (kid) {
        const k = opts.children.find((x) => x.name.toLowerCase().startsWith(kid)); if (!k) return { ok: false, error: `No child called ${str(a.child)}.` };
        if (typeof a.away === "boolean") { ch.childrenHome = a.away ? ch.childrenHome.filter((x) => x !== k.id) : Array.from(new Set([...ch.childrenHome, k.id])); changed.push(`${k.name} ${a.away ? "away" : "home"}`); }
        const tn = str(a.template).toLowerCase();
        if (tn) { const t = k.templates.find((x) => x.name.toLowerCase() === tn) ?? k.templates.find((x) => x.name.toLowerCase().includes(tn)); if (!t) return { ok: false, error: `${k.name} has no template called ${str(a.template)}. ${k.name} has: ${k.templates.map((x) => x.name).join(", ") || "none"}.` }; ch.childTemplates[k.id] = t.id; changed.push(`${k.name}: ${t.name}`); }
      }
      if (!changed.length) return { ok: false, error: "Say which template or which child." };
      const { error: e } = await c.sb.from("sitter_nights").update({ general_template_id: ch.generalTemplateId, child_templates: ch.childTemplates, children_home: ch.childrenHome, instructions_mode: "template", prepared_at: new Date().toISOString() }).eq("id", night.id);
      if (e) return { ok: false, error: e.message };
      return { ok: true, summary: `${nightRow(night).name}: ${changed.join(", ")}.`, href: `/sitter/review/${night.id}` };
    },
  },
  {
    name: "sitter.confirm", title: "Confirm the sheet to the tablet", kind: "write", tier: 2,
    description: "Confirm a planned visit's sheet as it stands (the chosen templates, every line that is on, tonight's lines) so the kitchen tablet shows it. Health lines are included only when the person asks for them by child ('include Audrey's allergies'). A visit with no sitter yet cannot be confirmed; book the sitter first.",
    input: { date: { type: "date", describe: "Which visit, if more than one is open" }, healthFor: { type: "string", describe: "Children whose allergy and medicine lines should show, comma-separated first names" } },
    async run(a, c) {
      const { night, error } = await pickNight(c, str(a.date), (s) => s !== "needed");
      if (!night) return { ok: false, error: error ?? "No planned visit to confirm (a visit still looking for a sitter cannot go to the tablet)." };
      const n = await getNight(night.id); if (!n) return { ok: false, error: "That visit was not found." };
      const opts = await choiceOptions(); const { from: _from, ...ch } = await defaultChoices(n, opts); void _from;
      const items = await compileFor(ch, opts);
      const names = str(a.healthFor).toLowerCase().split(/[,\s]+/).filter(Boolean);
      const ids = opts.children.filter((k) => names.some((q) => k.name.toLowerCase().startsWith(q))).map((k) => k.id);
      for (const i of items) if (i.health && ids.some((id) => i.section.startsWith(`c:${id}:`))) i.on = true;
      if (!items.some((i) => i.on)) return { ok: false, error: "The sheet is empty; write a few lines in the templates first (Settings › Sitter)." };
      const r = await confirmNight(night.id, items, n.visitOnly ?? "", ch);
      if (!r.ok) return { ok: false, error: r.error ?? "Could not confirm." };
      const on = items.filter((i) => i.on).length;
      return { ok: true, summary: `Confirmed ${nightRow(night).name}: ${on} line${on === 1 ? "" : "s"} on the tablet${ids.length ? ", health lines included for " + opts.children.filter((k) => ids.includes(k.id)).map((k) => k.name).join(" and ") : ""}.`, href: `/sitter/review/${night.id}` };
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
      const ctx = await visitContext(night);
      const { error: e } = await c.sb.from("sitter_nights").update({ status: "cancelled", visit_only: null }).eq("id", night.id);
      if (e) return { ok: false, error: e.message };
      const next = [ctx.booked && ctx.sitterPhone ? "offer to text her (message.send)" : "", ctx.calendarEvent ? "ask whether to take the visit off the calendar (calendar.remove)" : "", ctx.around.length ? `ask about ${ctx.around.map((x) => x.title).join(" / ")} (is it cancelled too?)` : ""].filter(Boolean);
      return { ok: true, summary: `Cancelled ${nightRow(night).name}.${next.length ? " Still to ask: " + next.join("; ") + "." : ""}`, data: { id: night.id, ...ctx } };
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
