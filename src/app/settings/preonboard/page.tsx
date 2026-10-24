import Link from "next/link";
import { H1 } from "@/components/ui";
import { isOwnerViewer } from "@/lib/owner";
import { listPreonboardLinks } from "@/lib/data-preonboard";
import { PreonboardAdmin } from "@/components/c/PreonboardAdmin";

export const dynamic = "force-dynamic";

export default async function PreonboardSettings() {
  const [isOwner, links] = await Promise.all([isOwnerViewer(), listPreonboardLinks()]);
  return (
    <>
      <Link href="/settings" className="text-xs font-semibold text-accent">‹ Settings</Link>
      <H1>Pre-onboarding links</H1>
      <p className="text-sm text-muted mb-3">Send a prospective household this link before they start the real setup. They work through a checklist and a walkthrough with screenshots, and it saves as they go so they can leave and come back.</p>
      <PreonboardAdmin links={links} canEdit={isOwner} />
    </>
  );
}
