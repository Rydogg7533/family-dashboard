import "server-only";
import { answerAsk, type AskReply } from "@/lib/ask-engine";
import cases from "@/lib/ask-eval/cases.json";

// The question set: real asks, each with what MUST come back. It runs the live engine with the caller's
// own session, so writes stop at their confirm card exactly as they do for a person -- nothing is changed by
// a run. A case fails when the loop picked the wrong tool, showed the wrong number of rows, wrote when it
// should have declined, or answered when it should have asked.

export type Expect = {
  kind?: AskReply["kind"]; kindAny?: AskReply["kind"][];
  tool?: string; toolAny?: string[];                 // the write on the confirm card
  args?: Record<string, unknown>;                    // substrings (case-insensitive) or exact for non-strings
  read?: string; readAny?: string[];                 // a read the loop must have made
  readArgs?: Record<string, unknown>;                // on that read
  rows?: number | "some" | "none";                   // items shown to the person
  noWrite?: boolean; noTool?: string;                // must not have proposed a write / this tool
  mentions?: string[];                               // words the text must contain
};
export type Case = { id: string; ask: string; expect: Expect };
export type Result = { id: string; ask: string; pass: boolean; why: string[]; kind: string; tool: string | null; reads: string[]; rows: number; text: string; cost: number };

const has = (hay: unknown, needle: unknown) => typeof needle === "string" ? String(hay ?? "").toLowerCase().includes(needle.toLowerCase()) : hay === needle;
const argsOk = (got: Record<string, unknown> | undefined, want: Record<string, unknown> | undefined) => !want || Object.entries(want).every(([k, v]) => has(got?.[k], v));

export function judge(c: Case, r: AskReply): Result {
  const e = c.expect; const why: string[] = [];
  const tool = r.tool?.name ?? null;
  const reads = (r.trace ?? []).map((t) => t.name);
  const rows = r.items?.length ?? 0;
  if (e.kind && r.kind !== e.kind) why.push(`kind ${r.kind}, wanted ${e.kind}`);
  if (e.kindAny && !e.kindAny.includes(r.kind)) why.push(`kind ${r.kind}, wanted one of ${e.kindAny.join("/")}`);
  if (e.tool && tool !== e.tool) why.push(`write ${tool ?? "none"}, wanted ${e.tool}`);
  if (e.toolAny && !(tool && e.toolAny.includes(tool))) why.push(`write ${tool ?? "none"}, wanted one of ${e.toolAny.join("/")}`);
  if (e.args && !argsOk(r.tool?.args, e.args)) why.push(`args ${JSON.stringify(r.tool?.args ?? {})} missing ${JSON.stringify(e.args)}`);
  if (e.read && !reads.includes(e.read)) why.push(`never read ${e.read} (read: ${reads.join(", ") || "nothing"})`);
  if (e.readAny && !e.readAny.some((x) => reads.includes(x))) why.push(`read none of ${e.readAny.join("/")} (read: ${reads.join(", ") || "nothing"})`);
  if (e.readArgs) { const t = (r.trace ?? []).find((x) => x.name === (e.read ?? "")); if (!t || !argsOk(t.args, e.readArgs)) why.push(`read args ${JSON.stringify(t?.args ?? {})} missing ${JSON.stringify(e.readArgs)}`); }
  if (e.rows === "some" && rows === 0) why.push("no rows shown");
  if (e.rows === "none" && rows > 0) why.push(`${rows} rows shown, wanted none`);
  if (typeof e.rows === "number" && rows !== e.rows) why.push(`${rows} rows shown, wanted ${e.rows}`);
  if (e.noWrite && r.kind === "tool_confirm") why.push(`proposed a write (${tool})`);
  if (e.noTool && (tool === e.noTool || reads.includes(e.noTool))) why.push(`used ${e.noTool}`);
  if (e.mentions) for (const m of e.mentions) if (!r.text.toLowerCase().includes(m.toLowerCase())) why.push(`text does not mention "${m}"`);
  return { id: c.id, ask: c.ask, pass: why.length === 0, why, kind: r.kind, tool, reads, rows, text: r.text.slice(0, 300), cost: r.cost };
}

export async function runCases(only?: string, from = 0, n = 10): Promise<{ results: Result[]; passed: number; failed: number; cost: number; total: number; from: number; next: number | null }> {
  const all = (cases as Case[]).filter((c) => !only || c.id.includes(only) || c.ask.toLowerCase().includes(only.toLowerCase()));
  // A Vercel function has about a minute, and a case takes a few seconds, so a run is a page of ten.
  const list = all.slice(from, from + n);
  const results: Result[] = [];
  for (const c of list) {
    try {
      const r = await answerAsk([{ role: "user", text: c.ask }]);
      results.push(judge(c, r));
    } catch (err) {
      results.push({ id: c.id, ask: c.ask, pass: false, why: [`threw: ${(err as Error).message.slice(0, 200)}`], kind: "error", tool: null, reads: [], rows: 0, text: "", cost: 0 });
    }
  }
  const passed = results.filter((r) => r.pass).length;
  return { results, passed, failed: results.length - passed, cost: results.reduce((s, r) => s + r.cost, 0), total: all.length, from, next: from + n < all.length ? from + n : null };
}
