import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, H1 } from "@/components/ui";
import { DueChip, OpenIn, PageSources, SectionTitle } from "@/components/registers";
import { PEOPLE, deviceDue, dueText, getActivities, getDevices, getMedications, getOpenItems, getSchedule, getVehicles, getViewer, vehicleStatus, type PersonId } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

const kindLabel = { reply: "REPLY NEEDED", do: "DO", decide: "DECIDE" } as const;

export default async function PersonPage({ params }: PageProps<"/family/[person]">) {
  const { person } = await params;
  const p = PEOPLE.find((x) => x.id === person);
  if (!p) notFound();
  const id = p.id as PersonId;
  const [viewer, schedule, open, activities, devices, vehicles] = await Promise.all([getViewer(), getSchedule(id), getOpenItems(id), getActivities(id), getDevices(), getVehicles()]);
  const own = viewer.id === id;
  const canSeeHealth = own || (p.role === "child" && viewer.role === "parent");
  const meds = canSeeHealth ? await getMedications(id) : [];
  const myDevices = devices.filter((d) => d.person === id && d.status !== "retired");
  const myVehicles = vehicles.filter((v) => v.driver === id);
  const topOpen = open.slice(0, 5);
  const dueMeds = meds.filter((m) => (m.refillDue && new Date(m.refillDue + "T12:00:00").getTime() - Date.now() < 7 * 86_400_000));

  return (
    <>
      <H1 right={<Link href="/family" className="font-semibold text-accent">Family ›</Link>}>{p.name}{own ? " (you)" : ""}</H1>

      <SectionTitle right={`${open.length} open`}>Needs {own ? "you" : p.name}</SectionTitle>
      {topOpen.length === 0 ? <Card className="text-muted text-sm">Nothing open.</Card> : (
        <div className="flex flex-col gap-2">
          {topOpen.map((o) => (
            <Card key={o.id} className="flex justify-between items-center gap-2">
              <div className="min-w-0"><div className={`text-[11px] font-bold tracking-wide ${o.kind === "reply" ? "text-amber" : "text-accent"}`}>{kindLabel[o.kind]}</div><div className="font-semibold truncate">{o.title}</div><div className="text-xs text-muted truncate">{o.who}</div></div>
              {o.due && <DueChip date={o.due} warnDays={7} />}
            </Card>
          ))}
          {open.length > 5 && <Link href="/tasks" className="text-sm font-semibold text-accent px-1">and {open.length - 5} more</Link>}
        </div>
      )}

      <SectionTitle right={<OpenIn label="Google Calendar" href="#gcal" />}>Today</SectionTitle>
      <Card className="!py-1">
        {schedule.map((b, i) => (
          <div key={i} className="flex gap-3 py-2 border-b border-line last:border-b-0">
            <div className="w-12 shrink-0 text-sm font-semibold tabular-nums">{b.time}</div>
            <div className="min-w-0"><div className="font-semibold text-sm">{b.title}</div><div className="text-xs text-muted">{b.place}{b.who ? ` · ${b.who}` : ""}</div></div>
          </div>
        ))}
      </Card>

      <SectionTitle right={<Link href="/places" className="text-accent font-semibold">Edit ›</Link>}>Activities and checklists</SectionTitle>
      {activities.length === 0 ? <Card className="text-muted text-sm">No recurring activities yet.</Card> : (
        <div className="flex flex-col gap-2">
          {activities.map((a) => (
            <Card key={a.name}>
              <div className="flex justify-between gap-2"><div className="font-semibold">{a.name}</div><div className="text-xs text-muted">{a.season}</div></div>
              <div className="text-xs text-muted mt-1">Always: {a.checklist.join(", ")}{a.responsible !== id ? ` · ${PEOPLE.find((x) => x.id === a.responsible)?.name} gets them there` : ""}</div>
            </Card>
          ))}
        </div>
      )}

      {myVehicles.length > 0 && (
        <>
          <SectionTitle right={<Link href="/vehicles" className="text-accent font-semibold">Vehicles ›</Link>}>Vehicle</SectionTitle>
          {myVehicles.map((v) => { const s = vehicleStatus(v); return (
            <Link key={v.id} href="/vehicles" className="card flex justify-between items-center gap-2">
              <div><div className="font-semibold">{v.name}</div><div className="text-xs text-muted">{v.mileage.toLocaleString()} mi{v.mileageEstimated ? " (est.)" : ""}</div></div>
              <span className={`text-xs font-bold text-right shrink-0 max-w-[45%] ${s.state === "ok" ? "text-green" : s.state === "warn" ? "text-amber" : "text-red"}`}>{s.text}</span>
            </Link>
          ); })}
        </>
      )}

      <SectionTitle right={<Link href={`/devices?person=${id}`} className="text-accent font-semibold">Register ›</Link>}>{own ? "My devices" : "Devices"}</SectionTitle>
      <Card className="!py-1">
        {myDevices.length === 0 && <div className="text-sm text-muted py-2">None listed.</div>}
        {myDevices.slice(0, 5).map((d) => { const due = deviceDue(d); return (
          <div key={d.id} className="flex justify-between items-center gap-2 py-2 border-b border-line last:border-b-0">
            <div className="min-w-0"><div className="font-semibold text-sm">{d.name}</div><div className="text-xs text-muted">{d.make} · {d.kind}</div></div>
            {due ? <span className="text-xs font-bold text-amber whitespace-nowrap">{due.label} {dueText(due.date)}</span> : <span className="text-xs text-muted">ok</span>}
          </div>
        ); })}
        {myDevices.length > 5 && <Link href={`/devices?person=${id}&all=1`} className="block text-sm font-semibold text-accent py-2">and {myDevices.length - 5} more</Link>}
      </Card>

      <SectionTitle right={canSeeHealth ? <Link href={`/meds?person=${id}`} className="text-accent font-semibold">Edit ›</Link> : "Private"}>Health and medications</SectionTitle>
      {canSeeHealth ? (
        <Card>
          <div className="text-xs text-muted mb-2">{own ? "Visible only to you. Not shared with other family members, Ask answers for others, or any notification on a shared screen." : `Visible to parents because ${p.name} is a child.`}</div>
          {meds.length === 0 ? <div className="text-sm text-muted">No medications listed.</div> : (
            <div className="flex flex-col">
              {meds.map((m) => (
                <div key={m.id} className="flex justify-between items-center gap-2 py-2 border-b border-line last:border-b-0">
                  <div className="min-w-0"><div className="font-semibold text-sm">{m.name}</div><div className="text-xs text-muted">{m.dose} · {m.times.join(", ")}</div></div>
                  <span className="text-xs text-muted whitespace-nowrap">refill <DueChip date={m.refillDue} warnDays={7} /></span>
                </div>
              ))}
            </div>
          )}
          {dueMeds.length > 0 && <div className="text-xs text-amber font-semibold mt-2">{dueMeds.length} refill{dueMeds.length > 1 ? "s" : ""} due within a week</div>}
          <div className="mt-2 flex gap-3"><OpenIn label="1Password (insurance card)" href="#1p-insurance" /><OpenIn label="patient portal" href="#portal" /></div>
        </Card>
      ) : (
        <Card className="text-sm text-muted">{p.name}&apos;s health section is private to {p.name}. It shows only on their own page unless they turn sharing on in Settings.</Card>
      )}

      <SectionTitle>Documents, people and dates</SectionTitle>
      <Card className="!py-1">
        <Link href="/contacts" className="flex justify-between items-center min-h-11 border-b border-line"><span className="font-semibold text-sm">People and places</span><span className="text-xs text-muted">Contacts ›</span></Link>
        <a href="#1p-ids" className="flex justify-between items-center min-h-11 border-b border-line"><span className="font-semibold text-sm">ID and insurance card</span><span className="text-xs text-muted">1Password ›</span></a>
        <a href="#finder-person" className="flex justify-between items-center min-h-11 border-b border-line"><span className="font-semibold text-sm">Filed paperwork</span><span className="text-xs text-muted">Organized ›</span></a>
        <a href="#gcal" className="flex justify-between items-center min-h-11"><span className="font-semibold text-sm">Birthday and dates</span><span className="text-xs text-muted">[date] · Calendar ›</span></a>
      </Card>

      <PageSources items={[{ label: "Google Calendar", href: "#gcal" }, { label: "1Password", href: "#1password" }, { label: "Organized", href: "#finder-organized" }, { label: "Apple Contacts", href: "#contacts" }]} />
    </>
  );
}
