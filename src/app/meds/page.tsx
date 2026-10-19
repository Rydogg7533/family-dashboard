import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { DueChip, OpenIn, PageSources, SectionTitle } from "@/components/registers";
import { PEOPLE, daysUntil, fmtDate, getMedications, getViewer, type PersonId } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

export default async function Meds({ searchParams }: PageProps<"/meds">) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const allowed = PEOPLE.filter((p) => p.id === viewer.id || (p.role === "child" && viewer.role === "parent"));
  const requested = typeof sp.person === "string" ? sp.person : viewer.id;
  const person = allowed.find((p) => p.id === requested) ?? allowed[0];
  const meds = await getMedications(person.id as PersonId);
  const refills = meds.filter((m) => (daysUntil(m.refillDue) ?? 99) <= 7).sort((a, b) => a.refillDue.localeCompare(b.refillDue));
  const own = person.id === viewer.id;

  return (
    <>
      <H1 right={<Link href={`/family/${person.id}`} className="font-semibold text-accent">{person.name} ›</Link>}>Health and medications</H1>
      <div className="flex gap-1.5 flex-wrap text-xs font-semibold mb-3">
        {allowed.map((p) => <Link key={p.id} href={`/meds?person=${p.id}`} className={`px-3 py-1.5 rounded-full ${person.id === p.id ? "bg-accent text-white" : "bg-soft"}`}>{p.name}</Link>)}
      </div>
      <div className="rounded-xl px-4 py-3 bg-soft text-xs text-muted mb-4">
        {own ? "Private to you. Not shown to other family members, not used in Ask answers for others, and never in a notification on a shared screen (it says only \"Health reminder\")." : `${person.name}'s section, visible to parents. Reminders go to the parent on duty.`} Nothing here is diagnosed or interpreted; it records what you or your doctor stated.
      </div>

      <SectionTitle right={`${refills.length} within a week`}>Refills due</SectionTitle>
      {refills.length === 0 ? <Card className="text-muted text-sm">No refills due in the next 7 days.</Card> : (
        <div className="flex flex-col gap-2">
          {refills.slice(0, 5).map((m) => (
            <Card key={m.id} className="flex justify-between items-center gap-2">
              <div className="min-w-0"><div className="font-semibold truncate">{m.name}</div><div className="text-xs text-muted">{m.refillsRemaining} refill{m.refillsRemaining === 1 ? "" : "s"} left · <a href={m.pharmacyHref} className="text-accent font-semibold">Request refill at {m.pharmacy} ›</a></div></div>
              <DueChip date={m.refillDue} warnDays={7} />
            </Card>
          ))}
        </div>
      )}

      <SectionTitle right={<a href="#add-by-photo" className="text-accent font-semibold">Add by photo ›</a>}>Medications and supplements</SectionTitle>
      {meds.length === 0 ? <Card className="text-muted text-sm">None listed. Add one by photographing the label.</Card> : (
        <div className="flex flex-col gap-2">
          {meds.map((m) => (
            <Card key={m.id}>
              <div className="flex justify-between items-start gap-2">
                <div><div className="font-semibold">{m.name} <span className="text-muted font-normal text-sm">{m.strength}</span></div><div className="text-sm">{m.dose} · {m.times.join(" and ")}</div></div>
                <span className={`text-[11px] font-bold rounded-full px-2.5 py-0.5 ${m.reminders ? "bg-green-bg text-green" : "bg-soft text-muted"}`}>{m.reminders ? "reminders on" : "no reminders"}</span>
              </div>
              {m.instructions && <div className="text-sm text-muted mt-1">{m.instructions}</div>}
              <dl className="text-xs text-muted mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt>Doctor</dt><dd>{m.doctor}</dd>
                <dt>Pharmacy</dt><dd><a href={m.pharmacyHref} className="text-accent font-semibold">{m.pharmacy} ›</a></dd>
                <dt>Refill</dt><dd>{fmtDate(m.refillDue)} · {m.refillsRemaining} left</dd>
                <dt>Rx number</dt><dd>{m.prescriptionPointer}</dd>
                <dt>Added by</dt><dd>{m.addedBy}</dd>
              </dl>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 items-center">
                <a href="#edit" className="text-xs font-semibold text-accent">Edit ›</a>
                <a href="#finished" className="text-xs font-semibold text-muted">Mark finished</a>
                <OpenIn label="pharmacy app" href={m.pharmacyHref} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>Gentle reminders</SectionTitle>
      <Card className="text-sm">
        <div className="flex justify-between items-center min-h-10 border-b border-line"><span>Dose reminders</span><span className="text-muted text-xs">at the set times · one tap taken or skip</span></div>
        <div className="flex justify-between items-center min-h-10 border-b border-line"><span>Missed dose</span><span className="text-muted text-xs">noted once, never nagged</span></div>
        <div className="flex justify-between items-center min-h-10 border-b border-line"><span>Refill reminder</span><span className="text-muted text-xs">7 days before run-out</span></div>
        <div className="flex justify-between items-center min-h-10"><span>Quiet hours</span><span className="text-muted text-xs">9:00 pm to 7:00 am · <Link href="/settings/notifications" className="text-accent font-semibold">change</Link></span></div>
      </Card>

      <SectionTitle>Records and providers</SectionTitle>
      <Card className="!py-1">
        <a href="#1p-insurance" className="flex justify-between items-center min-h-11 border-b border-line"><span className="font-semibold text-sm">Insurance card</span><span className="text-xs text-muted">1Password ›</span></a>
        <a href="#finder-health" className="flex justify-between items-center min-h-11 border-b border-line"><span className="font-semibold text-sm">Immunizations, after-visit summaries</span><span className="text-xs text-muted">Organized ›</span></a>
        <Link href="/contacts" className="flex justify-between items-center min-h-11 border-b border-line"><span className="font-semibold text-sm">Doctors and dentist</span><span className="text-xs text-muted">Contacts ›</span></Link>
        <a href="#emergency-card" className="flex justify-between items-center min-h-11"><span className="font-semibold text-sm">Emergency card</span><span className="text-xs text-muted">show at a counter ›</span></a>
      </Card>

      <p className="text-xs text-muted mt-4">Sample content with placeholder names. Health data is excluded from any AI call unless you turn that on for yourself in Settings.</p>
      <PageSources items={[{ label: "Pharmacy", href: "#pharmacy" }, { label: "Patient portal", href: "#portal" }, { label: "1Password", href: "#1password" }, { label: "Organized (Health)", href: "#finder-health" }]} />
    </>
  );
}
