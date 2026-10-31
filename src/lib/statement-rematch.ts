// Open statements in the Inbox follow the accounts list and the checks. Never files anything; touches only open statement items'
// question and read_result, never a file, never a statement row.
//  refreshOpenStatements (run when an account is added, changed or retired, or on "Check waiting statements"):
//   - a statement that now matches exactly one live account (printed last four, else the file name) is marked matched and asks one question;
//   - a statement still unmatched gets its "Which account?" choices rebuilt from the live list, so a new account appears.
//  checkOpenStatements (run after every statement is read, and after every refresh, and again just before any filing):
//   - works out which matched statements fail a check (duplicate month, date or account disagreement, no closing date) and turns each
//     into a "not filed automatically" question that states why. Clean ones ask "File it?". Only those are in "File all".
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAccount, whyNoMatch, accountLabel, conflictNote, statementName, type AccountRow } from "@/lib/statement-match";
import { resolvePeriod, checkStatements, statementQuestion, type StItem, type StFiled, type StCheck } from "@/lib/statement-checks";

type Item = { id: string; title: string | null; file_path: string | null; read_result: Record<string, unknown> | null; options: string[] | null; missing: string | null };
const baseName = (s: string | null) => (s ?? "").split("/").pop()?.trim() || "this file";
const hintOf = (rr: Record<string, unknown>, it: Item) => (rr.file_name_hint as string | undefined) ?? it.file_path;

export async function checkOpenStatements(sb: SupabaseClient): Promise<{ blocked: number; warned: number; gaps: Record<string, string[]> }> {
  const { data: rows } = await sb.from("inbox_items").select("id,title,file_path,read_result,options,missing").eq("status", "open").eq("read_result->>kind", "statement").limit(200);
  const { data: filedRows } = await sb.from("account_statements").select("account_id,period,closing_date,inbox_id,name").limit(2000);
  const filed: StFiled[] = ((filedRows ?? []) as { account_id: string; period: string; closing_date: string | null; inbox_id: string | null; name: string | null }[]).map((f) => ({ acct: f.account_id, period: f.period, closing: f.closing_date, inboxId: f.inbox_id, name: f.name ?? `${f.period} statement` }));
  const items: StItem[] = [];
  const src = new Map<string, { it: Item; rr: Record<string, unknown> }>();
  for (const it of (rows ?? []) as Item[]) {
    const rr = { ...(it.read_result ?? {}) } as Record<string, unknown>;
    const acct = rr.statement_account as { id: string; label: string } | null | undefined;
    if (!acct) continue;
    const pr = resolvePeriod(rr as { closing_date?: unknown; statement_period?: unknown; date?: unknown }, hintOf(rr, it));
    items.push({ id: it.id, acct: acct.id, label: acct.label, period: pr.period, closing: pr.closing, fileDate: pr.fileDate, basis: pr.basis, conflict: (rr.statement_conflict as string | null | undefined) ?? null, name: baseName(it.title ?? it.file_path) });
    src.set(it.id, { it, rr });
  }
  const { byItem, gaps } = checkStatements(items, filed, new Date().toISOString().slice(0, 10));
  let blocked = 0, warned = 0;
  for (const i of items) {
    const c: StCheck = byItem[i.id] ?? { blocks: [], warns: [] };
    const { it, rr } = src.get(i.id)!;
    if (c.blocks.length) blocked++; else if (c.warns.length) warned++;
    const q = statementQuestion({ label: i.label, period: i.period ?? "unknown month", closing: i.closing, balance: typeof rr.statement_balance === "number" ? (rr.statement_balance as number) : null, via: (rr.statement_match as string | null | undefined) ?? null }, c);
    const same = it.missing === q.missing && it.options?.length === q.options.length && q.options.every((o, k) => it.options?.[k] === o);
    if (same) continue;
    await sb.from("inbox_items").update({ missing: q.missing, options: q.options, read_result: { ...rr, statement_checks: c } }).eq("id", i.id).eq("status", "open");
  }
  return { blocked, warned, gaps };
}

