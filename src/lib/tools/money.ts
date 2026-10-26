import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str, num } from "@/lib/tools/types";
import { CATEGORY_IDS, byId } from "@/lib/categories";
import { isTransferLike } from "@/lib/money-spend";

// Money, as Ask sees it: the ledger (transactions synced from Tiller), what is missing a receipt, and the
// recurring register. Reads answer "how much", "what did we buy", "did we pay". The two writes are the
// smallest ones the Money page already has, so a charge can be explained from Ask the same way it is
// explained with a tap: status flips to classified, the note is kept, and the activity log says who.
//
// Amounts: positive is money out. Transfers between own accounts are not spending and are left out of
// totals, the way the Money page leaves them out.

type Tx = { id: string; amount: number; merchant: string; date: string; category: string | null; category_hint: string | null; status: string; matched_receipt: string | null; note: string | null; for_person: string; account_id: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$.]+/g, " ").trim();
const words = (q: string) => norm(q).split(" ").filter((w) => w.length > 1);
const matches = (ws: string[], hay: string) => { const h = norm(hay); return ws.every((w) => h.includes(w)); };
const money = (n: number) => `$${Math.abs(n).toFixed(2)}`;
const label = (id: string | null) => (id && byId(id)?.label) || (id ? id.replace(/_/g, " ") : "uncategorised");
const isSpend = (t: Tx) => t.amount > 0 && t.status !== "transfer" && !isTransferLike(t.category, t.merchant, t.status);

