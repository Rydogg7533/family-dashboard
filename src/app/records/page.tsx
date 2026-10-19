import Link from "next/link";
import { H1 } from "@/components/ui";
import { Section, OpenIn, SyncLine } from "@/components/money";
import { getRecords, RECORD_KIND_LABEL, type RecordKind, shortDate, daysUntil, hoursAgo } from "@/lib/data-money";

export const dynamic = "force-dynamic";

export default async function Records({ searchParams }: PageProps<"/records">) {
  const sp = await searchParams;
  const kind = typeof sp.kind === "string" ? (sp.kind as RecordKind) : null;
  const status = typeof sp.status === "string" ? sp.status : "open";
  const q = typeof sp.q === "string" ? sp.q.toLowerCase() : "";
  const tax = typeof sp.tax === "string" ? Number(sp.tax) : null;
  const all = await getRecords();
  const rows = all.filter((r) => (!kind || r.kind === kind) && (status === "all" || (status === "open" ? r.status !== "archived" : r.status === status)) && (!tax || r.tax_year === tax) && (!q || `${r.title} ${r.confirmation_number ?? ""} ${r.for_person ?? ""}`.toLowerCase().includes(q)));
  const soon = all.filter((r) => r.status === "needed_soon");
  const link = (p: Record<string, string | null>) => { const u = new URLSearchParams(); const merged = { kind, status, q, tax: tax ? String(tax) : null, ...p }; for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v); return `/records?${u}`; };
  const kinds = Object.keys(RECORD_KIND_LABEL) as RecordKind[];

  return (
    <>
      <H1>Records</H1>
      <p className="text-xs text-muted mb-3"><SyncLine at={hoursAgo(3)} label="Records folder" /><br />Every confirmation, ticket, claim, warranty, appointment and contract, kept until it is no longer needed, then archived. Files live in Organized/Personal/Documents/Records; only the reference is here.</p>

      {!q && !kind && status === "open" && !tax && (
        <Section title="Needed soon" right={`${soon.length}`}>
          {soon.length === 0 ? <div className="card text-muted text-sm">Nothing coming up.</div> : <div className="flex flex-col gap-2">{soon.map((r) => <Row key={r.id} r={r} />)}</div>}
        </Section>
      )}

      <form className="flex gap-2 mb-2">
        {kind && <input type="hidden" name="kind" value={kind} />}
        <input type="hidden" name="status" value={status} />
        <input name="q" defaultValue={q} placeholder="Search title, number, person…" className="flex-1 min-h-11 rounded-full border border-line bg-bg px-4 text-sm" />
        <button className="min-h-11 px-4 rounded-full bg-soft text-sm font-semibold">Search</button>
      </form>
      <div className="flex gap-1.5 flex-wrap text-xs font-semibold mb-2">
        {[["open", "Needed soon + active"], ["needed_soon", "Needed soon"], ["active", "Active"], ["archived", "Archived"], ["all", "All"]].map(([v, l]) => <Link key={v} href={link({ status: v })} className={`px-3 py-1.5 rounded-full ${status === v ? "bg-accent text-white" : "bg-soft"}`}>{l}</Link>)}
      </div>
      <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-2 mb-2 text-xs font-semibold [scrollbar-width:none]">
        <Link href={link({ kind: null })} className={`shrink-0 px-3 py-1.5 rounded-full ${!kind ? "bg-accent text-white" : "bg-soft"}`}>All kinds</Link>
        {kinds.map((k) => <Link key={k} href={link({ kind: k })} className={`shrink-0 px-3 py-1.5 rounded-full whitespace-nowrap ${kind === k ? "bg-accent text-white" : "bg-soft"}`}>{RECORD_KIND_LABEL[k]}</Link>)}
      </div>
      {tax && <div className="text-xs mb-2">Showing <span className="font-semibold">Tax {tax}</span> items · <Link href={link({ tax: null })} className="font-semibold text-accent">clear</Link></div>}

      <Section title={q ? `Results for "${q}"` : "Register"} right={`${rows.length}`}>
        {rows.length === 0 ? <div className="card text-muted text-sm">Nothing matches.</div> : <div className="flex flex-col gap-2">{rows.map((r) => <Row key={r.id} r={r} />)}</div>}
      </Section>
      <p className="text-[11px] text-muted">Nothing is deleted. After its needed-until date a record archives itself. Tax-tagged items feed <Link href="/money" className="font-semibold text-accent">Money › Reports and tax</Link>.</p>
    </>
  );
}

function Row({ r }: { r: Awaited<ReturnType<typeof getRecords>>[number] }) {
  const days = r.needed_until ? daysUntil(r.needed_until) : null;
  return (
    <Link href={`/records/${r.id}`} className="card flex flex-col gap-0.5">
      <div className="flex justify-between gap-2">
        <div className="text-[11px] font-bold tracking-wide text-accent">{RECORD_KIND_LABEL[r.kind].toUpperCase()}</div>
        <div className="flex gap-1">
          {r.tax_year && <span className="text-[11px] font-bold px-2 rounded-full bg-soft">Tax {r.tax_year}</span>}
          <span className={`text-[11px] font-bold px-2 rounded-full ${r.status === "needed_soon" ? "bg-amber-bg text-amber" : r.status === "archived" ? "bg-soft text-muted" : "bg-green-bg text-green"}`}>{r.status.replace("_", " ")}</span>
        </div>
      </div>
      <div className="font-semibold text-sm">{r.title}{r.confirmation_number ? <span className="text-muted font-normal"> · {r.confirmation_number}</span> : ""}</div>
      <div className="text-xs text-muted">{r.happens_at ? `${shortDate(r.happens_at)} · ` : ""}{days !== null ? (days < 0 ? "archived" : days === 0 ? "needed today" : `needed until ${shortDate(r.needed_until!)}`) : r.retention_rule}</div>
      <div className="text-[11px] text-muted">For {r.for_person ?? "Family"} · {r.requested_by} · <OpenIn label={r.source_name} href={r.source_href} /></div>
    </Link>
  );
}
