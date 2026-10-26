import { NextResponse } from "next/server";
import { toolCtx } from "@/lib/tools/run";
import { runCases } from "@/lib/ask-eval/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs the Ask question set as the signed-in owner and reports pass/fail per case. Owner only: it spends
// model calls (about a cent a case) and reads the household's records under the caller's own permissions.
// ?only=<substring> runs a subset; ?from=N&n=10 pages through; ?format=json for the raw results. Nothing is written by a run.
export async function GET(req: Request) {
  const c = await toolCtx();
  if (!c) return new NextResponse("Sign in first", { status: 401 });
  if (!c.isOwner) return new NextResponse("Owner only", { status: 403 });
  const url = new URL(req.url);
  const only = url.searchParams.get("only") ?? undefined;
  const from = Math.max(0, Number(url.searchParams.get("from") ?? 0) || 0);
  const n = Math.min(20, Math.max(1, Number(url.searchParams.get("n") ?? 10) || 10));
  const out = await runCases(only, from, n);
  if (url.searchParams.get("format") === "json") return NextResponse.json(out);
  const lines = [
    `Ask question set: cases ${out.from + 1}–${out.from + out.results.length} of ${out.total}: ${out.passed} passed, ${out.failed} failed, ~$${out.cost.toFixed(2)}${out.next !== null ? `   · next page: ?from=${out.next}${only ? `&only=${only}` : ""}` : "   · that was the last page"}`,
    "",
    ...out.results.map((r) => `${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(10)} ${r.ask}\n      ${r.kind}${r.tool ? ` → ${r.tool}` : ""} · read ${r.reads.join(", ") || "nothing"} · ${r.rows} rows${r.why.length ? `\n      ${r.why.join("; ")}` : ""}\n      "${r.text.replace(/\s+/g, " ").slice(0, 160)}"`),
  ];
  return new NextResponse(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
