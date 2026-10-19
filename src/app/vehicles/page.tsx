import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { DueChip, KV, OpenIn, PageSources, SectionTitle } from "@/components/registers";
import { daysUntil, fmtDate, getVehicles, getViewer, personName, vehicleStatus } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

export default async function Vehicles() {
  const [vehicles, viewer] = await Promise.all([getVehicles(), getViewer()]);
  const needs = vehicles.flatMap((v) => [
    ...v.expiries.filter((e) => (daysUntil(e.date) ?? 99) <= 30).map((e) => ({ v, label: e.label, date: e.date, action: e.action, href: e.href, source: e.source })),
    ...v.maintenance.filter((m) => m.dueDate && (daysUntil(m.dueDate) ?? 99) <= 30).map((m) => ({ v, label: m.item, date: m.dueDate!, action: "Book service", href: "#shop", source: "Shop booking" })),
  ]).sort((a, b) => a.date.localeCompare(b.date));
  const top = needs.slice(0, 5);

  return (
    <>
      <H1 right={`${vehicles.length} vehicles`}>Vehicles</H1>

      <SectionTitle right={`${needs.length} in the window`}>Needs attention</SectionTitle>
      {top.length === 0 ? <Card className="text-muted text-sm">Nothing due in the next 30 days.</Card> : (
        <div className="flex flex-col gap-2">
          {top.map((n, i) => (
            <Card key={i} className="flex justify-between items-center gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-bold tracking-wide text-muted">{n.v.short.toUpperCase()} · {personName(n.v.driver).toUpperCase()}</div>
                <div className="font-semibold truncate">{n.label}</div>
                <a href={n.href} className="text-xs font-semibold text-accent">{n.action} · opens {n.source} ›</a>
              </div>
              <DueChip date={n.date} />
            </Card>
          ))}
          {needs.length > 5 && <div className="text-sm font-semibold text-muted px-1">and {needs.length - 5} more below</div>}
        </div>
      )}

      {vehicles.map((v) => {
        const s = vehicleStatus(v);
        const mine = v.driver === viewer.id;
        return (
          <section key={v.id} id={v.id} className="mt-6">
            <Card>
              <div className="font-bold text-lg display">{v.name}</div>
              <div className={`text-sm font-bold ${s.state === "ok" ? "text-green" : s.state === "warn" ? "text-amber" : "text-red"}`}>{s.text}</div>
              <div className="text-xs text-muted mt-1">Driver: {personName(v.driver)}{mine ? " (you)" : ""} · Plate {v.plate} · Added by {v.addedBy}</div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-soft px-3 py-2">
                <div><div className="font-semibold tabular-nums">{v.mileage.toLocaleString()} mi{v.mileageEstimated ? <span className="text-xs text-muted font-normal"> (estimate)</span> : null}</div><div className="text-xs text-muted">as of {fmtDate(v.mileageAt)}</div></div>
                {mine ? <a href="#update-mileage" className="min-h-10 px-3 rounded-xl border border-line text-xs font-semibold inline-flex items-center">Update mileage</a> : <a href="#take-over" className="min-h-10 px-3 rounded-xl border border-line text-xs font-semibold inline-flex items-center">I&apos;ll handle this</a>}
              </div>
            </Card>

            <SectionTitle>Dates and expiries</SectionTitle>
            <Card className="!py-1">
              {v.expiries.map((e) => (
                <div key={e.label} className="flex justify-between items-center gap-2 py-2 border-b border-line last:border-b-0">
                  <div className="min-w-0"><div className="font-semibold text-sm">{e.label}</div><div className="text-xs text-muted">{fmtDate(e.date)} · <a href={e.href} className="text-accent font-semibold">{e.action} in {e.source} ›</a></div></div>
                  <DueChip date={e.date} />
                </div>
              ))}
            </Card>

            <SectionTitle right={<OpenIn label="shop booking" href="#shop" />}>Maintenance</SectionTitle>
            <Card className="!py-1">
              {v.maintenance.map((m) => (
                <div key={m.item} className="flex justify-between items-center gap-2 py-2 border-b border-line last:border-b-0">
                  <div className="min-w-0"><div className="font-semibold text-sm">{m.item}</div><div className="text-xs text-muted">{m.dueDate ? `by ${fmtDate(m.dueDate)}` : ""}{m.dueDate && m.dueMiles ? " or " : ""}{m.dueMiles ? `at ${m.dueMiles.toLocaleString()} mi` : ""}{m.lastDone ? ` · last ${fmtDate(m.lastDone)}` : " · never recorded"}</div></div>
                  {m.dueDate ? <DueChip date={m.dueDate} /> : m.dueMiles && m.dueMiles - v.mileage <= 500 ? <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-amber-bg text-amber">{(m.dueMiles - v.mileage).toLocaleString()} mi left</span> : <span className="text-xs text-muted whitespace-nowrap">{m.dueMiles ? `${(m.dueMiles - v.mileage).toLocaleString()} mi left` : ""}</span>}
                </div>
              ))}
            </Card>

            <SectionTitle>Documents</SectionTitle>
            <Card className="!py-1">
              {v.documents.map((d) => (
                <a key={d.name} href={d.href} className="flex justify-between items-center min-h-11 py-1 border-b border-line last:border-b-0">
                  <span className="font-semibold text-sm">{d.name}</span>
                  <span className="text-xs text-muted">{d.vault} ›</span>
                </a>
              ))}
              <div className="text-xs text-muted py-2">Links only; nothing is stored here. Items open behind {personName(v.driver)}&apos;s unlock.</div>
            </Card>

            <SectionTitle>Reminders</SectionTitle>
            <Card>
              <KV rows={v.reminders.map((r) => [r.item, r.lead] as [string, string])} />
              <div className="text-xs text-muted mt-2">Reminders go to {personName(v.driver)}; the other parent can take one over with one tap. A reminder repeats only if the date passes unrecorded, then weekly.</div>
            </Card>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {v.links.map((l) => <OpenIn key={l.label} label={l.label} href={l.href} />)}
              <OpenIn label="Organized (Vehicles folder)" href="#finder-vehicles" />
            </div>
          </section>
        );
      })}

      <p className="text-xs text-muted mt-6">Add a vehicle, change the driver or mark one sold in <Link href="/settings" className="text-accent font-semibold">Settings</Link> (history kept, never deleted). Costs appear on Money; expiry dates on Calendar.</p>
      <PageSources items={[{ label: "Utah DMV", href: "#utah-dmv" }, { label: "Insurer", href: "#insurer" }, { label: "1Password", href: "#1password" }, { label: "Organized", href: "#finder-vehicles" }, { label: "NHTSA recalls", href: "#nhtsa" }]} />
    </>
  );
}
