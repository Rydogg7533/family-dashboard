import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { DueChip, PageSources, SectionTitle } from "@/components/registers";
import { EMERGENCY, daysUntil, fmtDate, getViewer } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

export default async function Emergency() {
  const viewer = await getViewer();
  if (viewer.role !== "parent") return (<><H1>Emergency plan</H1><Card className="text-muted text-sm">Parents only.</Card></>);
  const reviewDue = (iso: string) => new Date(new Date(iso + "T12:00:00").getTime() + 365 * 86_400_000).toISOString().slice(0, 10);
  const stale = EMERGENCY.flatMap((s) => s.items.filter((i) => (daysUntil(reviewDue(i.lastReviewed)) ?? 99) <= 30).map((i) => ({ ...i, section: s.title })));
  return (
    <>
      <H1 right="Parents only">Emergency plan</H1>
      <div className="rounded-xl px-4 py-3 bg-soft text-xs text-muted mb-4">The index for a bad day: if one parent is unavailable, what the other needs and where it is. Everything here is a pointer; nothing sensitive is stored. Yearly review; each item shows when it was last reviewed. Viewing is logged.</div>

      <SectionTitle right={`${stale.length} stale`}>Needs review</SectionTitle>
      {stale.length === 0 ? <Card className="text-muted text-sm">Everything reviewed within the year.</Card> : (
        <div className="flex flex-col gap-2">
          {stale.slice(0, 5).map((i) => (
            <Card key={i.section + i.name} className="flex justify-between items-center gap-2">
              <div className="min-w-0"><div className="text-[11px] font-bold tracking-wide text-muted">{i.section.toUpperCase()}</div><div className="font-semibold truncate">{i.name}</div><div className="text-xs text-muted">last reviewed {fmtDate(i.lastReviewed)} · <a href="#reviewed" className="text-accent font-semibold">Mark reviewed ›</a></div></div>
              <DueChip date={reviewDue(i.lastReviewed)} />
            </Card>
          ))}
          {stale.length > 5 && <div className="text-sm font-semibold text-muted px-1">and {stale.length - 5} more below</div>}
        </div>
      )}

      {EMERGENCY.map((s, n) => (
        <section key={s.title}>
          <SectionTitle>{`${n + 1}. ${s.title}`}</SectionTitle>
          <Card className="!py-1">
            {s.items.map((i) => (
              <div key={i.name} className="flex justify-between items-center gap-2 py-2 border-b border-line last:border-b-0">
                <div className="min-w-0"><div className="font-semibold text-sm">{i.name}</div><div className="text-xs text-muted truncate">{i.pointer.startsWith("/") ? <Link href={i.pointer} className="text-accent font-semibold">{i.pointer} ›</Link> : i.pointer} · reviewed {fmtDate(i.lastReviewed)}</div></div>
                <DueChip date={reviewDue(i.lastReviewed)} />
              </div>
            ))}
          </Card>
        </section>
      ))}

      <p className="text-xs text-muted mt-4">Maintained by Ryan and Melissa (last change: Ryan · from Settings · 2026-10-18). A sealed, time-limited link for a designated person outside the household can be issued only by a parent, and that access is logged.</p>
      <PageSources items={[{ label: "1Password", href: "#1password" }, { label: "Apple Passwords", href: "#apple-passwords" }, { label: "Organized (Family)", href: "#finder-family" }, { label: "Contacts", href: "/contacts" }]} />
    </>
  );
}
