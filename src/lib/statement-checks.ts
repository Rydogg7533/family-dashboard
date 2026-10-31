// Statements: the month a statement is named for, and the checks that run before one may be filed. Pure (client-safe, no model, no database).
//
// The month is never the reader's guess. It is worked out from the closing date alone: the month in which most of the cycle falls,
// which is the month of (closing date minus 15 days). A cycle Aug 8 to Sep 8 is August; Sep 8 to Oct 7 is September; a calendar-month
// statement closing on the 31st is its own month. The closing date comes from the page, else from the date in the file name
// (Wells Fargo names its files "<last4> - MMDDYY"). When both exist and disagree, nothing is filed on its own.
import { FILE_YES, FILE_NO, FILE_ANYWAY } from "./inbox-answers.ts";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const validDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(utc(d)) && iso(utc(d)) === d;   // 2026-13-45 is not a date (and must not throw)

// The month most of the cycle falls in, from the closing date. Null when the date is not a real date.
export function periodFromClosing(closing: unknown): string | null {
  return validDate(closing) ? iso(utc(closing) - 15 * DAY).slice(0, 7) : null;
}

// "<last4> - 090826 WellsFargo.pdf" carries the closing date as MMDDYY. A six-digit group that is not a real date is ignored.
export function dateFromFileName(fileName: unknown): string | null {
  const base = String(fileName ?? "").split("/").pop() ?? "";
  for (const m of base.matchAll(/(?<![A-Za-z0-9])(\d{2})(\d{2})(\d{2})(?![A-Za-z0-9])/g)) {
    const d = `20${m[3]}-${m[1]}-${m[2]}`;
    if (validDate(d)) return d;
  }
  return null;
}

export type PeriodRead = { closing: string | null; fileDate: string | null; period: string | null; basis: "closing date" | "file name" | "reader's guess" | "none" };
// closing = the page's closing date, else the file name's. A page month with no date at all is kept only as the reader's guess (and then asks).
export function resolvePeriod(r: { closing_date?: unknown; statement_period?: unknown; date?: unknown }, fileName: unknown): PeriodRead {
  const fileDate = dateFromFileName(fileName);
  const page = validDate(r.closing_date) ? r.closing_date : null;
  const closing = page ?? fileDate;
  if (closing) return { closing, fileDate, period: periodFromClosing(closing), basis: page ? "closing date" : "file name" };
  for (const v of [r.statement_period, r.date]) { const s = String(v ?? ""); if (/^\d{4}-\d{2}/.test(s)) return { closing: null, fileDate, period: s.slice(0, 7), basis: "reader's guess" }; }
  return { closing: null, fileDate, period: null, basis: "none" };
}

// ---- the checks -------------------------------------------------------------------------------------------------------------------
export type StItem = { id: string; acct: string | null; label: string; period: string | null; closing: string | null; fileDate: string | null; basis: PeriodRead["basis"]; conflict?: string | null; name: string };
export type StFiled = { acct: string; period: string; closing: string | null; inboxId: string | null; name: string };
export type StCheck = { blocks: string[]; warns: string[] };

