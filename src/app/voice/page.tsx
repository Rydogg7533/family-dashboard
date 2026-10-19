import Link from "next/link";
import { getVoiceCalls } from "@/lib/data-voice";
import { Card, H1 } from "@/components/ui";
import { CallCard } from "@/components/c/VoiceView";

export const dynamic = "force-dynamic";

// F21 voice agent: screens only in v1 (no platform wired). Every call is a task with limits a parent approves.
export default async function Voice() {
  const calls = await getVoiceCalls();
  const needs = calls.filter((c) => c.status === "awaiting_approval" || c.status === "needs_you");
  const rest = calls.filter((c) => !needs.includes(c));
  return (
    <>
      <H1 right="sample · not wired">Phone calls</H1>
      <Card className="mb-4 text-sm">
        <div className="font-semibold">The agent always says it is an AI assistant</div>
        <div className="text-muted text-xs mt-0.5">It calls from its own number, introduces itself as an AI calling on your behalf, states only what you authorized, and stops at the limits. Outside them it says you will call back and texts you the question. Never calls family or friends; never changes an account's ownership, payment or address. Recording is off unless you turn it on (then it says so on the call). About 10–20¢ a minute, shown in Settings › Assistant.</div>
      </Card>

      <section className="mb-5">
        <div className="flex items-baseline justify-between mb-2"><h2 className="text-base">Needs you</h2><span className="text-xs text-muted">{needs.length}</span></div>
        {needs.length === 0 ? <Card className="text-muted">No calls waiting on you.</Card> : <div className="flex flex-col gap-2">{needs.slice(0, 5).map((c) => <CallCard key={c.id} c={c} />)}{needs.length > 5 && <span className="text-sm font-semibold text-accent px-1">and {needs.length - 5} more</span>}</div>}
      </section>

      <section className="mb-5">
        <h2 className="text-base mb-2">Call log</h2>
        <div className="flex flex-col gap-2">{rest.map((c) => <CallCard key={c.id} c={c} />)}</div>
      </section>

      <p className="text-xs text-muted">Per-call approval for everything to start; standing limits for routine call types can be set later in <Link href="/settings" className="font-semibold text-accent">Settings</Link>. Uses first: store support (<Link href="/shop/cases" className="font-semibold text-accent">cases</Link>), appointments, bill negotiation with phone-only companies, contractors, reservations. Platform to confirm: ElevenLabs Agents (Retell as fallback).</p>
    </>
  );
}
