import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, H1 } from "@/components/ui";
import { DueChip, OpenIn, PageSources, SectionTitle } from "@/components/registers";
import { DeviceStatus } from "@/components/DeviceStatus";
import { deviceDue, fmtDate, getDevice, personName } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-line last:border-b-0">
      <span className="text-sm text-muted shrink-0">{label}</span>
      <span className="text-sm font-semibold text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

export default async function DeviceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getDevice(id);
  if (!d) notFound();
  const due = deviceDue(d);

  return (
    <>
      <H1 right={<Link href={`/devices/${d.id}/edit`} className="font-semibold text-accent">Edit</Link>}>{d.name}</H1>

      {due && (
        <Card className="mb-3 flex justify-between items-center gap-2 border-amber">
          <div className="min-w-0"><div className="font-semibold truncate">{due.label}</div><div className="text-xs text-muted">Extend it or let it lapse.</div></div>
          <DueChip date={due.date} />
        </Card>
      )}

      <SectionTitle>The device</SectionTitle>
      <Card className="!py-1">
        <Line label="Kind">{d.kind}</Line>
        {d.make && <Line label="Make and model">{d.make}</Line>}
        <Line label="Whose">{personName(d.person)}</Line>
        <Line label="Status">{d.status}</Line>
        {d.note && <Line label="Note">{d.note}</Line>}
      </Card>

      <SectionTitle>Serial</SectionTitle>
      <Card className="!py-1">
        <Line label="Last 4">{d.serialLast4 ? `····${d.serialLast4}` : <span className="text-muted font-normal">Not recorded</span>}</Line>
        <Line label="Full serial">{d.serialPointer ? d.serialPointer : <span className="text-muted font-normal">No pointer to the vault</span>}</Line>
      </Card>

      <SectionTitle>Cover and plan</SectionTitle>
      <Card className="!py-1">
        <Line label="Warranty ends">{d.warrantyEnd ? fmtDate(d.warrantyEnd) : <span className="text-muted font-normal">Not recorded</span>}</Line>
        <Line label="Protection plan">{d.planName ? d.planName : <span className="text-muted font-normal">None recorded</span>}</Line>
        {d.planEnd && <Line label="Plan ends">{fmtDate(d.planEnd)}</Line>}
        <Line label="Subscription or line">{d.subscription ? d.subscription : <span className="text-muted font-normal">None recorded</span>}</Line>
      </Card>

      <SectionTitle>Record</SectionTitle>
      <Card className="!py-1">
        <Line label="Added by">{d.addedBy || "—"}</Line>
        <Line label="Open in"><OpenIn label={d.openIn.label} href={d.openIn.href} /></Line>
      </Card>

      <DeviceStatus id={d.id} status={d.status} name={d.name} />

      <Link href="/devices" className="block text-sm font-semibold text-accent mt-4 px-1">‹ All devices</Link>
      <p className="text-xs text-muted mt-3">Everyone in the household sees this. Nothing here is ever deleted: Retire or Sold moves it to history and keeps the record.</p>
      <PageSources items={[{ label: "Find My", href: "#findmy" }, { label: "AppleCare", href: "#applecare" }, { label: "Carrier", href: "#carrier" }, { label: "1Password", href: "#1password" }]} />
    </>
  );
}
