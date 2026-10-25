import Link from "next/link";
import { H1 } from "@/components/ui";
import { RoutineList } from "@/components/c/RoutineList";
import { getRoutine } from "@/lib/data-money-routine";

export const dynamic = "force-dynamic";

export default async function MoneyRoutine() {
  const r = await getRoutine();
  return (
    <>
      <Link href="/money" className="text-xs font-semibold text-accent">‹ Money</Link>
      <H1 right={r ? `${r.done} of ${r.total} done` : undefined}>Monthly routine{r ? `: ${r.label}` : ""}</H1>
      <p className="text-sm text-muted mb-3">The human steps that close the month: statements in, questions answered, charges explained. Tap Done when a step is finished, or Skip with a reason. Steps that the app can prove from its own records will tick themselves off (coming next).</p>
      {r ? <RoutineList items={r.items} /> : <div className="card text-muted text-sm">Not available in preview.</div>}
      <p className="text-[11px] text-muted mt-3">The list itself is kept in Settings › Money rules (owners). A step the household does two months running is offered as a new step; nothing is added by itself.</p>
    </>
  );
}
