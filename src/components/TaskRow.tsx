import type { Task } from "@/lib/data";
import { ago } from "@/lib/data";
import { TaskActions } from "./TaskActions";

const label: Record<Task["kind"], { text: string; cls: string }> = {
  reply: { text: "REPLY NEEDED", cls: "text-amber" },
  do: { text: "DO", cls: "text-accent" },
  decide: { text: "DECIDE", cls: "text-accent" },
  fyi: { text: "JUST SO YOU KNOW", cls: "text-muted" },
};

export function TaskRow({ task }: { task: Task }) {
  const l = label[task.kind];
  const due = task.due_at ? new Date(task.due_at) : null;
  const overdue = due ? due.getTime() < Date.now() : false;
  return (
    <div className="rounded-2xl border border-line p-3.5 flex flex-col gap-2">
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
      <TaskActions id={task.id} kind={task.kind} />
    </div>
  );
}
