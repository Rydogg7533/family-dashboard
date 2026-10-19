import Link from "next/link";
import { H1 } from "@/components/ui";
import { ChangePassword } from "@/components/ChangePassword";
import { getViewer } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const viewer = await getViewer();
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>People and access</H1>
      <ChangePassword viewer={viewer.name} />
      <p className="text-xs text-muted mt-4">Members, two-step set-up and the who-sees-what grid will be added here. Changes to access need both parents.</p>
    </>
  );
}
