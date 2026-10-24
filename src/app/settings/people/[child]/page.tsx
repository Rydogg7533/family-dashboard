import Link from "next/link";
import { notFound } from "next/navigation";
import { H1 } from "@/components/ui";
import { ChildAccess } from "@/components/c/ChildAccess";
import { getChildFeatures, getChildRows, getFeatureAges } from "@/lib/data-children";
import { isOwnerViewer } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function ChildAccessPage({ params }: PageProps<"/settings/people/[child]">) {
  const { child: id } = await params;
  const [kids, features, ages, canEdit] = await Promise.all([getChildRows(), getChildFeatures(), getFeatureAges(), isOwnerViewer()]);
  const child = kids.find((k) => k.id === id);
  if (!child) notFound();
  return (
    <>
      <H1 right={<Link href="/settings/people" className="font-semibold text-accent">People ›</Link>}>{child.display_name}&apos;s access</H1>
      <p className="text-xs text-muted mb-3">What {child.display_name} can see and do. Harmless features turn on by themselves at the age shown; ones marked needs your OK wait for you. The database enforces this, not just the screen.</p>
      <div className="flex gap-4 mb-3 text-sm font-semibold">
        <Link href={`/kid?child=${child.profile_id ?? child.id}`} className="text-accent">Preview their page ›</Link>
        <Link href="/settings/people/features" className="text-accent">Change ages for everyone ›</Link>
      </div>
      <ChildAccess child={child} features={features} ages={ages} canEdit={canEdit} />
    </>
  );
}
