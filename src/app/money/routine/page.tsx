import Link from "next/link";
import { H1 } from "@/components/ui";
import { RoutineList } from "@/components/c/RoutineList";
import { getRoutine } from "@/lib/data-money-routine";
import { getLearning } from "@/lib/data-money-routine-learn";
import { RoutineCandidates } from "@/components/c/RoutineCandidates";

export const dynamic = "force-dynamic";

export default async function MoneyRoutine() {
  const [r, learn] = await Promise.all([getRoutine(), getLearning()]);
  return (
    <>
      <Link href="/money" className="text-xs font-semibold text-accent">‹ Money</Link>
      <H1 right={r ? `${r.done} of ${r.total} done` : undefined}>Monthly routine{r ? `: ${r.label}` : ""}</H1>
      <p className="text-sm text-muted mb-3">The human steps that close the month: statements in, questions answered, charges explained. Tap Done when a step is finished, or Skip with a reason. Steps that the app can prove from its own records will tick themselves off (coming next).</p>
      {learn && <RoutineCandidates rows={learn.proposed} />}
      {r ? <RoutineList items={r.items} /> : <div className="card text-muted text-sm">Not available in preview.</div>}
      <p className="text-[11px] text-muted mt-3">{learn ? `Watching ${learn.watched} kinds of money activity (${learn.observedKinds} seen so far, across ${learn.sinceMonths} month${learn.sinceMonths === 1 ? "" : "s"}). ` : ""}A step the household does two months running is offered above as a new step; nothing is added by itself. The list itself is kept in Settings › Money rules (owners).</p>
    </>
  );
}
