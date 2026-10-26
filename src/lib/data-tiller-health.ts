import { householdTz } from "@/lib/google-calendar";
// Server reader for the Tiller health check: accounts, their charge dates, and this period's "no activity" confirmations.
import type { createClient } from "@/lib/supabase/server";
import { tillerHealth, type HealthAccount, type TillerHealth } from "@/lib/tiller-health";

type Sb = Awaited<ReturnType<typeof createClient>>;
export const todayLocal = async () => new Intl.DateTimeFormat("en-CA", { timeZone: await householdTz() }).format(new Date());

export async function getTillerHealth(sb: Sb, period: string): Promise<TillerHealth> {
  const [{ data: accts }, { data: conf }] = await Promise.all([
    sb.from("accounts").select("id,institution,last4,synced_at,tiller_tracked").is("retired_at", null).order("institution").order("last4"),
    sb.from("account_period_confirms").select("account_id").eq("period", period).is("revoked_at", null),
  ]);
  const list = accts ?? [];
  const confirmed = new Set((conf ?? []).map((c) => c.account_id as string));
  // Every charge date from about 15 months back; 1,000 per page, a stable order.
  const cutoff = new Date(Date.now() - 460 * 86400_000).toISOString().slice(0, 10);
  const byAcct = new Map<string, string[]>();
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("transactions").select("account_id,date").gte("date", cutoff).order("date").order("id").range(from, from + 999);
    for (const t of data ?? []) { const k = t.account_id as string; const a = byAcct.get(k); if (a) a.push(t.date as string); else byAcct.set(k, [t.date as string]); }
    if (!data || data.length < 1000) break;
  }
  const accounts: HealthAccount[] = list.map((a) => ({
    id: a.id as string,
    label: `${a.institution}${a.last4 ? ` ····${a.last4}` : ""}`,
    dates: byAcct.get(a.id as string) ?? [],
    confirmed: confirmed.has(a.id as string),
    tracked: a.tiller_tracked !== false,
  }));
  const tracked = new Set(accounts.filter((a) => a.tracked).map((a) => a.id));
  const stamps = list.filter((a) => tracked.has(a.id as string)).map((a) => (a.synced_at as string | null) ?? null);
  return tillerHealth(accounts, period, await todayLocal(), stamps);
}
