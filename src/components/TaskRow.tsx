import type { Task } from "@/lib/data";
import { ago } from "@/lib/data";
import { TaskActions } from "./TaskActions";
import { TaskWho } from "./TaskWho";

const label: Record<Task["kind"], { text: string; cls: string }> = {
  reply: { text: "REPLY NEEDED", cls: "text-amber" },
  do: { text: "DO", cls: "text-accent" },
  decide: { text: "DECIDE", cls: "text-accent" },
  fyi: { text: "JUST SO YOU KNOW", cls: "text-muted" },
};

export function TaskRow({ task, me = null, names = {} }: { task: Task; me?: string | null; names?: Record<string, string> }) {
  const l = label[task.kind];
  const due = task.due_at ? new Date(task.due_at) : null;
  const overdue = due ? due.getTime() < Date.now() : false;
  const ids = Object.keys(names);
  const otherId = ids.find((x) => x !== me) ?? null;
  const otherName = otherId ? names[otherId] : "the other person";
  const isFyi = !!me && task.audience !== "both" && !!task.person && task.person !== me && (task.fyi ?? []).includes(me);
  const whoLabel = task.audience === "both" ? "For both of you" : isFyi ? `Heads-up. ${names[task.person!] ?? "Someone"} has this one.` : task.person ? (task.person === me ? "For you" : `For ${names[task.person] ?? "someone"}`) : "For anyone";
  const headsUp = (task.fyi ?? []).length > 0;
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex justify-between gap-2 items-start">
        <div className="min-w-0">
          <div className={`text-[11px] font-bold tracking-wide ${l.cls}`}>{l.text}</div>
          <div className="font-semibold text-base">{task.title}</div>
          {task.summary && <div className="text-sm text-muted mt-0.5">{task.summary}</div>}
          <div className="text-xs text-muted mt-1">
            From {task.origin_kind} · {ago(task.created_at)}
            {due && <span className={overdue ? " text-red font-semibold" : ""}> · due {due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>}
          </div>
        </div>
      </div>
      {me && <TaskWho id={task.id} label={whoLabel + (task.audience !== "both" && !isFyi && headsUp ? ` · heads-up to ${(task.fyi ?? []).map((x) => names[x]).filter(Boolean).join(", ")}` : "")} mine={task.person === me} headsUp={headsUp} otherName={otherName} canTake={isFyi} />}
      <TaskActions id={task.id} kind={task.title.startsWith("Subscription? ") ? "sub" : task.kind} />
    </div>
  );
}
