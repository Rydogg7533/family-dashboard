import Link from "next/link";
import { H1, Card } from "@/components/ui";
import { ago } from "@/lib/data";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Every Ask exchange the person has had, newest first, searchable. The Ask tab shows only the last 24 hours;
// this is the rest. Rows are the person's own (RLS); a search is a plain word match on question and answer.
type Row = { id: string; at: string; source: string; question: string; answer: string; kind: string; proposed: string | null; cost: number; model: string | null };

export default async function AskHistory({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  let rows: Row[] = [];
  if (hasSupabaseEnv()) {
    const sb = await createClient();
    let sel = sb.from("ask_history").select("id, at, source, question, answer, kind, proposed, cost, model").is("deleted_at", null).order("at", { ascending: false }).limit(200);
    if (query) sel = sel.or(`question.ilike.%${query.replace(/[%_,]/g, "")}%,answer.ilike.%${query.replace(/[%_,]/g, "")}%`);
    rows = ((await sel).data ?? []) as Row[];
  }
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  let lastDay = "";
  return (
    <>
      <H1>Ask history</H1>
      <p className="text-xs text-muted mb-3">Everything you have asked, kept. The <Link href="/ask" className="text-accent font-semibold">Ask tab</Link> carries the last 24 hours; this is all of it.</p>
      <form className="flex gap-2 mb-3">
        <input name="q" defaultValue={query} placeholder="Search questions and answers" aria-label="Search history" className="flex-1 min-h-11 rounded-full border border-line bg-bg px-4 text-sm" />
        <button type="submit" className="min-h-11 px-4 rounded-full bg-accent text-white font-semibold text-sm">Search</button>
      </form>
      <div className="flex flex-col gap-1.5">
        {rows.length === 0 && <Card className="text-muted">{query ? `Nothing matching "${query}".` : "Nothing yet. Ask something on the Ask tab and it lands here."}</Card>}
        {rows.map((r) => {
          const day = dayOf(r.at);
          const head = day !== lastDay; lastDay = day;
          return (
            <div key={r.id}>
              {head && <div className="text-[11px] font-bold tracking-wide text-muted pt-2 pb-1">{day.toUpperCase()}</div>}
              <div className="py-2 border-b border-line text-sm min-w-0 [overflow-wrap:anywhere]">
                <div className="font-semibold">{r.question}</div>
                <div className="text-muted whitespace-pre-wrap mt-0.5">{r.answer}</div>
                {r.proposed && <div className="text-xs text-amber mt-0.5">Proposed: {r.proposed}</div>}
                <div className="text-[11px] text-muted mt-1">{ago(r.at)} · {r.source === "ask" ? "Ask tab" : `from ${r.source.replace(/^page:/, "")}`} · {r.kind}{r.cost ? ` · ~$${Number(r.cost).toFixed(3)}` : ""}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
