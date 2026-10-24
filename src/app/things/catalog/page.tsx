import Link from "next/link";
import { H1 } from "@/components/ui";
import { CatalogGuide } from "@/components/c/CatalogGuide";
import { getCatalog } from "@/lib/data-catalog";
import { getPeople } from "@/lib/data-registers";
import { isOwnerViewer } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function Catalog() {
  const [view, people, isOwner] = await Promise.all([getCatalog(), getPeople(), isOwnerViewer()]);
  const opts = people.map((p) => ({ key: p.childId ? `child:${p.childId}` : p.uuid ? `person:${p.uuid}` : "", label: p.name })).filter((p) => p.key);
  return (
    <>
      <Link href="/things" className="text-xs font-semibold text-accent">‹ Things</Link>
      <H1>Catalog what you own</H1>
      <p className="text-sm text-muted mb-3">A guided, take-your-time task. Pick the areas, photograph things one area at a time, and mark each area done. It keeps your place, so stop whenever you like. When every area is done, a final check looks for items without photos and records how it finished.</p>
      <CatalogGuide view={view} people={opts} isOwner={isOwner} />
    </>
  );
}
