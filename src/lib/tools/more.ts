import "server-only";
// The capability-map gaps closed (Ryan, 2026-10-27 21:19: "test later, finish building"): the weekly review, claims, accounts and
// statements, who is free, things, the shop list, mail drafts, unsubscribing. Each wraps a reader or action the page already uses.
import type { Tool, ToolCtx } from "@/lib/tools/types";
import { str, num } from "@/lib/tools/types";
import { getReview } from "@/lib/data-review";
import { getAccounts, getReconciliations } from "@/lib/data-money";
import { getThing } from "@/lib/data-things";
import { addThing, setThingStatus, type ThingInput } from "@/app/things/actions";
import { setClaimStatus, snoozeClaim, type ClaimStatus } from "@/app/claims/actions";
import { requestUnsubscribe } from "@/app/email-subscriptions/actions";
import { listEvents } from "@/lib/google-calendar";
import { fromMin, to12, toMin } from "@/lib/ask-conflicts";

const UUID = /^[0-9a-f-]{36}$/i;
const money = (n: number | null | undefined) => (n == null ? "" : `$${Number(n).toFixed(2)}`);
const day = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }); };
async function actorOf(c: ToolCtx) { const { data } = await c.sb.from("profiles").select("display_name").eq("id", c.userId).maybeSingle(); return String(data?.display_name ?? c.email); }

