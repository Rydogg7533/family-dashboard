import Link from "next/link";
import { H1 } from "@/components/ui";
import { Section, OpenIn, SyncLine } from "@/components/money";
import { getAccounts, getRecurring, money, shortDate, accountLabel, hoursAgo } from "@/lib/data-money";

export const dynamic = "force-dynamic";

export default async function Subscriptions() {
  const [accounts, items] = await Promise.all([getAccounts(), getRecurring()]);
  const subs = items.filter((r) => r.kind === "subscription").sort((a, b) => a.next_charge.localeCompare(b.next_charge));
  const acc = (id: string) => accounts.find((a) => a.id === id);
  const needs = subs.filter((s) => s.ack_waiting || !s.on_register || s.decision === "review" || s.decision === "cancel");
  const yearly = subs.reduce((n, r) => n + (r.cycle === "yearly" ? r.amount : r.cycle === "weekly" ? r.amount * 52 : r.amount * 12), 0);

  return (
    <>
      <Link href="/money" className="text-xs font-semibold text-accent">‹ Money</Link>
      <H1>Subscriptions</H1>
      <p className="text-xs text-muted mb-3"><SyncLine at={hoursAgo(5)} label="register sheet" /><br />{subs.length} subscriptions, about {money(yearly)} a year. Monthly audit: register vs reality. Keep, cancel or downgrade is a decision here; the cancelling happens where the service lives, from a prepared task.</p>

      <Section title="Needs me" right={`${needs.length}`}>
        {needs.length === 0 ? <div className="card text-muted text-sm">Nothing to decide or acknowledge.</div> : (
          <div className="flex flex-col gap-2">{needs.map((s) => (
            <div key={s.id} className="card flex flex-col gap-1.5">
              <div className="flex justify-between text-sm"><span className="font-semibold">{s.name}</span><span className="font-semibold">{money(s.amount)}<span className="text-xs text-muted"> / {s.cycle.replace("ly", "")}</span></span></div>
              <div className="text-xs text-muted">Next charge {shortDate(s.next_charge)} · {accountLabel(acc(s.account_id))} · {s.entity}{s.both_names ? " · both names on the account" : ""}</div>
              <div className="text-[11px] text-muted">{s.decided_by === "System (register)" ? "System" : `${s.decided_by} asked`} · from the register · <OpenIn label="register sheet" /></div>
              {s.ack_waiting && <div className="text-xs text-amber font-semibold">Marked &ldquo;{s.decision}&rdquo; by {s.decided_by}; waiting on {s.ack_waiting} to acknowledge (two-party rule).</div>}
              {!s.on_register && <div className="text-xs text-amber font-semibold">Seen on the card, not on the register. Add it, or explain the charge.</div>}
              {s.decision === "cancel" && <div className="text-xs rounded-xl bg-soft p-2.5"><div className="font-semibold">Cancel-prep task</div><div className="text-muted">Where: {s.cancel_at ?? "[where to cancel]"} · before {shortDate(s.next_charge)} to avoid the next charge · login in Apple Passwords. You cancel; the dashboard records it and watches for the charge to stop.</div></div>}
              <div className="flex flex-wrap gap-1.5">
                {s.ack_waiting ? <button className="min-h-10 px-3 rounded-full bg-accent text-white text-xs font-semibold">Acknowledge</button> : (
                  <>
                    <button className="min-h-10 px-3 rounded-full border border-line text-xs font-semibold">Keep</button>
                    <button className="min-h-10 px-3 rounded-full border border-line text-xs font-semibold">Downgrade</button>
                    <button className="min-h-10 px-3 rounded-full border border-line text-xs font-semibold">Prepare cancel</button>
                    {!s.on_register && <button className="min-h-10 px-3 rounded-full border border-line text-xs font-semibold">Add to register</button>}
                  </>
                )}
              </div>
              <div className="text-[11px] text-muted">A decision on shared money needs both parents; it saves after the other acknowledges.</div>
            </div>
          ))}</div>
        )}
      </Section>

      <Section title="All subscriptions" right={<OpenIn label="register sheet" />}>
        <div className="card flex flex-col">
          {subs.map((s) => (
            <div key={s.id} className="py-2.5 border-b border-line last:border-0">
              <div className="flex justify-between text-sm"><span className="font-semibold">{s.name}</span><span>{money(s.amount)} <span className="text-xs text-muted">/ {s.cycle.replace("ly", "")}</span></span></div>
              <div className="text-xs text-muted">Next {shortDate(s.next_charge)} · {accountLabel(acc(s.account_id))} · {s.entity} · cancel at: {s.cancel_at ?? "—"} · <span className={`font-semibold ${s.decision === "cancel" ? "text-red" : s.decision === "review" ? "text-amber" : "text-green"}`}>{s.decision}</span> · {s.decided_by}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Change Log" right="two-party">
        <div className="card text-sm flex flex-col">
          <div className="py-2 border-b border-line"><div className="font-semibold">[Streaming service] → review</div><div className="text-xs text-muted">Ryan asked · {shortDate(hoursAgo(48).slice(0, 10))} · price increase · waiting on Melissa</div></div>
          <div className="py-2"><div className="font-semibold">[Design tool seat] → cancel</div><div className="text-xs text-muted">Ryan asked · SHVR, Ryan only · acknowledged (single-owner entity)</div></div>
        </div>
      </Section>
    </>
  );
}
