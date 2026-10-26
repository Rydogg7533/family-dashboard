import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { DueChip, OpenIn, PageSources, SectionTitle } from "@/components/registers";
import { deviceDue, fmtDate, getDevices, getPeople, personName, type Device, type PersonId } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

function DeviceRow({ d }: { d: Device }) {
  const due = deviceDue(d);
  return (
    <div className="py-2 border-b border-line last:border-b-0">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{d.name}{d.make ? <span className="text-muted font-normal"> · {d.make}</span> : null}</div>
          <div className="text-xs text-muted">{d.kind} · {d.status}{d.serialLast4 ? ` · serial ····${d.serialLast4}` : ""}{d.subscription ? ` · ${d.subscription}` : ""}</div>
          {d.note && <div className="text-xs text-muted">{d.note}</div>}
        </div>
        {due ? <DueChip date={due.date} /> : null}
      </div>
      <div className="text-xs text-muted mt-1 flex flex-wrap gap-x-3">
        {d.warrantyEnd && <span>Warranty {fmtDate(d.warrantyEnd)}</span>}
        {d.planName && d.planEnd && <span>{d.planName} {fmtDate(d.planEnd)}</span>}
        {d.serialPointer && <span>Full serial: {d.serialPointer}</span>}
        <span>Added by {d.addedBy}</span>
        <OpenIn label={d.openIn.label} href={d.openIn.href} />
      </div>
    </div>
  );
}

export default async function Devices({ searchParams }: PageProps<"/devices">) {
  const sp = await searchParams;
  const all = sp.all === "1";
  const person = typeof sp.person === "string" ? sp.person : null;
  const [devices, people] = await Promise.all([getDevices(), getPeople()]);
  const owners: (PersonId | "household")[] = [...people.map((p) => p.id), "household"];
  const surfaced = devices.map((d) => ({ d, due: deviceDue(d) })).filter((x) => x.due).sort((a, b) => a.due!.date.localeCompare(b.due!.date));
  const shown = person ? devices.filter((d) => d.person === person) : devices;
  const active = shown.filter((d) => d.status !== "retired");
  const retired = shown.filter((d) => d.status === "retired");

  return (
    <>
      <H1 right={`${devices.length} items`}>Devices and belongings</H1>
      <Link href="/devices/new" className="min-h-11 rounded-xl bg-accent text-white font-semibold inline-flex items-center justify-center px-4 mb-2 w-full">Add a device</Link>

      <SectionTitle right={`${surfaced.length} due`}>Needs a decision</SectionTitle>
      {surfaced.length === 0 ? <Card className="text-muted text-sm">Nothing due. The full register is below.</Card> : (
        <div className="flex flex-col gap-2">
          {surfaced.slice(0, 5).map(({ d, due }) => (
            <Card key={d.id} className="flex justify-between items-center gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-bold tracking-wide text-muted">{personName(d.person).toUpperCase()}</div>
                <div className="font-semibold truncate">{d.name}: {due!.label.toLowerCase()}</div>
                <a href="#decide" className="text-xs font-semibold text-accent">Decide: extend or let lapse ›</a>
              </div>
              <DueChip date={due!.date} />
            </Card>
          ))}
          {surfaced.length > 5 && <div className="text-sm font-semibold text-muted px-1">and {surfaced.length - 5} more</div>}
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap text-xs font-semibold mt-6 mb-1">
        <Link href={`/devices${all ? "?all=1" : ""}`} className={`px-3 py-1.5 rounded-full ${!person ? "bg-accent text-white" : "bg-soft"}`}>Everyone</Link>
        {owners.map((o) => <Link key={o} href={`/devices?person=${o}${all ? "&all=1" : ""}`} className={`px-3 py-1.5 rounded-full ${person === o ? "bg-accent text-white" : "bg-soft"}`}>{personName(o)}</Link>)}
      </div>

      {all ? (
        <>
          {owners.filter((o) => !person || o === person).map((o) => {
            const rows = active.filter((d) => d.person === o);
            if (!rows.length) return null;
            return (
              <section key={o}>
                <SectionTitle right={`${rows.length}`}>{personName(o)}</SectionTitle>
                <Card className="!py-1">{rows.map((d) => <DeviceRow key={d.id} d={d} />)}</Card>
              </section>
            );
          })}
          {retired.length > 0 && (
            <section>
              <SectionTitle>History (retired or sold)</SectionTitle>
              <Card className="!py-1">{retired.map((d) => <DeviceRow key={d.id} d={d} />)}</Card>
            </section>
          )}
          <Link href={`/devices${person ? `?person=${person}` : ""}`} className="block text-sm font-semibold text-accent mt-3 px-1">Hide the full list</Link>
        </>
      ) : (
        <Card className="flex justify-between items-center gap-2 mt-2">
          <div className="text-sm text-muted">{active.length} in use{retired.length ? `, ${retired.length} retired` : ""}{person ? ` for ${personName(person as PersonId)}` : ""}.</div>
          <Link href={`/devices?${person ? `person=${person}&` : ""}all=1`} className="min-h-10 px-3.5 rounded-xl border border-line text-sm font-semibold inline-flex items-center whitespace-nowrap">Show all</Link>
        </Card>
      )}

      <p className="text-xs text-muted mt-4">Serials and IMEIs: last digits only, with a pointer to the vault. Retire or Sold moves an item to history; nothing is deleted. People: {people.map((p) => p.name).join(", ")} and the household.</p>
      <PageSources items={[{ label: "Find My", href: "#findmy" }, { label: "AppleCare", href: "#applecare" }, { label: "Carrier", href: "#carrier" }, { label: "1Password", href: "#1password" }, { label: "Receipts (Organized)", href: "#finder-devices" }]} />
    </>
  );
}
