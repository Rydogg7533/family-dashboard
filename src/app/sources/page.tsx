import Link from "next/link";
import { H1 } from "@/components/ui";
import { getSources, getViewer } from "@/lib/data-registers";
import { SourceList } from "@/components/SourceList";

export const dynamic = "force-dynamic";

export default async function Sources() {
  const [sources, viewer] = await Promise.all([getSources(), getViewer()]);
  const needs = sources.filter((s) => s.status !== "ok");
  return (
    <>
      <H1 right={`${sources.length} sources`}>Sources</H1>
      {needs.length > 0 && (
        <div className="rounded-xl px-4 py-3 bg-amber-bg text-amber font-semibold mb-3 text-sm">
          {needs.length === 1 ? `${needs[0].name} (${needs[0].account}) needs attention` : `${needs.length} sources need attention`}
        </div>
      )}
      <SourceList sources={sources} viewer={viewer.name} />
      <p className="text-xs text-muted">Each Go opens the source itself; sign-in happens there with the password manager. Links never carry account numbers. Sources that cannot deep-link say so. Add a source in <Link href="/settings" className="text-accent font-semibold">Settings → Connections</Link> and it appears here. Every manual sync is logged; three failures in a row become a Needs me alert.</p>
    </>
  );
}
