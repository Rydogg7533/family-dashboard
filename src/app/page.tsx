import Link from "next/link";
import { getDisplayName, getOpenTasks, getPeopleNames, getStatus, overall } from "@/lib/data";
import { getRequestUser } from "@/lib/supabase/server";
import { splitTasks } from "@/lib/tasks-view";
import { Banner, Card, H1 } from "@/components/ui";
import { TaskRow } from "@/components/TaskRow";


export const dynamic = "force-dynamic";

export default async function Today() {
  const [name, status, allTasks, names, user] = await Promise.all([getDisplayName(), getStatus(), getOpenTasks(), getPeopleNames(), getRequestUser()]);
  const me = user?.id ?? null;
  const tasks = splitTasks(allTasks, me).mine;
  const o = overall(status);
  const top = tasks.filter((t) => t.kind !== "fyi").slice(0, 5);
  const more = tasks.filter((t) => t.kind !== "fyi").length - top.length;
  const fyi = tasks.filter((t) => t.kind === "fyi").length;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <H1 right={name}>{today}</H1>
      <Link href="/health" className="block mb-4"><Banner level={o.level} text={o.level === "ok" ? "System: all good" : `System: ${o.text}`} /></Link>

      <section className="mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base">Needs you</h2>
          <span className="text-xs text-muted">{tasks.length} open</span>
        </div>
        {top.length === 0 ? (
          <Card className="text-muted">Nothing needs you right now.</Card>
        ) : (
          <div className="flex flex-col gap-2">
            {top.map((t) => <TaskRow key={t.id} task={t} me={me} names={names} />)}
            {more > 0 && <Link href="/tasks" className="text-sm font-semibold text-accent px-1">and {more} more</Link>}
          </div>
        )}
      </section>

      <section className="text-xs text-muted">
        {fyi > 0 && <span>{fyi} just-so-you-know item{fyi > 1 ? "s" : ""} · </span>}
        <Link href="/log" className="font-semibold text-accent">See what was handled quietly</Link>
      </section>
    </>
  );
}
