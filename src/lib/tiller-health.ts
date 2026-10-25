// Tiller health: has every Tiller-fed account really delivered its charges for a month? (client-safe, pure)
// A silent bank link looks exactly like a month with no spending, so each account is judged against its own history:
// it must not go quiet for much longer than it usually does, from the month's start to its end. A person can confirm
// "no activity this month" for an account (logged elsewhere); nothing here changes any data.
export const SYNC_MAX_DAYS = 3;          // the Tiller sync must have run this recently (current month only)
export const QUIET_FLOOR_DAYS = 10;      // never call a silence shorter than this a gap
export const QUIET_CAP_DAYS = 45;        // never allow a silence longer than this, however slow the account is
export const QUIET_FACTOR = 3;           // allowed silence = this many times the account's usual gap
export const SPARSE_ACCOUNT_DAYS = 30;   // accounts with fewer than 5 charges on record get this allowance

export type HealthAccount = { id: string; label: string; dates: string[]; confirmed: boolean; tracked: boolean };
export type AcctState = "good" | "gap" | "confirmed" | "untracked";
export type AcctHealth = { id: string; label: string; state: AcctState; line: string; lastCharge: string | null; allowance: number };
export type TillerHealth = {
  period: string; ok: boolean; syncOk: boolean; syncLine: string | null;
  good: number; total: number; accounts: AcctHealth[]; failing: AcctHealth[];
};

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);
const lastDay = (period: string) => { const [y, m] = period.split("-").map(Number); return `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// How long this account may be silent before it counts as a gap: 3x its usual gap, between 10 and 45 days.
export function allowanceFor(sortedDates: string[]): number {
  if (sortedDates.length < 5) return SPARSE_ACCOUNT_DAYS;
  const span = daysBetween(sortedDates[0], sortedDates[sortedDates.length - 1]);
  const mean = span / (sortedDates.length - 1);
  return Math.min(QUIET_CAP_DAYS, Math.max(QUIET_FLOOR_DAYS, Math.ceil(QUIET_FACTOR * mean)));
}

export function checkAccount(a: HealthAccount, period: string, today: string): AcctHealth {
  const dates = [...new Set(a.dates.map((d) => String(d).slice(0, 10)))].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const lastCharge = dates.length ? dates[dates.length - 1] : null;
  const base = { id: a.id, label: a.label, lastCharge };
  if (!a.tracked) return { ...base, state: "untracked", line: "Not carried by Tiller; its statement fills it in.", allowance: 0 };
  const start = `${period}-01`;
  const end = lastDay(period) < today ? lastDay(period) : today;
  if (end < start) return { ...base, state: "good", line: "This month has not started.", allowance: 0 };
  const allowance = allowanceFor(dates.filter((d) => d <= end));
  if (a.confirmed) return { ...base, state: "confirmed", line: "You confirmed this account had no activity this month.", allowance };
  if (!dates.length) return { ...base, state: "gap", line: "No charges loaded for this account at all.", allowance };
  if (dates[0] > end) return { ...base, state: "good", line: "Account starts after this month.", allowance };
  // Walk the silences inside the month: previous charge (or the month's start) -> each charge -> the next charge after the month, or the month's end.
  const before = dates.filter((d) => d < start);
  const inside = dates.filter((d) => d >= start && d <= end);
  const after = dates.find((d) => d > end);
  const points = [before.length ? before[before.length - 1] : (inside[0] ?? start), ...inside, after ?? end];
  let worst = { from: points[0], to: points[0], days: 0 };
  for (let i = 1; i < points.length; i++) {
    // A silence that began before the month only counts from the month's start.
    const from = points[i - 1] < start ? start : points[i - 1];
    const to = points[i];
    const days = daysBetween(from, to);
    if (days > worst.days) worst = { from, to, days };
  }
  if (worst.days > allowance) {
    const tail = worst.to === end && !after;
    const line = tail
      ? `Last charge ${short(lastCharge!)}; nothing since (${daysBetween(lastCharge!, end)} days). It is usually quiet for at most ${allowance}.`
      : `No charges from ${short(worst.from)} to ${short(worst.to)} (${worst.days} days). It is usually quiet for at most ${allowance}.`;
    return { ...base, state: "gap", line, allowance };
  }
  return { ...base, state: "good", line: lastCharge ? `Last charge ${short(lastCharge)}.` : "Good.", allowance };
}

export function tillerHealth(accounts: HealthAccount[], period: string, today: string, syncedAts: (string | null)[]): TillerHealth {
  const rows = accounts.map((a) => checkAccount(a, period, today));
  const counted = rows.filter((r) => r.state !== "untracked");
  const failing = counted.filter((r) => r.state === "gap");
  // The sync only matters for the month in progress; a closed month is judged by its charges alone.
  const current = today.startsWith(period);
  const stamps = syncedAts.filter((s): s is string => !!s).map((s) => s.slice(0, 10)).sort();
  const newest = stamps.length ? stamps[stamps.length - 1] : null;
  let syncOk = true, syncLine: string | null = null;
  if (current) {
    if (!newest) { syncOk = false; syncLine = "The Tiller sync has never run."; }
    else { const age = daysBetween(newest, today); if (age > SYNC_MAX_DAYS) { syncOk = false; syncLine = `The Tiller sync last ran ${age} days ago. Run it, then check again.`; } }
  }
  return { period, ok: failing.length === 0 && syncOk && counted.length > 0, syncOk, syncLine, good: counted.length - failing.length, total: counted.length, accounts: rows, failing };
}