export async function refreshOpenStatements(sb: SupabaseClient): Promise<{ matched: number; refreshed: number; byAccount: Record<string, number>; stillUnmatched: number; blocked: number; notice: string | null }> {
  const { data: accts } = await sb.from("accounts").select("id,institution,last4,retired_at");
  const list = ((accts ?? []) as AccountRow[]).filter((a) => !a.retired_at);
  const { data: rows } = await sb.from("inbox_items").select("id,title,file_path,read_result,options,missing").eq("status", "open").eq("read_result->>kind", "statement").limit(200);
  let matched = 0, refreshed = 0, stillUnmatched = 0;
  const byAccount: Record<string, number> = {};
  for (const it of (rows ?? []) as Item[]) {
    const rr = { ...(it.read_result ?? {}) } as Record<string, unknown>;
    const conf = typeof rr.confidence === "number" ? rr.confidence : 0;
    const found = resolveAccount(list, rr.card_last4, hintOf(rr, it));
    // The month is worked out again from the closing date every time, so an old guess from the reader is replaced.
    const pr = resolvePeriod(rr as { closing_date?: unknown; statement_period?: unknown; date?: unknown }, hintOf(rr, it));
    const period = pr.period ?? "unknown month";
    const bal = typeof rr.statement_balance === "number" ? `, balance $${(rr.statement_balance as number).toFixed(2)}` : "";
    if (found && conf >= 0.6) {
      const prev = JSON.stringify([rr.statement_account, rr.statement_period, rr.closing_date]);
      rr.statement_account = { id: found.acct.id, label: accountLabel(found.acct) };
      rr.statement_match = found.via;
      rr.statement_conflict = found.conflict ? conflictNote(found.acct, found.conflict) : null;
      rr.statement_period = pr.period; rr.closing_date = pr.closing; rr.file_date = pr.fileDate; rr.period_basis = pr.basis;
      rr.statement_name = statementName(period, found.acct);
      const upd = { read_result: rr, suggested_name: rr.statement_name as string };
      await sb.from("inbox_items").update(upd).eq("id", it.id).eq("status", "open");   // the question itself is written by checkOpenStatements below
      if (prev !== JSON.stringify([rr.statement_account, rr.statement_period, rr.closing_date]) || !(it.options?.[0] === "Yes, file it" || it.options?.[0] === "File it anyway")) { matched++; const l = accountLabel(found.acct); byAccount[l] = (byAccount[l] ?? 0) + 1; }
    } else {
      const want = [...list.map(accountLabel), "Something else"];
      const have = it.options ?? [];
      stillUnmatched++;
      const why = whyNoMatch(list, rr.card_last4, hintOf(rr, it), conf) ?? "Not matched on my own.";
      const missing = `${why} Statement ${period}${bal}. Which account is it for?`;
      if (want.length !== have.length || want.some((w, i) => w !== have[i]) || it.missing !== missing) { await sb.from("inbox_items").update({ options: want, missing, read_result: { ...rr, statement_account: null, statement_match: null, statement_conflict: null } }).eq("id", it.id).eq("status", "open"); refreshed++; }
    }
  }
  const chk = await checkOpenStatements(sb).catch(() => ({ blocked: 0, warned: 0, gaps: {} as Record<string, string[]> }));
  const parts = Object.entries(byAccount).map(([l, n]) => `${n} to ${l}`);
  const tail = `${stillUnmatched ? ` ${stillUnmatched} still need an account.` : ""}${chk.blocked ? ` ${chk.blocked} need a look first (each says why).` : ""}`;
  const notice = matched ? `${matched} waiting statement${matched === 1 ? "" : "s"} now matched (${parts.join(", ")}). Nothing is filed until you tap.${tail}` : (stillUnmatched && refreshed) || chk.blocked ? `Checked.${tail || " Their choices are up to date."}` : null;
  return { matched, refreshed, byAccount, stillUnmatched, blocked: chk.blocked, notice };
}
