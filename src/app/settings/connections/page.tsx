import Link from "next/link";
import { H1 } from "@/components/ui";
import { RowGroup, SectionTitle } from "@/components/registers";
import { getMyConnections } from "@/lib/data-connections";
import type { ConnState } from "@/lib/connections-steps";

export const dynamic = "force-dynamic";

const PILL: Record<ConnState, { text: string; cls: string }> = {
  connected: { text: "Connected", cls: "bg-green-bg text-green" },
  needs: { text: "Needs attention", cls: "bg-amber-bg text-amber" },
  todo: { text: "Not set up", cls: "bg-soft text-muted" },
  off: { text: "Off", cls: "bg-soft text-muted" },
};

export default async function Connections() {
  const { conns } = await getMyConnections();
  const done = conns.filter((c) => c.state === "connected" || c.state === "off").length;
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>Connections</H1>
      <p className="text-xs text-muted mb-3">What is connected for you. Each person sets up their own mail, location and contacts; the calendar is the household’s. {conns.length ? `${done} of ${conns.length} done.` : ""}</p>
      {conns.length === 0 && <div className="card text-muted text-sm">Nothing to show in sample mode.</div>}
      <RowGroup>
        {conns.map((c) => (
          <div key={c.step} id={c.step} className="py-3 border-b border-line last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{c.label}</div>
              <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${PILL[c.state].cls}`}>{PILL[c.state].text}</span>
            </div>
            <div className="text-xs text-muted mt-1 break-words">{c.detail}</div>
            {c.help && c.state === "todo" && <div className="font-mono text-[11px] text-muted mt-1 break-words select-all rounded-lg border border-line p-2">{c.help}</div>}
            <div className="flex gap-4">
              <Link href={c.step === "mail" && c.state === "todo" ? "/settings/connections/mailbox" : c.href} className="inline-block mt-2 text-sm font-semibold text-accent">{c.state === "connected" ? "Manage" : c.state === "needs" ? "Fix it" : c.state === "off" ? "Change" : "Set up"} ›</Link>
              {c.step === "mail" && c.state !== "todo" && <Link href="/settings/connections/mailbox" className="inline-block mt-2 text-sm font-semibold text-accent">Add a mailbox ›</Link>}
            </div>
          </div>
        ))}
      </RowGroup>
      <SectionTitle>Other sources</SectionTitle>
      <RowGroup>
        <Link href="/sources" className="flex justify-between items-center gap-3 min-h-12 py-2"><div><div className="font-semibold">Sources</div><div className="text-xs text-muted">Every place data comes from, with Go and Sync now</div></div><span aria-hidden className="text-muted">›</span></Link>
      </RowGroup>
    </>
  );
}
