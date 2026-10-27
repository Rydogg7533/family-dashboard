import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";

// What the asker asked before (migration 0074). The Ask box carries only the last 24 hours; this is how it
// reaches further back without carrying it: "what did I ask about AAA last week" reads the rows, never the
// whole past thread. Own rows only (RLS).
const clean = (s: string) => s.replace(/[%_,]/g, "").trim();

export const historyTools: Tool[] = [
  {
    name: "ask.history", title: "Earlier questions", kind: "read", tier: 1,
    description: "The asker's own earlier Ask exchanges (question, answer, date, what was proposed), beyond the last 24 hours that are in front of you. Use when they refer to something asked before ('that receipt we found Friday', 'what did I ask about the Tahoe last week', 'the number you gave me yesterday'). Returns the matching exchanges, newest first.",
    input: { text: { type: "string", describe: "Words from the question or answer", required: false }, from: { type: "date", describe: "Earliest day", required: false }, to: { type: "date", describe: "Latest day", required: false }, limit: { type: "number", describe: "How many; default 10", required: false } },
    async run(a, c) {
      const text = clean(str(a.text)), from = str(a.from), to = str(a.to);
      if (!text && !from && !to) return { ok: false, error: "Say what to look for, or a day." };
      let sel = c.sb.from("ask_history").select("id, at, source, question, answer, kind, proposed").is("deleted_at", null).order("at", { ascending: false }).limit(50);
      if (text) sel = sel.or(`question.ilike.%${text}%,answer.ilike.%${text}%`);
      if (from) sel = sel.gte("at", `${from}T00:00:00`);
      if (to) sel = sel.lte("at", `${to}T23:59:59`);
      const { data } = await sel;
      const want = Number.isFinite(Number(a.limit)) && Number(a.limit) > 0 ? Math.min(Number(a.limit), 20) : 10;
      const rows = ((data ?? []) as { id: string; at: string; source: string; question: string; answer: string; kind: string; proposed: string | null }[]).slice(0, want);
      return {
        ok: true,
        summary: rows.length ? `${rows.length} earlier exchange${rows.length === 1 ? "" : "s"}${text ? ` mentioning "${text}"` : ""}. Use what they say; the person can open the history page from the rows.` : `Nothing asked before${text ? ` about "${text}"` : ""} in that range.`,
        data: rows.map((r) => ({ id: r.id, name: r.question, detail: `${r.at.slice(0, 10)} · ${r.answer.slice(0, 160)}`, answer: r.answer.slice(0, 600), proposed: r.proposed, date: r.at.slice(0, 10), href: `/ask/history?q=${encodeURIComponent(text || r.question.slice(0, 40))}` })),
        href: "/ask/history",
      };
    },
  },
];
