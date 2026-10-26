import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";
import { CATEGORY_IDS } from "@/lib/categories";

// One find across the registers that hold documents: the Inbox (everything captured and read), Receipts, and
// Records. It returns names, dates, amounts and where a thing lives -- never the contents of a document. The
// caller's own client is used, so row-level security decides what each person can see; the tool adds nothing.
//
// This is the seed of the document catalog (D98): the same shape of answer, over what the app already knows.
// When the walker lands, it joins this search rather than replacing it.

type Hit = { register: "inbox" | "receipt" | "record"; name: string; date: string | null; amount: number | null; category: string | null; kind: string | null; where: string | null; href: string };

const LIMIT = 20;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$.]+/g, " ").trim();
const words = (q: string) => norm(q).split(" ").filter((w) => w.length > 1);
// Every word the person typed has to appear somewhere in the row's searchable text. Vendor names are short
// and people type them whole, so substring per word is enough; no fuzzy matching, which would surface
// documents that merely look similar and make the answer unreliable.
const matches = (ws: string[], hay: string) => { const h = norm(hay); return ws.every((w) => h.includes(w)); };
const inRange = (d: string | null, from: string, to: string) => !d ? !from && !to : (!from || d >= from) && (!to || d <= to);

export const documentTools: Tool[] = [
  {
    name: "document.find", title: "Find documents", kind: "read", tier: 1,
    description: "Find receipts, bills, statements and records the household has filed, by vendor, words in the name, date range or category. Returns names, dates, amounts and where each one lives, never what is inside it. Use for 'do we have', 'when did we', 'find the ... receipt'.",
    input: {
      text: { type: "string", describe: "Vendor, item or words from the document's name, e.g. 'AAA', 'furnace', 'Amazon trim'", required: false },
      from: { type: "date", describe: "Earliest document date to include", required: false },
      to: { type: "date", describe: "Latest document date to include", required: false },
      category: { type: "enum", options: [...CATEGORY_IDS], describe: "Limit to one spending category", required: false },
    },
    async run(a, c) {
      const ws = words(str(a.text));
      const from = str(a.from), to = str(a.to), cat = str(a.category);
      if (!ws.length && !from && !to && !cat) return { ok: false, error: "Say what to look for: a vendor, some words, a date range or a category." };

      const [inbox, receipts, records] = await Promise.all([
        c.sb.from("inbox_items").select("id, title, status, filed, read_result").not("read_result", "is", null).is("copy_error", null).limit(1000),
        c.sb.from("receipts").select("id, merchant, amount, date, file_path, home_path, status").is("duplicate_of", null).limit(1000),
        c.sb.from("records").select("id, kind, title, happens_at, file_ref, confirmation_number, for_person").limit(1000),
      ]);

      const hits: Hit[] = [];
      // Receipts that came through the Inbox are linked, not duplicated (filed.receipt_id), so the same paper is
      // reported once, from the register that holds its file.
      const linkedReceipts = new Set<string>();

      for (const r of (inbox.data ?? []) as { id: string; title: string; status: string; filed: Record<string, string> | null; read_result: Record<string, unknown> }[]) {
        const rr = r.read_result;
        if (rr.error) continue;
        const date = typeof rr.date === "string" ? rr.date : null;
        const category = typeof rr.category === "string" ? rr.category : null;
        if (cat && category !== cat) continue;
        if (!inRange(date, from, to)) continue;
        const hay = [r.title, rr.vendor, rr.item, rr.covers, rr.order_number, rr.reference, rr.suggested_name, category].filter((x) => typeof x === "string").join(" ");
        if (ws.length && !matches(ws, hay)) continue;
        const filed = r.filed ?? {};
        if (filed.receipt_id) linkedReceipts.add(filed.receipt_id);
        const href = filed.receipt_id ? `/money/receipts?item=${filed.receipt_id}` : filed.vehicle_id ? `/vehicles/${filed.vehicle_id}` : "/inbox";
        hits.push({ register: "inbox", name: typeof rr.suggested_name === "string" ? rr.suggested_name : r.title, date, amount: typeof rr.amount === "number" ? rr.amount : null, category, kind: typeof rr.kind === "string" ? rr.kind : null, where: typeof rr.home === "string" ? rr.home : null, href });
      }

      if (!cat) {
        for (const r of (receipts.data ?? []) as { id: string; merchant: string; amount: number; date: string; file_path: string | null; home_path: string | null; status: string }[]) {
          if (linkedReceipts.has(r.id)) continue;
          if (!inRange(r.date, from, to)) continue;
          if (ws.length && !matches(ws, `${r.merchant} ${r.file_path ?? ""}`)) continue;
          hits.push({ register: "receipt", name: `${r.merchant} ${r.date}`, date: r.date, amount: r.amount, category: null, kind: "receipt", where: r.home_path ?? r.file_path, href: `/money/receipts?item=${r.id}` });
        }
        for (const r of (records.data ?? []) as { id: string; kind: string; title: string; happens_at: string | null; file_ref: string | null; confirmation_number: string | null; for_person: string | null }[]) {
          const date = r.happens_at ? r.happens_at.slice(0, 10) : null;
          if (!inRange(date, from, to)) continue;
          if (ws.length && !matches(ws, `${r.title} ${r.kind} ${r.for_person ?? ""} ${r.confirmation_number ?? ""}`)) continue;
          hits.push({ register: "record", name: r.title, date, amount: null, category: null, kind: r.kind, where: r.file_ref, href: `/records/${r.id}` });
        }
      }

      hits.sort((x, y) => (y.date ?? "").localeCompare(x.date ?? ""));
      const shown = hits.slice(0, LIMIT);
      const what = [ws.length ? `"${str(a.text)}"` : "", cat ? `in ${cat.replace("_", " ")}` : "", from || to ? `${from || "…"} to ${to || "…"}` : ""].filter(Boolean).join(", ");
      return {
        ok: true,
        summary: hits.length === 0 ? `Nothing filed matches ${what}.` : `${hits.length} document${hits.length === 1 ? "" : "s"} match${hits.length === 1 ? "es" : ""} ${what}${hits.length > LIMIT ? `; showing the newest ${LIMIT}` : ""}.`,
        data: shown,
        href: shown.length === 1 ? shown[0].href : undefined,
      };
    },
  },
];
