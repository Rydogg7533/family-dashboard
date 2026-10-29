import Link from "next/link";
import { H1 } from "@/components/ui";
import { Section } from "@/components/money";
import { getEmailSubs, getEmailSubsScan, getFinishLinks, getUnsubscribeAgentReady, type EmailSub } from "@/lib/data-email-subs";
import { EmailSubscriptionList, CancelRequest, AutoRefresh, CheckActions, TryAgain, ArchivedSenders } from "@/components/EmailSubscriptionList";

export const dynamic = "force-dynamic";

const day = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date((iso.length === 10 ? iso + "T12:00:00" : iso));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const ago = (iso: string) => { const h = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3600000)); return h < 1 ? "under an hour ago" : h < 48 ? `${h} hour${h === 1 ? "" : "s"} ago` : `${Math.round(h / 24)} days ago`; };
const name = (s: EmailSub) => s.sender_name || s.address || "Unknown sender";
const Box = ({ s }: { s: EmailSub }) => <div className="text-[11px] font-semibold text-accent truncate">To: {s.mailbox}</div>;

export default async function EmailSubscriptions() {
  const [allSubs, scan, ready] = await Promise.all([getEmailSubs(), getEmailSubsScan(), getUnsubscribeAgentReady()]);
  // Archived (D16): hidden from every section here; Gmail untouched. Rows waiting on the person are never hidden.
  const archived = allSubs.filter((s) => s.archived_at && !["requested", "needs_tap", "open_link", "failed", "check"].includes(s.status));
  const subs = allSubs.filter((s) => !archived.includes(s));
  const active = subs.filter((s) => s.status === "active");
  const check = subs.filter((s) => s.status === "check");
  const needs = subs.filter((s) => s.status === "needs_tap" || s.status === "open_link" || s.status === "failed");
  const waiting = subs.filter((s) => s.status === "requested");
  const done = subs.filter((s) => s.status === "done" || s.status === "stopped");
  const links = await getFinishLinks(needs.slice(0, 5).map((s) => s.id));
  const quietBefore = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  return (
    <>
      <AutoRefresh active={waiting.length > 0} />
      <Link href="/more" className="text-xs font-semibold text-accent">‹ More</Link>
      <H1>Mailing lists</H1>
      <p className="text-xs text-muted mb-3">
        {scan.at ? `Mailing lists found in your Gmail, updated ${ago(scan.at)} and every few hours after that.` : "Mailing lists found in your Gmail."}{" "}
        Only the sender, date and subject line are read, never the message itself. Tick the ones you are done with and tap Unsubscribe.
        {scan.state === "warn" && <span className="text-amber font-semibold"> The last scan had trouble reading some mail.</span>}
      </p>

      {check.length > 0 && (
        <Section title="Check first" right={`${check.length}`}>
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted px-1">Gmail could not confirm these senders are who they say, so nothing was sent and no link is shown. Phishing mail often carries a fake &ldquo;unsubscribe&rdquo;. If you know the sender, say so and the unsubscribe goes ahead.</div>
            {check.map((s) => (
              <div key={s.id} className="card flex flex-col gap-1 border border-amber">
                <div className="font-semibold text-sm">{name(s)}</div>
                <div className="text-xs text-muted truncate">{s.address}</div>
                <Box s={s} />
                <div className="text-xs text-amber font-semibold">{s.auth_note || "This sender could not be verified."}</div>
                <CheckActions id={s.id} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {needs.length > 0 && (
        <Section title="Needs me" right={`${needs.length}`}>
          <div className="flex flex-col gap-2">{needs.slice(0, 5).map((s) => (
            <div key={s.id} className="card flex flex-col gap-1">
              <div className="font-semibold text-sm">{name(s)}</div>
              <Box s={s} />
              <div className="text-xs text-amber font-semibold">{s.status === "failed" ? "The request did not go through." : s.status === "open_link" ? "This sender needs you to finish on its page." : "This sender needs a tap from you."}</div>
              {s.status_note && <div className="text-xs text-muted">{s.status_note}</div>}
              {links[s.id]?.open && <a href={links[s.id].open} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-accent">Open to finish</a>}
              {links[s.id]?.mail && <a href={links[s.id].mail} className="text-xs font-semibold text-accent">Open the email to send</a>}
              <TryAgain ids={[s.id]} />
            </div>
          ))}{needs.length > 5 && <span className="text-sm font-semibold text-accent px-1">and {needs.length - 5} more</span>}
          {needs.length > 1 && <div className="px-1"><TryAgain ids={needs.map((s) => s.id)} label={`Put all ${needs.length} back in the list to try again`} /></div>}</div>
        </Section>
      )}

      {waiting.length > 0 && (
        <Section title="Requested" right={`${waiting.length}`}>
          <div className="card flex flex-col">
            {waiting.map((s) => (
              <div key={s.id} className="py-2.5 border-b border-line last:border-0 flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="font-semibold text-sm truncate">{name(s)}</div><Box s={s} /><div className="text-xs text-muted">Asked {day(s.requested_at)} · {s.status_note || "waiting for your Mac mini (it checks every 10 minutes)"}</div></div>
                <CancelRequest ids={[s.id]} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Your mailing lists" right={`${active.length}`}>
        <EmailSubscriptionList subs={active} quietBefore={quietBefore} ready={ready} />
        <div className="mt-2"><a href="https://mail.google.com/" className="text-xs font-semibold text-accent">Open in Gmail</a></div>
      </Section>

      {done.length > 0 && (
        <Section title="Unsubscribed" right={`${done.length}`}>
          <div className="card flex flex-col">
            {done.map((s) => (
              <div key={s.id} className="py-2.5 border-b border-line last:border-0">
                <div className="font-semibold text-sm">{name(s)}</div>
                <Box s={s} />
                <div className="text-xs text-muted">{s.status === "stopped" ? "Stopped sending" : `Unsubscribed ${day(s.completed_at)}`}</div>
                {s.status === "done" && s.messages_since_unsub > 0 && <div className="text-xs text-amber font-semibold">{s.messages_since_unsub} email{s.messages_since_unsub === 1 ? "" : "s"} arrived since. It may not have worked.</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      <ArchivedSenders subs={archived} />
    </>
  );
}
