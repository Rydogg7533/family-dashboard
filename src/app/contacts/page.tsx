import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { OpenIn, PageSources } from "@/components/registers";
import { getContacts } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

export default async function Contacts({ searchParams }: PageProps<"/contacts">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const kind = typeof sp.kind === "string" ? sp.kind : "";
  const all = await getContacts();
  const kinds = [...new Set(all.map((c) => c.kind))];
  const rows = all.filter((c) => (!kind || c.kind === kind) && (!q || [c.name, c.kind, c.reach, c.notes ?? "", ...c.registers].join(" ").toLowerCase().includes(q)));
  return (
    <>
      <H1 right={`${all.length} contacts`}>Contacts</H1>
      <form action="/contacts" className="flex gap-2 mb-2">
        <input name="q" defaultValue={q} placeholder="Search name, kind, notes" className="flex-1 min-w-0 min-h-11 px-3 rounded-xl border border-line bg-bg text-sm" aria-label="Search contacts" />
        {kind && <input type="hidden" name="kind" value={kind} />}
        <button className="min-h-11 px-4 rounded-xl bg-accent text-white text-sm font-semibold">Search</button>
      </form>
      <div className="flex gap-1.5 flex-wrap text-xs font-semibold mb-3">
        <Link href={`/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={`px-3 py-1.5 rounded-full ${!kind ? "bg-accent text-white" : "bg-soft"}`}>All</Link>
        {kinds.map((k) => <Link key={k} href={`/contacts?kind=${encodeURIComponent(k)}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`px-3 py-1.5 rounded-full ${kind === k ? "bg-accent text-white" : "bg-soft"}`}>{k}</Link>)}
      </div>
      {rows.length === 0 ? <Card className="text-muted text-sm">No matches.</Card> : (
        <div className="flex flex-col gap-2">
          {rows.map((c) => (
            <Card key={c.id}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0"><div className="font-semibold">{c.name}</div><div className="text-sm">{c.reach}</div></div>
                <span className="text-[11px] font-bold rounded-full px-2.5 py-0.5 bg-soft text-muted whitespace-nowrap">{c.kind}</span>
              </div>
              <div className="text-xs text-muted mt-1">In: {c.registers.join(", ")}{c.notes ? ` · ${c.notes}` : ""}</div>
              <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-3"><span>Added by {c.addedBy}</span><OpenIn label={c.openIn.label} href={c.openIn.href} /></div>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted mt-4">Fed from email signatures, receipts, calendar invites and the phone&apos;s contacts if allowed; each addition confirmed with a tap. Every other module links here, so nothing is typed twice.</p>
      <PageSources items={[{ label: "Apple Contacts", href: "#contacts" }, { label: "Google Contacts", href: "#gcontacts" }, { label: "Gmail", href: "#gmail-1" }]} />
    </>
  );
}
