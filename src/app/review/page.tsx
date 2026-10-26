import { H1, Card } from "@/components/ui";
import { getReview } from "@/lib/data-review";
import { ReviewTask } from "@/components/ReviewTask";
import { SubscriptionCandidate } from "@/components/SubscriptionCandidate";
import { TriageVerdict } from "@/components/TriageVerdict";
import { ConfirmWeek } from "@/components/ConfirmWeek";

export const dynamic = "force-dynamic";

const daysLate = (iso: string) => Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const Head = ({ children }: { children: React.ReactNode }) => <div className="text-[11px] font-bold tracking-wide text-muted mt-2 mb-1.5">{children}</div>;

export default async function ReviewPage() {
  const r = await getReview();
  const open = r.stale.length + r.asking.length;
  return (
    <>
      <H1 right={r.lastConfirmed ? `Last: ${when(r.lastConfirmed.at)}` : undefined}>Weekly review</H1>
      <p className="text-xs text-muted mb-3">What the week left open, each settled with one tap. Nothing here expires; it waits until it is answered.</p>

      {r.stale.length > 0 && (<>
        <Head>OVERDUE MORE THAN A WEEK ({r.stale.length})</Head>
        <div className="flex flex-col gap-2 mb-4">{r.stale.map((t) => <ReviewTask key={t.id} id={t.id} title={t.title} daysLate={daysLate(t.due_at!)} />)}</div>
      </>)}

      {r.asking.length > 0 && (<>
        <Head>STILL ASKING ({r.asking.length})</Head>
        <div className="flex flex-col gap-2 mb-4">{r.asking.map((c) => <Card key={c.id}><div className="font-semibold text-sm mb-1">Is {c.name} a subscription?</div><SubscriptionCandidate c={c} /></Card>)}</div>
      </>)}

      {r.triage.length > 0 && (<>
        <Head>DID WE GET THESE RIGHT? ({r.triageJudged} of {r.triage.length} judged)</Head>
        <p className="text-[11px] text-muted mb-1.5 leading-snug">Tasks made from email. Judging them is what decides whether triage is trusted to run on its own; it does not change the task.</p>
        <div className="flex flex-col gap-2">{r.triage.slice(0, 12).map((t) => <TriageVerdict key={t.id} item={t} />)}</div>
        {r.triage.length > 12 && <p className="text-xs text-muted mt-2 mb-4">and {r.triage.length - 12} more, which appear as these are answered.</p>}
        {r.triage.length <= 12 && <div className="mb-4" />}
      </>)}

      <Head>THIS WEEK</Head>
      <Card className="mb-4 text-sm">
        {r.doneThisWeek === 0 ? <span className="text-muted">Nothing finished in the last seven days.</span>
          : <>{r.doneThisWeek} done{r.split.length > 0 && <span className="text-muted"> · {r.split.map((s) => `${s.who} ${s.n}`).join(" · ")}</span>}</>}
      </Card>

      <ConfirmWeek open={open} />
      {r.lastConfirmed && <p className="text-xs text-muted mt-3">Last confirmed {when(r.lastConfirmed.at)} by {r.lastConfirmed.by}.</p>}
    </>
  );
}
