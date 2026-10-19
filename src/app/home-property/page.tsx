import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { DueChip, OpenIn, PageSources, SectionTitle } from "@/components/registers";
import { daysUntil, fmtDate, getHomeItems } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

export default async function HomeProperty() {
  const items = await getHomeItems();
  const due = items.filter((i) => (daysUntil(i.nextDue) ?? 99) <= 30).sort((a, b) => a.nextDue!.localeCompare(b.nextDue!));
  const systems = [...new Set(items.map((i) => i.system))];
  return (
    <>
      <H1 right="[Home address]">Home and property</H1>

      <SectionTitle right={`${due.length} in the window`}>Due soon</SectionTitle>
      {due.length === 0 ? <Card className="text-muted text-sm">Nothing due in the next 30 days.</Card> : (
        <div className="flex flex-col gap-2">
          {due.slice(0, 5).map((i) => (
            <Card key={i.id} className="flex justify-between items-center gap-2">
              <div className="min-w-0"><div className="text-[11px] font-bold tracking-wide text-muted">{i.system.toUpperCase()}</div><div className="font-semibold truncate">{i.name}</div><div className="text-xs text-muted truncate">{i.company ? `${i.company} · ` : ""}<a href={i.openIn.href} className="text-accent font-semibold">Open task ›</a></div></div>
              <DueChip date={i.nextDue} />
            </Card>
          ))}
          {due.length > 5 && <div className="text-sm font-semibold text-muted px-1">and {due.length - 5} more below</div>}
        </div>
      )}

      {systems.map((sys) => (
        <section key={sys}>
          <SectionTitle>{sys}</SectionTitle>
          <Card className="!py-1">
            {items.filter((i) => i.system === sys).map((i) => (
              <div key={i.id} className="py-2 border-b border-line last:border-b-0">
                <div className="flex justify-between items-center gap-2">
                  <div className="font-semibold text-sm">{i.name}</div>
                  <DueChip date={i.nextDue} />
                </div>
                <div className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-3">
                  {i.installed && <span>Installed {fmtDate(i.installed)}</span>}
                  <span>Last {i.lastService ? fmtDate(i.lastService) : "never recorded"}</span>
                  <span>Next {fmtDate(i.nextDue)}</span>
                  {i.company && <span>{i.company}</span>}
                </div>
                <div className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-3"><span>Added by {i.addedBy}</span><OpenIn label={i.openIn.label} href={i.openIn.href} /></div>
              </div>
            ))}
          </Card>
        </section>
      ))}

      <SectionTitle>Projects and inventory</SectionTitle>
      <Card className="!py-1">
        <a href="#finder-home-projects" className="flex justify-between items-center min-h-11 border-b border-line"><span className="font-semibold text-sm">Projects (quotes, receipts, photos, permits)</span><span className="text-xs text-muted">Organized ›</span></a>
        <Link href="/devices?person=household&all=1" className="flex justify-between items-center min-h-11 border-b border-line"><span className="font-semibold text-sm">Home inventory (valuables)</span><span className="text-xs text-muted">Devices ›</span></Link>
        <a href="#1p-home" className="flex justify-between items-center min-h-11"><span className="font-semibold text-sm">Policy, deed, warranty documents</span><span className="text-xs text-muted">1Password ›</span></a>
      </Card>

      <p className="text-xs text-muted mt-4">One reminder per item at a sensible lead (30 days for policies and taxes, the interval date for maintenance); repeats only if the date passes unrecorded. A service receipt updates the record and sets the next date.</p>
      <PageSources items={[{ label: "Insurer", href: "#insurer" }, { label: "County tax site", href: "#county" }, { label: "Utilities", href: "#utility" }, { label: "Irrigation app", href: "#irrigation" }, { label: "Organized (Home)", href: "#finder-home" }]} />
    </>
  );
}
