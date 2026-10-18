import { getOpenTasks } from "@/lib/data";
import { H1, Card } from "@/components/ui";
import { TaskRow } from "@/components/TaskRow";


export const dynamic = "force-dynamic";

export default async function Tasks({ searchParams }: PageProps<"/tasks">) {
  const { kind } = await searchParams;
  const all = await getOpenTasks();
  const tasks = kind && typeof kind === "string" ? all.filter((t) => t.kind === kind) : all;
  const chips = ["all", "reply", "do", "decide", "fyi"];
  return (
    <>
      <H1 right={`${all.length} open`}>Tasks</H1>
      <div className="flex gap-1.5 flex-wrap text-xs font-semibold mb-3">
        {chips.map((c) => {
          const active = (c === "all" && !kind) || c === kind;
          return <a key={c} href={c === "all" ? "/tasks" : `/tasks?kind=${c}`} className={`px-3 py-1.5 rounded-full ${active ? "bg-accent text-white" : "bg-soft"}`}>{c === "all" ? "All" : c[0].toUpperCase() + c.slice(1)}</a>;
        })}
      </div>
      {tasks.length === 0 ? <Card className="text-muted">Nothing here.</Card> : <div className="flex flex-col gap-2">{tasks.map((t) => <TaskRow key={t.id} task={t} />)}</div>}
    </>
  );
}
