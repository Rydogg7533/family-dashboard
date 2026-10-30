// Open statements in the Inbox follow the accounts list. Run when an account is added, changed or retired:
//  - a statement that now matches exactly one live account (printed last four, else the file name) is marked matched
//    and asks one question, "File it?". It is never filed here; the person taps, or taps "File all matched".
//  - a statement still unmatched gets its "Which account?" choices rebuilt from the live list, so a new account appears.
// Touches only open statement items, only their question and read_result; never a file, never a statement row.
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAccount, accountLabel, statementName, type AccountRow } from "@/lib/statement-match";
import { FILE_YES, FILE_NO } from "@/lib/inbox-answers";

type Item = { id: string; file_path: string | null; read_result: Record<string, unknown> | null; options: string[] | null; missing: string | null };

export async function refreshOpenStatements(sb: SupabaseClient): Promise<{ matched: number; refreshed: number }> {
  const { data: accts } = await sb.from("accounts").select("id,institution,last4,retired_at");
  const list = ((accts ?? []) as AccountRow[]).filter((a) => !a.retired_at);
  const { data: rows } = await sb.from("inbox_items").select("id,file_path,read_result,options,missing").eq("status", "open").eq("read_result->>kind", "statement").limit(200);
  let matched = 0, refreshed = 0;
  for (const it of (rows ?? []) as Item[]) {
    const rr = { ...(it.read_result ?? {}) } as Record<string, unknown>;
    const conf = typeof rr.confidence === "number" ? rr.confidence : 0;
    const found = resolveAccount(list, rr.card_last4, (rr.file_name_hint as string | undefined) ?? it.file_path);
    const period = typeof rr.statement_period === "string" ? rr.statement_period : null;
    const bal = typeof rr.statement_balance === "number" ? `, balance $${(rr.statement_balance as number).toFixed(2)}` : "";
    if (found && conf >= 0.6 && period) {
      rr.statement_account = { id: found.acct.id, label: accountLabel(found.acct) };
      rr.statement_match = found.via;
      rr.statement_period = period;
      const sName = statementName(period, found.acct);
      const upd = { read_result: rr, suggested_name: sName, missing: `Statement for ${accountLabel(found.acct)}, ${period}${bal}${found.via === "file name" ? " (matched by the file name)" : ""}. File it?`, options: [FILE_YES, FILE_NO] };
      const same = it.options?.length === 2 && it.options[0] === FILE_YES && it.missing === upd.missing;
      if (!same) { await sb.from("inbox_items").update(upd).eq("id", it.id).eq("status", "open"); matched++; }
    } else {
      const want = [...list.map(accountLabel), "Something else"];
      const have = it.options ?? [];
      if (want.length !== have.length || want.some((w, i) => w !== have[i])) { await sb.from("inbox_items").update(have.includes(FILE_YES) ? { options: want, missing: "Which account is this statement for?" } : { options: want }).eq("id", it.id).eq("status", "open"); refreshed++; }
    }
  }
  return { matched, refreshed };
}
