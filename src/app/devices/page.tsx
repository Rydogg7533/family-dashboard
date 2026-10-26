import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { DueChip, PageSources, SectionTitle } from "@/components/registers";
import { deviceDue, fmtDate, getDevices, getPeople, personName, type Device, type PersonId } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

// A row is the summary; the whole record is one tap away. Nothing here is hidden from another member:
// every parent sees every device, whoever it belongs to.
function DeviceRow({ d }: { d: Device }) {
  const due = deviceDue(d);
  return (
    <Link href={`/devices/${d.id}`} className="flex justify-between items-start gap-2 py-2.5 border-b border-line last:border-b-0 hover:bg-soft -mx-1 px-1 rounded-lg">
      <div className="min-w-0">
        <div className="font-semibold text-sm truncate">{d.name}{d.make ? <span className="text-muted font-normal"> · {d.make}</span> : null}</div>
        <div className="text-xs text-muted truncate">{d.kind} · {d.status}{d.serialLast4 ? ` · serial ····${d.serialLast4}` : ""}</div>
        {(d.warrantyEnd || (d.planName && d.planEnd)) && (
          <div className="text-xs text-muted truncate">{d.warrantyEnd ? `Warranty ${fmtDate(d.warrantyEnd)}` : ""}{d.warrantyEnd && d.planName && d.planEnd ? " · " : ""}{d.planName && d.planEnd ? `${d.planName} ${fmtDate(d.planEnd)}` : ""}</div>
        )}
      </div>
      {due ? <DueChip date={due.date} /> : <span className="text-muted text-sm shrink-0">›</span>}
    </Link>
  );
}

export default async function Devices({ searchParams }: PageProps<"/devices">) {
  const sp = await searchParams;
  const history = sp.all === "1";   // ?all=1 now means "show the retired ones too"; the register itself is always open
  const person = typeof sp.person === "string" ? sp.person : null;
  const [devices, people] = await Promise.all([getDevices(), getPeople()]);
  const owners: (PersonId | "household")[] = [...people.map((p) => p.id), "household"];
  const surfaced = devices.map((d) => ({ d, due: deviceDue(d) })).filter((x) => x.due).sort((a, b) => a.due!.date.localeCompare(b.due!.date));
  const shown = person ? devices.filter((d) => d.person === person) : devices;
  const active = shown.filter((d) => d.status !== "retired");
  const retired = shown.filter((d) => d.status === "retired");
  const groups = owners.map((o) => ({ o, rows: active.filter((d) => d.person === o) })).filter((g) => g.rows.length > 0);
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full ${on ? "bg-accent text-white" : "bg-soft"}`;
  const q = (p: string | null) => `/devices${p ? `?person=${p}` : ""}${history ? (p ? "&all=1" : "?all=1") : ""}`;

  return (
    <>
      <H1 right={`${devices.length} item${devices.length === 1 ? "" : "s"}`}>Devices and belongings</H1>
      <Link href="/devices/new" className="min-h-11 rounded-xl bg-accent text-white font-semibold inline-flex items-center justify-center px-4 mb-2 w-full">Add a device</Link>

      {surfaced.length > 0 && (
        <>
          <SectionTitle right={`${surfaced.length} due`}>Needs a decision</SectionTitle>
          <div className="flex flex-col gap-2">
            {surfaced.slice(0, 5).map(({ d, due }) => (
              <Card key={d.id} className="flex justify-between items-center gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold tracking-wide text-muted">{personName(d.person).toUpperCase()}</div>
                  <div className="font-semibold truncate">{d.name}: {due!.label.toLowerCase()}</div>
                  <Link href={`/devices/${d.id}`} className="text-xs font-semibold text-accent">Decide: extend or let lapse ›</Link>
                </div>
                <DueChip date={due!.date} />
              </Card>
            ))}
            {surfaced.length > 5 && <div className="text-sm font-semibold text-muted px-1">and {surfaced.length - 5} more</div>}
          </div>
        </>
      )}

      <div className="flex gap-1.5 flex-wrap text-xs font-semibold mt-6 mb-1">
        <Link href={q(null)} className={chip(!person)}>Everyone</Link>
        {owners.map((o) => <Link key={o} href={q(o)} className={chip(person === o)}>{personName(o)}</Link>)}
      </div>

      {active.length === 0 ? (
        <Card className="text-sm text-muted">{person ? `Nothing listed for ${personName(person as PersonId)} yet.` : "Nothing in the register yet. Add the first with the button above."}</Card>
      ) : person ? (
        <Card className="!py-1">{active.map((d) => <DeviceRow key={d.id} d={d} />)}</Card>
      ) : (
        groups.map(({ o, rows }) => (
          <section key={o}>
            <SectionTitle right={`${rows.length}`}>{personName(o)}</SectionTitle>
            <Card className="!py-1">{rows.map((d) => <DeviceRow key={d.id} d={d} />)}</Card>
          </section>
        ))
      )}

      {retired.length > 0 && (history ? (
        <section>
          <SectionTitle right={`${retired.length}`}>History (retired or sold)</SectionTitle>
          <Card className="!py-1">{retired.map((d) => <DeviceRow key={d.id} d={d} />)}</Card>
          <Link href={`/devices${person ? `?person=${person}` : ""}`} className="block text-sm font-semibold text-accent mt-2 px-1">Hide history</Link>
        </section>
      ) : (
        <Link href={`/devices?${person ? `person=${person}&` : ""}all=1`} className="block text-sm font-semibold text-accent mt-3 px-1">History: {retired.length} retired or sold ›</Link>
      ))}

      <p className="text-xs text-muted mt-4">Everyone in the household sees every device. Serials and IMEIs: last digits only, with a pointer to the vault. Retire or Sold moves an item to history; nothing is deleted. People: {people.map((p) => p.name).join(", ")} and the household.</p>
      <PageSources items={[{ label: "Find My", href: "#findmy" }, { label: "AppleCare", href: "#applecare" }, { label: "Carrier", href: "#carrier" }, { label: "1Password", href: "#1password" }, { label: "Receipts (Organized)", href: "#finder-devices" }]} />
    </>
  );
}
