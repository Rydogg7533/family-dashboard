import { getOpenTasks, getPeopleNames } from "@/lib/data";
import { getRequestUser } from "@/lib/supabase/server";
import { splitTasks } from "@/lib/tasks-view";
import { H1, Card } from "@/components/ui";
import { TaskRow } from "@/components/TaskRow";


export const dynamic = "force-dynamic";

export default async function Tasks({ searchParams }: PageProps<"/tasks">) {
  const { kind } = await searchParams;
  const [all, names, user] = await Promise.all([getOpenTasks(), getPeopleNames(), getRequestUser()]);
  const me = user?.id ?? null;
  const pick = (list: typeof all) => (kind && typeof kind === "string" ? list.filter((t) => t.kind === kind) : list);
  const { mine, fyi, others } = splitTasks(all, me);
  const tasks = pick(mine);
  const chips = ["all", "reply", "do", "decide", "fyi"];
  return (
    <>
      <H1 right={`${mine.length} open`}>Tasks</H1>
      <div className="flex gap-1.5 flex-wrap text-xs font-semibold mb-3">
        {chips.map((c) => {
          const active = (c === "all" && !kind) || c === kind;
          return <a key={c} href={c === "all" ? "/tasks" : `/tasks?kind=${c}`} className={`px-3 py-1.5 rounded-full ${active ? "bg-accent text-white" : "bg-soft"}`}>{c === "all" ? "All" : c[0].toUpperCase() + c.slice(1)}</a>;
        })}
      </div>
      {tasks.length === 0 ? <Card className="text-muted">Nothing here.</Card> : <div className="flex flex-col gap-2">{tasks.map((t) => <TaskRow key={t.id} task={t} me={me} names={names} />)}</div>}
      {pick(fyi).length > 0 && <section className="mt-5"><div className="text-[11px] font-bold tracking-wide text-muted uppercase mb-1.5">Heads-up, for your information</div><div className="flex flex-col gap-2">{pick(fyi).map((t) => <TaskRow key={t.id} task={t} me={me} names={names} />)}</div></section>}
      {pick(others).length > 0 && <details className="mt-5"><summary className="text-[11px] font-bold tracking-wide text-muted uppercase cursor-pointer">{`Assigned to someone else (${pick(others).length})`}</summary><div className="flex flex-col gap-2 mt-1.5">{pick(others).map((t) => <TaskRow key={t.id} task={t} me={me} names={names} />)}</div></details>}
    </>
  );
}
