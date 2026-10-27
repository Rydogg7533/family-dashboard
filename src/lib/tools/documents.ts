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

// open: a link that delivers the file itself (a short-lived signed link, members only), when the app holds
// the file. fetch: a file whose only copy sits on the hub, with what a fetch request needs (D104); the row
// shows a Fetch button and the hub delivers a copy within about a minute.
type Hit = { register: "inbox" | "receipt" | "record" | "catalog"; name: string; date: string | null; amount: number | null; category: string | null; kind: string | null; where: string | null; href: string; open: string | null; fetch?: { path: string; register: string; ref: string } | null };

const LIMIT = 20;
type CatalogRow = { hub_id: number; path: string; name: string; ext: string; kind: string | null; doc_date: string | null; subject: string | null; pages: number; read_source: string | null };
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
    description: "Find receipts, bills, statements, records and any filed document, by vendor, words in the name or folder, date range or category. Searches the app's registers and the catalog of every file on the hub (years before the app). Returns names, dates, amounts and where each one lives, never what is inside it. Use for 'do we have', 'when did we', 'find the ... policy'. Only what this call returns is shown to the person, so narrow it (limit, dates, words) to exactly what they asked for.",
    input: {
      text: { type: "string", describe: "Vendor, item or words from the document's name, e.g. 'AAA', 'furnace', 'Amazon trim'", required: false },
      from: { type: "date", describe: "Earliest document date to include", required: false },
      to: { type: "date", describe: "Latest document date to include", required: false },
      category: { type: "enum", options: [...CATEGORY_IDS], describe: "Limit to one spending category", required: false },
      limit: { type: "number", describe: "How many to return, newest first. Use 1 when the person asks for 'the latest', 'the most recent' or 'the' one thing; leave unset to see what exists", required: false },
    },
    async run(a, c) {
      const ws = words(str(a.text));
      const from = str(a.from), to = str(a.to), cat = str(a.category);
      if (!ws.length && !from && !to && !cat) return { ok: false, error: "Say what to look for: a vendor, some words, a date range or a category." };

      // The catalog (every file on the hub, by name, date, kind and subject; D98) is searched in the database
      // because it is far bigger than the other registers. Words go against the path (name and folders). A
      // spending category is not something the catalog knows, so a category search leaves it out.
      let catQ = c.sb.from("documents").select("hub_id, path, name, ext, kind, doc_date, subject, pages, read_source").is("gone_at", null).order("doc_date", { ascending: false, nullsFirst: false }).limit(200);
      for (const w of ws) catQ = catQ.ilike("path", `%${w.replace(/[%_]/g, "")}%`);
      if (from) catQ = catQ.gte("doc_date", from);
      if (to) catQ = catQ.lte("doc_date", to);
      const [inbox, receipts, records, catalog] = await Promise.all([
        c.sb.from("inbox_items").select("id, title, status, filed, file_path, read_result").not("read_result", "is", null).is("copy_error", null).limit(1000),
        c.sb.from("receipts").select("id, merchant, amount, date, file_path, home_path, status").is("duplicate_of", null).limit(1000),
        c.sb.from("records").select("id, kind, title, happens_at, file_ref, confirmation_number, for_person").limit(1000),
        cat ? Promise.resolve({ data: [] as CatalogRow[] }) : catQ,
      ]);

      const hits: Hit[] = [];
      // Receipts that came through the Inbox are linked, not duplicated (filed.receipt_id), so the same paper is
      // reported once, from the register that holds its file.
      const inboxRows = (inbox.data ?? []) as { id: string; title: string; status: string; filed: Record<string, string> | null; file_path: string | null; read_result: Record<string, unknown> }[];
      const linkedReceipts = new Map<string, string>();   // receipt id -> open link, over every item, not just the matches
      for (const r of inboxRows) if (r.file_path && r.filed?.receipt_id) linkedReceipts.set(r.filed.receipt_id, `/api/capture/${r.id}`);

      for (const r of inboxRows) {
        const rr = r.read_result;
        if (rr.error) continue;
        const date = typeof rr.date === "string" ? rr.date : null;
        const category = typeof rr.category === "string" ? rr.category : null;
        if (cat && category !== cat) continue;
        if (!inRange(date, from, to)) continue;
        const hay = [r.title, rr.vendor, rr.item, rr.covers, rr.order_number, rr.reference, rr.suggested_name, category].filter((x) => typeof x === "string").join(" ");
        if (ws.length && !matches(ws, hay)) continue;
        const filed = r.filed ?? {};
        const open = r.file_path ? `/api/capture/${r.id}` : null;
        const href = filed.receipt_id ? `/money/receipts?item=${filed.receipt_id}` : filed.vehicle_id ? `/vehicles/${filed.vehicle_id}` : "/inbox";
        hits.push({ register: "inbox", name: typeof rr.suggested_name === "string" ? rr.suggested_name : r.title, date, amount: typeof rr.amount === "number" ? rr.amount : null, category, kind: typeof rr.kind === "string" ? rr.kind : null, where: typeof rr.home === "string" ? rr.home : null, href, open });
      }

      if (!cat) {
        for (const r of (receipts.data ?? []) as { id: string; merchant: string; amount: number; date: string; file_path: string | null; home_path: string | null; status: string }[]) {
          if (!inRange(r.date, from, to)) continue;
          if (ws.length && !matches(ws, `${r.merchant} ${r.file_path ?? ""}`)) continue;
          // file_path is the stored copy (captures bucket) and opens from here; home_path is the hub's filed copy.
          hits.push({ register: "receipt", name: `${r.merchant} ${r.date}`, date: r.date, amount: r.amount, category: null, kind: "receipt", where: r.home_path ? r.home_path.replace(/^.*\/Organized\//, "Organized/") : null, href: `/money/receipts?item=${r.id}`, open: r.file_path ? `/api/receipt-file/${r.id}` : (linkedReceipts.get(r.id) ?? null), fetch: !r.file_path && !linkedReceipts.get(r.id) && r.home_path ? { path: r.home_path, register: "receipt", ref: r.id } : null });
        }
        for (const r of (records.data ?? []) as { id: string; kind: string; title: string; happens_at: string | null; file_ref: string | null; confirmation_number: string | null; for_person: string | null }[]) {
          const date = r.happens_at ? r.happens_at.slice(0, 10) : null;
          if (!inRange(date, from, to)) continue;
          if (ws.length && !matches(ws, `${r.title} ${r.kind} ${r.for_person ?? ""} ${r.confirmation_number ?? ""}`)) continue;
          hits.push({ register: "record", name: r.title, date, amount: null, category: null, kind: r.kind, where: r.file_ref, href: `/records/${r.id}`, open: null, fetch: r.file_ref && /\.[a-z0-9]{2,5}$/i.test(r.file_ref) ? { path: r.file_ref, register: "record", ref: r.id } : null });
        }
        // Files the registers already reported are not repeated from the catalog; everything else on the hub is.
        const already = new Set(hits.map((h) => (h.where ?? "").replace(/^.*\/Organized\//, "Organized/")));
        for (const d of ((catalog as { data?: CatalogRow[] | null }).data ?? [])) {
          if (already.has(d.path)) continue;
          hits.push({ register: "catalog", name: d.name.replace(/\.[a-z0-9]+$/i, ""), date: d.doc_date, amount: null, category: null, kind: d.kind, where: d.path.replace(/\/[^/]+$/, "/"), href: `/records?q=${encodeURIComponent(d.name)}`, open: null, fetch: { path: d.path, register: "catalog", ref: String(d.hub_id) } });
        }
      }

      // The Inbox item and the receipt it was filed to are one paper: keep the one that can open the file.
      const inboxHrefs = new Set(hits.filter((h) => h.register === "inbox").map((h) => h.href));
      const once = hits.filter((h) => !(h.register === "receipt" && inboxHrefs.has(h.href)));
      once.sort((x, y) => (y.date ?? "").localeCompare(x.date ?? ""));
      const want = Number.isFinite(Number(a.limit)) && Number(a.limit) > 0 ? Math.min(Number(a.limit), LIMIT) : LIMIT;
      const shown = once.slice(0, want);
      const openable = shown.filter((h) => h.open).length;
      const what = [ws.length ? `"${str(a.text)}"` : "", cat ? `in ${cat.replace("_", " ")}` : "", from || to ? `${from || "…"} to ${to || "…"}` : ""].filter(Boolean).join(", ");
      return {
        ok: true,
        summary: once.length === 0 ? `Nothing filed matches ${what}.` : `${once.length} document${once.length === 1 ? "" : "s"} match${once.length === 1 ? "es" : ""} ${what}${once.length > want ? `; showing the newest ${want} of them` : ""}. ${openable} can be opened from here; the rest live on the hub and the row offers to fetch them (about a minute). The person sees each one as a row; do not repeat the list.`,
        data: shown,
        href: shown.length === 1 ? shown[0].href : undefined,
      };
    },
  },
];