export const moreTools: Tool[] = [
  {
    name: "task.review", title: "The weekly review", kind: "read", tier: 1,
    description: "What is late (open tasks past due for over a week), what the app is asking about, and what got done this week. For 'what's overdue', 'what's stale', 'how did the week go'.",
    input: {},
    async run() {
      const r = await getReview();
      const stale = (r.stale ?? []) as { id: string; title: string; due_at: string | null }[];
      return { ok: true, summary: `${stale.length} task${stale.length === 1 ? "" : "s"} late by a week or more; ${r.asking?.length ?? 0} question${(r.asking?.length ?? 0) === 1 ? "" : "s"} waiting; ${r.doneThisWeek} done this week${r.lastConfirmed ? `; review last confirmed ${String(r.lastConfirmed).slice(0, 10)}` : ""}.`, data: stale.slice(0, 12).map((t) => ({ id: t.id, name: t.title, date: t.due_at, href: `/tasks/${t.id}` })), href: "/review" };
    },
  },
  {
    name: "claim.find", title: "Claims", kind: "read", tier: 1,
    description: "Reimbursement, warranty, insurance and dispute claims: what is open, submitted or paid, who it is with, how much, and when to check back. For 'did AAA pay us back', 'what claims are open'.",
    input: { status: { type: "enum", options: ["open", "submitted", "paid", "denied", "closed", "any"], describe: "Which claims (default: open and submitted)" }, vendor: { type: "string", describe: "Narrow to one vendor or insurer" } },
    async run(a, c) {
      let q = c.sb.from("claims").select("id, title, kind, vendor, expected_amount, status, check_by, updated_at").order("updated_at", { ascending: false }).limit(20);
      const st = str(a.status); q = st && st !== "any" ? q.eq("status", st) : st === "any" ? q : q.in("status", ["open", "submitted"]);
      const v = str(a.vendor); if (v) q = q.ilike("vendor", `%${v.replace(/[%,()]/g, " ")}%`);
      const { data } = await q; const rows = data ?? [];
      if (!rows.length) return { ok: true, summary: `No ${st && st !== "any" ? st : "open"} claims${v ? ` with ${v}` : ""}.` };
      return { ok: true, summary: rows.map((r) => `${r.title}${r.vendor ? ` (${r.vendor})` : ""}: ${r.status}${r.expected_amount ? `, ${money(r.expected_amount)}` : ""}${r.check_by ? `, check ${day(r.check_by)}` : ""}`).join("; "), data: rows.map((r) => ({ id: r.id, name: r.title, status: r.status, amount: r.expected_amount, date: r.check_by, where: r.vendor, href: "/claims" })) };
    },
  },
  {
    name: "claim.setStatus", title: "Update a claim", kind: "write", tier: 1,
    description: "Move a claim along: submitted, paid, denied or closed, with an optional note. Find it with claim.find first. 'AAA paid us' = paid.",
    input: { id: { type: "string", describe: "The claim's id", required: true }, status: { type: "enum", options: ["open", "submitted", "paid", "denied", "closed"], describe: "New status", required: true }, note: { type: "string", describe: "A short note (the amount, the check number)" } },
    async run(a) {
      const id = str(a.id); if (!UUID.test(id)) return { ok: false, error: "Which claim? Find it first." };
      const r = await setClaimStatus(id, str(a.status) as ClaimStatus, str(a.note) || undefined);
      return r.ok ? { ok: true, summary: `Claim marked ${str(a.status)}.`, href: "/claims" } : { ok: false, error: "Could not update that claim." };
    },
  },
  {
    name: "claim.snooze", title: "Push a claim's check-back date", kind: "write", tier: 1,
    description: "Move a claim's check-back reminder out by some days ('check on the AAA claim in two weeks').",
    input: { id: { type: "string", describe: "The claim's id", required: true }, days: { type: "number", describe: "Days from today (1 to 60)", required: true } },
    async run(a) {
      const id = str(a.id); if (!UUID.test(id)) return { ok: false, error: "Which claim? Find it first." };
      const r = await snoozeClaim(id, num(a.days) || 7);
      return r.ok ? { ok: true, summary: `Check-back moved ${num(a.days) || 7} days out.`, href: "/claims" } : { ok: false, error: "Could not move it." };
    },
  },
  {
    name: "money.accounts", title: "Accounts and cards", kind: "read", tier: 1,
    description: "The household's accounts and cards as the app knows them (institution, name, last four). Never a balance or a number beyond the last four. For 'which cards do we have', 'what's the Visa ending in'.",
    input: {},
    async run() {
      const list = await getAccounts();
      const rows = list as unknown as { id: string; institution?: string; name?: string; last4?: string; kind?: string }[];
      return { ok: true, summary: rows.length ? rows.map((r) => [r.institution, r.name, r.last4 ? `••${r.last4}` : null].filter(Boolean).join(" ")).join("; ") : "No accounts on the register.", data: rows.map((r) => ({ id: r.id, name: [r.institution, r.name].filter(Boolean).join(" "), where: r.last4 ? `••${r.last4}` : null, href: "/settings/money" })) };
    },
  },
  {
    name: "money.reconcile", title: "Statements and monthly close", kind: "read", tier: 1,
    description: "Where each statement stands: matched, open, closed, and when the next is due. For 'when is the Amex statement due', 'is October closed'.",
    input: {},
    async run() {
      const list = (await getReconciliations()) as unknown as { id: string; account?: string; period?: string; status?: string; due?: string; unmatched?: number }[];
      return { ok: true, summary: list.length ? list.slice(0, 6).map((r) => `${r.account ?? "Account"} ${r.period ?? ""}: ${r.status ?? "open"}${r.unmatched ? `, ${r.unmatched} unmatched` : ""}${r.due ? `, due ${day(r.due)}` : ""}`).join("; ") : "No statements on record.", data: list.slice(0, 12).map((r) => ({ id: r.id, name: `${r.account ?? "Account"} ${r.period ?? ""}`, status: r.status, date: r.due ?? null, href: "/money/reconcile" })) };
    },
  },
  {
    name: "calendar.whoFree", title: "Who is free", kind: "read", tier: 1,
    description: "Free windows on a day between two times, across the household calendars: 'is Melissa free Thursday afternoon', 'what's Saturday look like'. Names a person's own events as busy; a person with no events is free all day.",
    input: { date: { type: "date", describe: "The day", required: true }, from: { type: "string", describe: "Window start HH:MM (default 08:00)" }, to: { type: "string", describe: "Window end HH:MM (default 21:00)" }, person: { type: "string", describe: "A first name, to look only at calendars with that name" } },
    async run(a) {
      const date = str(a.date); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Which day?" };
      let evs; try { evs = await listEvents(date, date); } catch { return { ok: false, error: "Google Calendar did not answer." }; }
      const who = str(a.person).toLowerCase();
      const mine = evs.filter((e) => !e.allDay && e.start && e.date === date && (!who || e.calendarName.toLowerCase().includes(who) || e.title.toLowerCase().includes(who)));
      const s0 = toMin(/^\d{2}:\d{2}$/.test(str(a.from)) ? str(a.from) : "08:00"), e0 = toMin(/^\d{2}:\d{2}$/.test(str(a.to)) ? str(a.to) : "21:00");
      const busy = mine.map((e) => ({ s: Math.max(s0, toMin(e.start!)), e: Math.min(e0, e.end ? toMin(e.end) : e0), title: e.title, cal: e.calendarName })).filter((b) => b.e > b.s).sort((x, y) => x.s - y.s);
      const free: string[] = []; let cur = s0;
      for (const b of busy) { if (b.s - cur >= 30) free.push(`${to12(fromMin(cur))}–${to12(fromMin(b.s))}`); cur = Math.max(cur, b.e); }
      if (e0 - cur >= 30) free.push(`${to12(fromMin(cur))}–${to12(fromMin(e0))}`);
      const allDay = evs.filter((e) => e.allDay && (!who || e.calendarName.toLowerCase().includes(who))).map((e) => e.title);
      return { ok: true, summary: `${day(date)}${who ? ` for ${str(a.person)}` : ""}: ${busy.length ? "busy " + busy.map((b) => `${to12(fromMin(b.s))}–${to12(fromMin(b.e))} ${b.title}`).join(", ") : "nothing timed"}${allDay.length ? `; all day: ${allDay.join(", ")}` : ""}. Free: ${free.length ? free.join(", ") : "nothing in that window"}.` };
    },
  },
  {
    name: "thing.get", title: "One thing from the catalog", kind: "read", tier: 1,
    description: "Everything the catalog holds on one item: where it is, owner, brand and model, price paid, warranty, status. Find its id with thing.find first.",
    input: { id: { type: "string", describe: "The item's id", required: true } },
    async run(a, c) {
      const id = str(a.id); if (!UUID.test(id)) return { ok: false, error: "Which thing? Find it first." };
      const t = (await getThing(id, c.isOwner)) as unknown as Record<string, unknown> | null; if (!t) return { ok: false, error: "Not in the catalog." };
      const parts = [t.location && `kept ${t.location}`, t.owner && `${t.owner}'s`, [t.brand, t.model].filter(Boolean).join(" "), t.price != null && `paid ${money(Number(t.price))}`, t.purchase_date && `bought ${day(String(t.purchase_date))}`, t.status && t.status !== "active" && `status ${t.status}`].filter(Boolean);
      return { ok: true, summary: `${t.name}: ${parts.join(", ") || "no details yet"}.`, href: `/things/${id}`, data: { id, name: t.name, href: `/things/${id}`, where: t.location ?? null } };
    },
  },
  {
    name: "thing.add", title: "Add a thing to the catalog", kind: "write", tier: 1,
    description: "Add an item to the household's catalog of things: name, category (furniture, electronics, tools, kitchen, clothing, outdoor, toys, other), owner (a first name or Family), where it is kept, brand, model, the serial's last four, notes. Photos are added on the page.",
    input: { name: { type: "string", describe: "What it is", required: true }, category: { type: "string", describe: "Category", required: true }, owner: { type: "string", describe: "Whose it is (first name or Family)" }, location: { type: "string", describe: "Where it is kept" }, brand: { type: "string", describe: "Brand" }, model: { type: "string", describe: "Model" }, serialLast4: { type: "string", describe: "Last four of the serial" }, notes: { type: "string", describe: "Anything else" } },
    async run(a) {
      const input: ThingInput = { name: str(a.name), category: str(a.category) || "other", owner: str(a.owner) || "Family", location: str(a.location) || undefined, brand: str(a.brand) || undefined, model: str(a.model) || undefined, serialLast4: str(a.serialLast4).slice(-4) || undefined, notes: str(a.notes) || undefined };
      const r = await addThing(input, []);
      return r.ok ? { ok: true, summary: `Added ${input.name} to Things${input.location ? ` (kept ${input.location})` : ""}. Add a photo on its page when you can.`, href: r.id ? `/things/${r.id}` : "/things" } : { ok: false, error: r.error ?? "Could not add it." };
    },
  },
  {
    name: "thing.setStatus", title: "Mark a thing sold, given away, lost or discarded", kind: "write", tier: 1,
    description: "Close an item out of the catalog (sold, given_away, lost, discarded) or put it back (active). Find it with thing.find first.",
    input: { id: { type: "string", describe: "The item's id", required: true }, status: { type: "enum", options: ["active", "sold", "given_away", "lost", "discarded"], describe: "New status", required: true }, note: { type: "string", describe: "To whom, for how much, where" } },
    async run(a) {
      const id = str(a.id); if (!UUID.test(id)) return { ok: false, error: "Which thing? Find it first." };
      const r = await setThingStatus(id, str(a.status) as "active" | "sold" | "given_away" | "lost" | "discarded", str(a.note) || undefined);
      return r.ok ? { ok: true, summary: `Marked ${str(a.status).replace("_", " ")}.`, href: `/things/${id}` } : { ok: false, error: r.error ?? "Could not change it." };
    },
  },
  {
    name: "shop.find", title: "The shop list", kind: "read", tier: 1,
    description: "What is on the shop list and which regular items are due (paper towels, filters). By store when asked.",
    input: { store: { type: "enum", options: ["amazon", "smiths", "costco"], describe: "One store only" } },
    async run(a, c) {
      let q = c.sb.from("cart_items").select("id, store, name, qty, is_regular, due, price_note").is("removed_at", null).order("added_at", { ascending: false }).limit(60);
      const st = str(a.store); if (st) q = q.eq("store", st);
      const { data } = await q; const rows = (data ?? []).filter((r) => !r.is_regular || r.due);
      if (!rows.length) return { ok: true, summary: `Nothing on the shop list${st ? ` for ${st}` : ""}.` };
      return { ok: true, summary: rows.map((r) => `${r.name}${r.qty > 1 ? ` ×${r.qty}` : ""} (${r.store}${r.is_regular ? ", regular, due" : ""})`).join("; "), data: rows.map((r) => ({ id: r.id, name: r.name, where: r.store, href: "/shop" })) };
    },
  },
  {
    name: "shop.add", title: "Add to the shop list", kind: "write", tier: 1,
    description: "Put an item on the shop list for a store (default Amazon). The assistant never buys: the list becomes a cart the person checks out themselves.",
    input: { name: { type: "string", describe: "The item", required: true }, store: { type: "enum", options: ["amazon", "smiths", "costco"], describe: "Which store (default amazon)" }, qty: { type: "number", describe: "How many (default 1)" }, note: { type: "string", describe: "Size, brand, a price limit" } },
    async run(a, c) {
      const name = str(a.name).slice(0, 120); if (!name) return { ok: false, error: "What should go on the list?" };
      const store = ["amazon", "smiths", "costco"].includes(str(a.store)) ? str(a.store) : "amazon";
      const { data, error } = await c.sb.from("cart_items").insert({ store, name, qty: Math.max(1, Math.min(99, Math.round(num(a.qty) || 1))), note: str(a.note).slice(0, 200) || null, added_by: c.userId, added_by_name: await actorOf(c) }).select("id").single();
      if (error) return { ok: false, error: error.message };
      await c.sb.from("activity_log").insert({ actor: await actorOf(c), action: "shop_item_added", subject: `${name} (${store})`, ref: data.id, undoable: true }).then(() => {}, () => {});
      return { ok: true, summary: `${name} is on the ${store} list.`, href: "/shop" };
    },
  },
  {
    name: "mail.draft", title: "Draft a reply", kind: "write", tier: 2,
    description: "Ask for a drafted reply to the email behind a task ('draft a reply to the insurance email'). The draft is written for the person to read and send from their own mail app; nothing is sent. Find the task with task.find first.",
    input: { taskId: { type: "string", describe: "The task that came from the email", required: true } },
    async run(a, c) {
      const id = str(a.taskId); if (!UUID.test(id)) return { ok: false, error: "Which task? Find it first." };
      const { data: t } = await c.sb.from("tasks").select("id, title, origin_kind").eq("id", id).maybeSingle();
      if (!t) return { ok: false, error: "That task was not found." };
      const { data: d } = await c.sb.from("drafts").select("id, complete").eq("task_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!d) return { ok: false, error: `“${t.title}” has no draft yet; open the task and tap Draft, and I can send it to your mail app once it is written.` };
      const { error } = await c.sb.from("drafts").update({ mail_requested_at: new Date().toISOString() }).eq("id", d.id).eq("complete", true);
      if (error || !d.complete) return { ok: false, error: "The draft is still being written; try again in a minute." };
      return { ok: true, summary: `The draft for “${t.title}” is ready to open in your mail app from the task; nothing has been sent.`, href: `/tasks/${id}` };
    },
  },
  {
    name: "subscription.unsubscribe", title: "Unsubscribe from a sender", kind: "write", tier: 2,
    description: "Ask the unsubscribe agent to drop a mailing-list sender ('unsubscribe from Old Navy'). It follows the sender's own unsubscribe link later; the person sees the result under Mail › Subscriptions.",
    input: { sender: { type: "string", describe: "The sender's name or address as it appears", required: true } },
    async run(a, c) {
      const q = str(a.sender).replace(/[%,()]/g, " ").trim(); if (!q) return { ok: false, error: "Which sender?" };
      const { data } = await c.sb.from("email_subscriptions").select("id, sender_name, address, status").eq("person", c.userId).eq("status", "active").or(`sender_name.ilike.%${q}%,address.ilike.%${q}%`).limit(5);
      if (!data?.length) return { ok: false, error: `No active sender matches ${q}.` };
      if (data.length > 1) return { ok: false, error: `Several match: ${data.map((d) => d.sender_name || d.address).join(", ")}. Which one?` };
      const r = await requestUnsubscribe([data[0].id]);
      return r.ok ? { ok: true, summary: `Unsubscribe requested for ${data[0].sender_name || data[0].address}; the agent handles it on its next run.`, href: "/email-subscriptions" } : { ok: false, error: r.error ?? "Could not request it." };
    },
  },
];