// Blocks stop the statement from filing by itself (and from "File all"); the person can still tap "File it anyway". Warns only inform.
export function checkStatements(items: StItem[], filed: StFiled[], today: string): { byItem: Record<string, StCheck>; gaps: Record<string, string[]> } {
  const byItem: Record<string, StCheck> = {};
  const gaps: Record<string, string[]> = {};
  const earliest = "2015-01-01", latest = iso(utc(today) + 31 * DAY);
  for (const it of items) {
    const c: StCheck = { blocks: [], warns: [] };
    byItem[it.id] = c;
    if (!it.acct) continue;
    if (it.conflict) c.blocks.push(it.conflict);
    if (it.basis === "reader's guess") c.blocks.push("No closing date was found on the page or in the file name, so the month is only the reader's guess.");
    if (it.basis === "none") c.blocks.push("No closing date or month was found.");
    if (it.closing && it.fileDate && it.closing !== it.fileDate) c.blocks.push(`The page says it closes ${shortDate(it.closing)}, but the file name says ${shortDate(it.fileDate)}.`);
    if (it.closing && (it.closing < earliest || it.closing > latest)) c.blocks.push(`The closing date ${it.closing} does not look right.`);
    if (it.period) {
      const sameWait = items.filter((o) => o.id !== it.id && o.acct === it.acct && o.period === it.period);
      const sameFiled = filed.filter((f) => f.acct === it.acct && f.period === it.period && f.inboxId !== it.id);
      if (sameFiled.length) c.blocks.push(`A ${it.period} statement for this account is already filed (${sameFiled[0].name}). Is this the same one, or is one mislabeled?`);
      else if (sameWait.length) c.blocks.push(`Another ${it.period} statement for this account is waiting (${sameWait[0].name}). Is this the same one, or is one mislabeled?`);
    }
  }
  // Per account: closing dates should be about a month apart, and no month should be missing between the first and the last.
  const accts = new Set([...items.map((i) => i.acct), ...filed.map((f) => f.acct)].filter((a): a is string => !!a));
  for (const a of accts) {
    const pts = [
      ...items.filter((i) => i.acct === a && i.closing).map((i) => ({ id: i.id as string | null, closing: i.closing as string })),
      ...filed.filter((f) => f.acct === a && f.closing && f.inboxId !== null).map((f) => ({ id: null as string | null, closing: f.closing as string })),
    ].sort((x, y) => x.closing.localeCompare(y.closing));
    for (let k = 1; k < pts.length; k++) {
      const days = Math.round((utc(pts[k].closing) - utc(pts[k - 1].closing)) / DAY);
      if (days < 24 || days > 35) for (const p of [pts[k], pts[k - 1]]) if (p.id && byItem[p.id]) byItem[p.id].warns.push(`Closes ${days} days ${p === pts[k] ? "after" : "before"} the neighbouring statement (${shortDate(p === pts[k] ? pts[k - 1].closing : pts[k].closing)}); statements are normally about a month apart.`);
    }
    const periods = [...new Set([...items.filter((i) => i.acct === a && i.period).map((i) => i.period as string), ...filed.filter((f) => f.acct === a).map((f) => f.period)])].sort();
    const missing: string[] = [];
    for (let p = periods[0]; periods.length && p < periods[periods.length - 1]; p = nextMonth(p)) if (!periods.includes(p)) missing.push(p);
    if (missing.length) gaps[a] = missing;
  }
  return { byItem, gaps };
}
const nextMonth = (p: string) => { const y = Number(p.slice(0, 4)), m = Number(p.slice(5, 7)); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };

// ---- the one question every statement card asks ---------------------------------------------------------------------------------------
export type StText = { label: string; period: string; closing: string | null; balance: number | null; via: string | null };
export function statementQuestion(t: StText, c: StCheck): { missing: string; options: string[] } {
  const closes = t.closing ? ` (closes ${shortDate(t.closing)})` : "";
  const bal = typeof t.balance === "number" ? `, balance $${t.balance.toFixed(2)}` : "";
  const via = t.via === "file name" ? " Matched by the file name." : "";
  const head = `Statement for ${t.label}, ${t.period}${closes}${bal}.${via}`;
  const warn = c.warns.length ? ` Heads up: ${c.warns.join(" ")}` : "";
  if (c.blocks.length) return { missing: `Not filed automatically: ${c.blocks.join(" ")} ${head}${warn} File it anyway?`, options: [FILE_ANYWAY, FILE_NO] };
  return { missing: `${head}${warn} File it?`, options: [FILE_YES, FILE_NO] };
}

// An account whose last four match another live account: allowed, but said out loud.
export function sharedLast4(accounts: { id: string; institution: string; last4: string; retired_at?: string | null }[], last4: string, selfId?: string | null): string | null {
  const other = accounts.find((a) => !a.retired_at && a.last4 === last4 && a.id !== selfId);
  return other ? `${other.institution} also ends in ····${last4}. A statement that shows only those four digits will ask which account it is for.` : null;
}
