import Link from "next/link";
import { H1 } from "@/components/ui";
import { Section, SyncLine } from "@/components/money";
import { CustomerMaterialCard } from "@/components/CustomerMaterialCard";
import { getCustomerMaterials, CUSTOMER_MATERIALS_FOLDER, WORK_ENTITY } from "@/lib/data-work";

export const dynamic = "force-dynamic";

// Work area (F12.7), first slice: the fixed Customer materials card for StewardOS. Entity cards (money
// close, tasks, key dates) come later; this page exists so the sales materials are one tap away, always.
export default async function Work() {
  const { items, isOwner, indexedAt } = await getCustomerMaterials();
  return (
    <>
      <H1>Work</H1>
      <p className="text-xs text-muted mb-3">
        {indexedAt ? <><SyncLine at={indexedAt} label="Documents index" /><br /></> : null}
        {WORK_ENTITY} · StewardOS. Business stays off the family screens; only you see this page.
      </p>

      <Section title="Customer materials" right={`${items.length}`}>
        {items.length === 0 ? (
          <div className="card text-muted text-sm">Nothing indexed yet from <span className="break-all">{CUSTOMER_MATERIALS_FOLDER}</span>. The hub's catalog runs every 10 minutes; a file saved there appears here on the next pass.</div>
        ) : (
          <div className="flex flex-col gap-2">{items.map((m) => <CustomerMaterialCard key={m.hub_id || m.path} m={m} isOwner={isOwner} />)}</div>
        )}
      </Section>
      <p className="text-[11px] text-muted">Edit the file in place on the hub and this card follows the new version. The share link is what you copy or text; set it once per file. Files open through <Link href="/documents" className="font-semibold text-accent">Documents</Link>; nothing here holds the contents.</p>
    </>
  );
}
