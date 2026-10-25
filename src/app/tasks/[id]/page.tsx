import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpenTasks, ago } from "@/lib/data";
import { getDraftForTask } from "@/lib/data-email";
import { H1 } from "@/components/ui";
import { getDisplayName } from "@/lib/data";
import { TaskActions } from "@/components/TaskActions";
import { DraftEditor } from "@/components/DraftEditor";
import { isPast } from "@/lib/data-money";
import { getCandidateForTask } from "@/lib/data-subscriptions";
import { SubscriptionCandidate } from "@/components/SubscriptionCandidate";

export const dynamic = "force-dynamic";

const label: Record<string, string> = { reply: "REPLY NEEDED", do: "DO", decide: "DECIDE", fyi: "JUST SO YOU KNOW" };

export default async function TaskDetail({ params }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  const [tasks, name] = await Promise.all([getOpenTasks(), getDisplayName()]);
  const task = tasks.find((t) => t.id === id);
  if (!task) notFound();
  const cand = await getCandidateForTask(task.id);
  const draft = task.kind === "reply" ? await getDraftForTask(task.id) : null;
  const due = task.due_at ? new Date(task.due_at) : null;
  const originLabel = task.origin_kind === "email" ? "Gmail" : task.origin_kind === "message" ? "Messages" : task.origin_kind === "receipt" ? "Money" : task.origin_kind === "calendar" ? "Calendar" : task.origin_ref === "/places" ? "Places" : "Source";

  return (
    <>
      <Link href="/tasks" className="text-xs font-semibold text-accent">‹ Tasks</Link>
      <H1>{task.title}</H1>
      <div className="card flex flex-col gap-2 mb-4">
        <div className={`text-[11px] font-bold tracking-wide ${task.kind === "reply" ? "text-amber" : "text-accent"}`}>{label[task.kind]}</div>
        {task.summary && <div className="text-sm">{task.summary}</div>}
        <div className="text-xs text-muted">
          {draft ? `For ${draft.requested_by}` : task.origin_kind === "system" ? "System" : `For ${name || "you"}`} · from {task.origin_kind}{task.origin_kind === "email" ? ` (${draft?.account ?? `${name || "Ryan"}'s mailbox`})` : ""} · {ago(task.created_at)}
          {due && <span className={isPast(task.due_at!) ? " text-red font-semibold" : ""}> · due {due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>}
          {" · "}<a href={task.origin_ref ?? "#"} className="font-semibold text-accent">Open in {originLabel}</a>
        </div>
        <TaskActions id={task.id} kind={cand && cand.status === "asking" ? "snooze" : task.kind} />
      </div>

      {cand && cand.status === "asking" && <div className="card mb-4"><div className="font-semibold mb-1">Is {cand.name} a subscription?</div><SubscriptionCandidate c={cand} /></div>}
      {task.kind === "reply" && (draft ? <DraftEditor draft={draft} /> : <div className="card text-sm text-muted">The draft is being written. It will appear here, never in your mail app, until its attachments are complete.</div>)}
      {task.kind === "do" && <div className="card text-sm text-muted">Do this outside the dashboard, then tap Done. Anything with money in it is prepared here and paid by you there.</div>}
    </>
  );
}