// Page through the ledger in 1000s; the ledger is a few thousand rows a year and a date range keeps it small.
async function ledger(c: Parameters<Tool["run"]>[1], from: string, to: string): Promise<Tx[]> {
  const out: Tx[] = [];
  for (let start = 0; ; start += 1000) {
    let q = c.sb.from("transactions").select("id, amount, merchant, date, category, category_hint, status, matched_receipt, note, for_person, account_id").order("date", { ascending: false }).range(start, start + 999);
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    const { data } = await q;
    out.push(...((data ?? []) as Tx[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Default window when none is given: this calendar month, in the household's day.
function thisMonth(today: string) { return { from: today.slice(0, 8) + "01", to: today }; }

const row = (t: Tx) => ({ id: t.id, name: `${t.merchant} ${money(t.amount)}`, date: t.date, amount: t.amount, category: t.category, hint: t.category_hint, status: t.status, receipt: !!t.matched_receipt, who: t.for_person, href: `/money/receipts?for=${t.id}` });

export const moneyTools: Tool[] = [
  {
    name: "money.spend", title: "Spending total", kind: "read", tier: 1,
    description: "How much was spent: in a date range (default this month; default the last 12 months when a vendor is given), optionally in one category or at one vendor. Returns the total, the count, and a breakdown by category. Transfers between own accounts are not counted.",
    input: {
      from: { type: "date", describe: "Start of the period; default the 1st of this month", required: false },
      to: { type: "date", describe: "End of the period; default today", required: false },
      category: { type: "enum", options: [...CATEGORY_IDS], describe: "Limit to one category", required: false },
      vendor: { type: "string", describe: "Limit to charges whose merchant contains these words", required: false },
    },
    async run(a, c) {
      const d = thisMonth(c.today);
      const ws = words(str(a.vendor));
      // "This month" is the default for a bare "how much have we spent"; a vendor question with no period
      // means "ever, within reason", so it looks back a year.
      const from = str(a.from) || (ws.length ? new Date(Date.parse(c.today) - 365 * 86_400_000).toISOString().slice(0, 10) : d.from), to = str(a.to) || d.to, cat = str(a.category);
      const rows = (await ledger(c, from, to)).filter(isSpend).filter((t) => (!cat || t.category === cat) && (!ws.length || matches(ws, t.merchant)));
      const total = rows.reduce((s, t) => s + t.amount, 0);
      const by = new Map<string, number>();
      // A charge with no category is grouped under the bank feed's guess, marked as a guess. The guess is
      // never treated as the category (D99), but a person asking "how much on groceries" with nothing
      // categorised yet is better served by "about $X by the bank's guess" than by nothing.
      const key = (t: Tx) => t.category ?? (t.category_hint ? `guess:${t.category_hint}` : "uncategorised");
      for (const t of rows) by.set(key(t), (by.get(key(t)) ?? 0) + t.amount);
      const breakdown = Array.from(by.entries()).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ category: k.startsWith("guess:") ? `${k.slice(6)} (bank's guess)` : label(k === "uncategorised" ? null : k), amount: Math.round(v * 100) / 100 }));
      const uncategorised = rows.filter((t) => !t.category).length;
      const what = [cat ? `on ${label(cat)}` : "", ws.length ? `at ${str(a.vendor)}` : ""].filter(Boolean).join(" ");
      return { ok: true, summary: `${money(total)} across ${rows.length} charge${rows.length === 1 ? "" : "s"} ${what} from ${from} to ${to}.${uncategorised ? ` ${uncategorised} of them have no category yet, so a category total is a floor, not the answer.` : ""}`, data: { total: Math.round(total * 100) / 100, count: rows.length, from, to, breakdown, uncategorised }, href: "/money" };
    },
  },
  {
    name: "money.findCharge", title: "Find charges", kind: "read", tier: 1,
    description: "Find charges on the ledger by vendor words, amount, or date range. Returns rows with merchant, amount, date, category and whether a receipt is attached. Use limit 1 for 'the latest' or 'the' one charge.",
    input: {
      text: { type: "string", describe: "Words from the merchant name", required: false },
      amount: { type: "number", describe: "An exact amount the person said, e.g. 118.39; matched within a cent", required: false },
      from: { type: "date", describe: "Earliest date; default 90 days ago", required: false },
      to: { type: "date", describe: "Latest date", required: false },
      limit: { type: "number", describe: "How many, newest first; 1 for 'the latest'", required: false },
    },
    async run(a, c) {
      const ws = words(str(a.text)); const amt = a.amount === undefined ? NaN : num(a.amount);
      if (!ws.length && !Number.isFinite(amt) && !str(a.from)) return { ok: false, error: "Say a vendor, an amount or a date range." };
      const from = str(a.from) || new Date(Date.parse(c.today) - 90 * 86_400_000).toISOString().slice(0, 10);
      // "$118" means the dollars; "$118.39" means the cents too. A whole-dollar ask that only matched to the
      // cent made the loop ask the person for cents they never saw.
      const whole = Number.isFinite(amt) && Math.abs(amt - Math.round(amt)) < 0.005;
      const amtOk = (x: number) => !Number.isFinite(amt) || (whole ? Math.floor(Math.abs(x)) === Math.abs(Math.round(amt)) : Math.abs(Math.abs(x) - Math.abs(amt)) < 0.005);
      const rows = (await ledger(c, from, str(a.to))).filter((t) => (!ws.length || matches(ws, t.merchant)) && amtOk(t.amount));
      const want = Number.isFinite(num(a.limit)) && num(a.limit) > 0 ? Math.min(num(a.limit), 20) : 20;
      const shown = rows.slice(0, want).map(row);
      return { ok: true, summary: rows.length === 0 ? `No charge matches that since ${from}.` : `${rows.length} charge${rows.length === 1 ? "" : "s"} match${rows.length === 1 ? "es" : ""}${rows.length > want ? `; showing the newest ${want}` : ""}. The person sees these as rows; do not repeat them.`, data: shown, href: shown.length === 1 ? shown[0].href : "/money/receipts?view=history" };
    },
  },
  {
    name: "money.noReceipt", title: "Charges without a receipt", kind: "read", tier: 1,
    description: "Charges that still have no receipt or explanation, newest first. Answers 'what's unmatched', 'which charges need a receipt'.",
    input: { limit: { type: "number", describe: "How many to show; default 10", required: false } },
    async run(a, c) {
      const { data } = await c.sb.from("transactions").select("id, amount, merchant, date, category, category_hint, status, matched_receipt, note, for_person, account_id").eq("status", "unknown").is("matched_receipt", null).gt("amount", 0).order("date", { ascending: false }).limit(500);
      const rows = ((data ?? []) as Tx[]).filter((t) => !isTransferLike(t.category, t.merchant, t.status));
      const want = Number.isFinite(num(a.limit)) && num(a.limit) > 0 ? Math.min(num(a.limit), 20) : 10;
      const total = rows.reduce((s, t) => s + t.amount, 0);
      return { ok: true, summary: `${rows.length} charge${rows.length === 1 ? "" : "s"} (${money(total)}) still need a receipt or an explanation. Showing ${Math.min(want, rows.length)} as rows; do not repeat them.`, data: rows.slice(0, want).map(row), href: "/money/receipts" };
    },
  },
  {
    name: "money.recurring", title: "Recurring bills and subscriptions", kind: "read", tier: 1,
    description: "The recurring register: subscriptions, bills, loans, insurance, with amount, cycle, next charge and the decision on each (keep, cancel, review). Answers 'what subscriptions do we have', 'when is X due', 'what's up for review'.",
    input: { text: { type: "string", describe: "Words from the name, to narrow", required: false }, kind: { type: "enum", options: ["subscription", "bill", "loan", "insurance"], describe: "One kind only", required: false } },
    async run(a, c) {
      const { data } = await c.sb.from("recurring_items").select("id, name, kind, amount, cycle, next_charge, decision, cancel_at, on_register").order("next_charge");
      const ws = words(str(a.text)), kind = str(a.kind);
      const rows = ((data ?? []) as { id: string; name: string; kind: string; amount: number; cycle: string; next_charge: string; decision: string; cancel_at: string | null; on_register: boolean }[]).filter((r) => (!ws.length || matches(ws, r.name)) && (!kind || r.kind === kind));
      const monthly = rows.reduce((s, r) => s + (r.cycle === "yearly" ? r.amount / 12 : r.cycle === "weekly" ? r.amount * 52 / 12 : r.amount), 0);
      return { ok: true, summary: `${rows.length} recurring item${rows.length === 1 ? "" : "s"}, about ${money(monthly)} a month. ${rows.filter((r) => r.decision === "review").length} up for review. Cancelling happens outside the dashboard; the app prepares a task for it.`, data: rows.map((r) => ({ id: r.id, name: `${r.name} ${money(r.amount)} ${r.cycle}`, date: r.next_charge, amount: r.amount, kind: r.kind, decision: r.decision, href: "/money/subscriptions" })), href: "/money/subscriptions" };
    },
  },
  {
    name: "money.explainCharge", title: "Explain a charge", kind: "write", tier: 1,
    description: "Record what a charge was for and, optionally, its category. Find the charge with money.findCharge first and pass its id. Saves with Undo; nothing is paid or moved.",
    input: {
      id: { type: "string", describe: "The charge's id from money.findCharge", required: true },
      note: { type: "string", describe: "What it was, in the person's words", required: true },
      category: { type: "enum", options: [...CATEGORY_IDS], describe: "The category, if the person said one", required: false },
    },
    async run(a, c) {
      const id = str(a.id), note = str(a.note).slice(0, 200), cat = str(a.category);
      if (!id || !note) return { ok: false, error: "Need the charge and a note." };
      const patch: Record<string, unknown> = { status: "classified", note, flag: null };
      if (cat && CATEGORY_IDS.includes(cat)) patch.category = cat;
      const { data, error } = await c.sb.from("transactions").update(patch).eq("id", id).select("merchant, amount").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "No charge with that id." };
      await c.sb.from("activity_log").insert({ actor: c.email, action: "charge_explained", subject: `${data.merchant} ${money(data.amount)}: ${note.slice(0, 80)}`, ref: id, undoable: true }).then(() => {}, () => {});
      return { ok: true, summary: `Explained ${data.merchant} ${money(data.amount)}: ${note}${cat ? ` (${label(cat)})` : ""}`, href: `/money/receipts?for=${id}` };
    },
  },
  {
    name: "money.markTransfer", title: "Mark as a transfer", kind: "write", tier: 1,
    description: "Mark a charge as a transfer between the household's own accounts, so it stops counting as spending. Find it with money.findCharge first.",
    input: { id: { type: "string", describe: "The charge's id", required: true } },
    async run(a, c) {
      const id = str(a.id);
      const { data, error } = await c.sb.from("transactions").update({ status: "transfer", flag: null }).eq("id", id).select("merchant, amount").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "No charge with that id." };
      await c.sb.from("activity_log").insert({ actor: c.email, action: "charge_transfer", subject: `${data.merchant} ${money(data.amount)}`, ref: id, undoable: true }).then(() => {}, () => {});
      return { ok: true, summary: `${data.merchant} ${money(data.amount)} is a transfer now, not spending.`, href: "/money" };
    },
  },
];
