import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { OpenIn, PageSources, SectionTitle } from "@/components/registers";
import { PEOPLE, getActivities, getPlaces, getViewer, type PersonId } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

export default async function Places() {
  const viewer = await getViewer();
  const [places, activities] = await Promise.all([getPlaces(viewer.id as PersonId), Promise.all(PEOPLE.map(async (p) => ({ p, acts: await getActivities(p.id) })))]);
  return (
    <>
      <H1 right={`${viewer.name}'s`}>Schedule and activities</H1>
      <div className="rounded-xl px-4 py-3 bg-soft text-xs text-muted mb-4">Places are learned from your own location records and belong to you; they are never shown to anyone else unless you turn sharing on. Activities and their Always lists are per person.</div>

      <SectionTitle right={`${places.length} learned`}>Places</SectionTitle>
      <Card className="!py-1">
        {[...places].sort((a, b) => b.visits - a.visits).map((pl) => (
          <div key={pl.id} className="py-2 border-b border-line last:border-b-0">
            <div className="font-semibold text-sm">{pl.name} <span className="text-muted font-normal">· {pl.meaning}</span></div>
            <div className="text-xs text-muted">{pl.indoors ? "Indoors" : "Outdoors"} · {pl.usualActivity} · {pl.visits >= 999 ? "home" : `${pl.visits} visits`}</div>
            <div className="flex justify-between items-center gap-2 mt-0.5"><span className="text-xs text-muted truncate">{pl.addedBy}</span><span className="flex gap-3 text-xs font-semibold shrink-0"><a href="#rename" className="text-accent">Rename</a><a href="#merge" className="text-muted">Merge</a><a href="#forget" className="text-muted">Forget</a></span></div>
          </div>
        ))}
      </Card>
      <div className="mt-1.5"><OpenIn label="Maps" href="#maps" /></div>

      {activities.map(({ p, acts }) => acts.length > 0 && (
        <section key={p.id}>
          <SectionTitle right={<Link href={`/family/${p.id}`} className="text-accent font-semibold">{p.name} ›</Link>}>{`${p.name}'s activities`}</SectionTitle>
          <Card className="!py-1">
            {acts.map((a) => (
              <div key={a.name} className="py-2 border-b border-line last:border-b-0">
                <div className="flex justify-between gap-2"><div className="font-semibold text-sm">{a.name}</div><div className="text-xs text-muted">{a.season}</div></div>
                <div className="text-xs text-muted">Always: {a.checklist.join(", ")} · {PEOPLE.find((x) => x.id === a.responsible)?.name} gets them there · <a href="#edit" className="text-accent font-semibold">Edit list ›</a></div>
              </div>
            ))}
          </Card>
        </section>
      ))}

      <SectionTitle>Learning</SectionTitle>
      <Card className="text-sm">
        <div className="flex justify-between items-center min-h-10 border-b border-line"><span>Place learning</span><span className="text-xs text-green font-bold">on</span></div>
        <div className="flex justify-between items-center min-h-10 border-b border-line"><span>Checklist learning</span><span className="text-xs text-green font-bold">on</span></div>
        <div className="flex justify-between items-center min-h-10 border-b border-line"><span>Rule proposals</span><span className="text-xs text-green font-bold">on</span></div>
        <div className="flex justify-between items-center min-h-10 border-b border-line"><span>Questions wait before the weekly review</span><span className="text-xs text-muted">3 days</span></div>
        <div className="flex justify-between items-center min-h-10"><span>Starter checklists</span><span className="text-xs text-muted">sports, school, travel, medical</span></div>
      </Card>
      <p className="text-xs text-muted mt-4">Switches change in Settings (tier 1, with Undo). &quot;Reset learning&quot; asks for confirmation. Last changed: Ryan · from Settings · 2026-10-18.</p>
      <PageSources items={[{ label: "Location history", href: "#location" }, { label: "Maps", href: "#maps" }, { label: "Google Calendar", href: "#gcal" }]} />
    </>
  );
}
