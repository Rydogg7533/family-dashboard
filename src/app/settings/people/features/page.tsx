import Link from "next/link";
import { H1 } from "@/components/ui";
import { FeatureAges } from "@/components/c/FeatureAges";
import { getChildFeatures, getFeatureAges } from "@/lib/data-children";
import { isOwnerViewer } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function FeatureAgesPage() {
  const [features, ages, canEdit] = await Promise.all([getChildFeatures(), getFeatureAges(), isOwnerViewer()]);
  return (
    <>
      <H1 right={<Link href="/settings/people" className="font-semibold text-accent">People ›</Link>}>Ages for features</H1>
      <p className="text-xs text-muted mb-3">The age at which each feature unlocks, for every child. Move a feature earlier or later; each child can still be set separately. Ages count the youngest the child could be.</p>
      <FeatureAges features={features} ages={ages} canEdit={canEdit} />
    </>
  );
}
