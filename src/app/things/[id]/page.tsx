import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, H1 } from "@/components/ui";
import { ThingForm } from "@/components/c/ThingForm";
import { ThingPhotos } from "@/components/c/ThingPhotos";
import { ThingPrice } from "@/components/c/ThingPrice";
import { ThingStatus } from "@/components/c/ThingStatus";
import { getThing } from "@/lib/data-things";
import { getPeople } from "@/lib/data-registers";
import { isOwnerViewer } from "@/lib/owner";
import { STATUS_LABEL, SEASONS } from "@/lib/things-shared";
import { fmtDate } from "@/lib/a-shared";

export const dynamic = "force-dynamic";

export default async function Thing({ params }: PageProps<"/things/[id]">) {
  const { id } = await params;
  const isOwner = await isOwnerViewer();
  const [t, people] = await Promise.all([getThing(id, isOwner), getPeople()]);
  if (!t) notFound();
  const opts = people.map((p) => ({ key: p.childId ? `child:${p.childId}` : p.uuid ? `person:${p.uuid}` : "", label: p.name })).filter((p) => p.key);
  const ownerLabel = t.ownerKey === "shared" ? "Shared" : opts.find((p) => p.key === t.ownerKey)?.label ?? "Someone";
  const row = (k: string, v: string | null) => v ? <div className="flex justify-between gap-3 text-sm"><span className="text-muted">{k}</span><span className="text-right">{v}</span></div> : null;
  return (
    <>
      <Link href="/things" className="text-xs font-semibold text-accent">‹ Things</Link>
      <H1>{t.name}</H1>
      {t.status !== "active" && <Card className="text-sm mb-3"><b>{STATUS_LABEL[t.status]}</b>{t.statusAt ? ` on ${fmtDate(t.statusAt)}` : ""}{t.statusNote ? `. ${t.statusNote}` : ""}</Card>}
      <div className="mb-3"><ThingPhotos itemId={t.id} photos={t.photos} /></div>
      <Card className="flex flex-col gap-1.5 mb-3">
        {row("Category", t.category)}{row("Whose", ownerLabel)}{row("Where it lives", t.location)}{row("Brand", t.brand)}{row("Model", t.model)}
        {row("Size", t.size)}{row("Season", SEASONS.find((s) => s.id === t.season)?.label ?? null)}{row("Serial (last 4)", t.serialLast4)}{row("Notes", t.notes)}
        {row("Added", `${fmtDate(t.createdAt.slice(0, 10))} by ${t.addedBy}`)}
        <div className="mt-1"><ThingForm people={opts} isOwner={isOwner} initial={{ id: t.id, name: t.name, category: t.category, owner: t.ownerKey, location: t.location ?? "", brand: t.brand ?? "", model: t.model ?? "", serialLast4: t.serialLast4 ?? "", size: t.size ?? "", season: t.season ?? "", notes: t.notes ?? "" }} /></div>
      </Card>
      {isOwner && <div className="mb-3"><ThingPrice itemId={t.id} price={t.price} receipt={t.receipt} /></div>}
      <Card className="flex flex-col gap-2">
        <div className="text-xs font-bold tracking-wide text-muted">NO LONGER HAVE IT?</div>
        <ThingStatus id={t.id} status={t.status} />
      </Card>
    </>
  );
}
