import { getOpenTasks, getPeopleNames } from "@/lib/data";
import { getRequestUser } from "@/lib/supabase/server";
import { H1, Card } from "@/components/ui";
import { TaskRow } from "@/components/TaskRow";
import { splitTasks } from "@/lib/tasks-view";

export const dynamic = "force-dynamic";

export default async function Tasks({ searchParams }: PageProps<"/tasks">) {
  const { kind, who } = await searchParams;
  const [all, names, user] = await Promise.all([getOpenTasks(), getPeopleNames(), getRequestUser()]);
  const me = user?.id ?? null;
  // Tabs: each person, then Both. Mine first. "Both" = shared with either able to finish, or unassigned.
  const ids = Object.keys(names).sort((a, b) => (a === me ? -1 : b === me ? 1 : 0));
  const isBoth = (t: (typeof all)[number]) => t.audience === "both" || !t.person;
  // D90: your own tab is everything you could pick up -- yours plus the household's -- which is what
  // Today already shows via splitTasks. Before this, Tasks excluded shared items from your tab, so a
  // household job appeared on Today and not on the page you actually go to for work. Another person's
  // tab still shows only what is specifically theirs. Tab id stays "both" so existing links keep working.
  const s = splitTasks(all, me);
  const bucket = (id: string) => (me && id === me)
    ? [...s.mine, ...s.fyi]
    : all.filter((t) => !isBoth(t) && (t.person === id || (t.fyi ?? []).includes(id)));
  const household = all.filter(isBoth);
  const tabs = [...ids.map((id) => ({ id, label: names[id] + (id === me ? " (you)" : ""), list: bucket(id) })), { id: "both", label: "Household", list: household }];
  const current = typeof who === "string" && tabs.some((t) => t.id === who) ? who : (me && ids.includes(me) ? me : "both");
  const tab = tabs.find((t) => t.id === current)!;
  const tasks = typeof kind === "string" && kind !== "all" ? tab.list.filter((t) => t.kind === kind) : tab.list;
  const chips = ["all", "reply", "do", "decide", "fyi"];
  const href = (w: string, k?: string) => `/tasks?who=${w}${k && k !== "all" ? `&kind=${k}` : ""}`;
  return (
    <>
      <H1 right={`${all.length} open`}>Tasks</H1>
      <div className="flex gap-1.5 flex-wrap text-sm font-semibold mb-2">
        {tabs.map((t) => <a key={t.id} href={href(t.id, typeof kind === "string" ? kind : undefined)} className={`px-3 py-1.5 rounded-full min-h-9 ${t.id === current ? "bg-accent text-white" : "bg-soft"}`}>{t.label} ({t.list.length})</a>)}
      </div>
      <div className="flex gap-1.5 flex-wrap text-xs font-semibold mb-3">
        {chips.map((c) => {
          const active = (c === "all" && !kind) || c === kind;
          return <a key={c} href={href(current, c)} className={`px-3 py-1.5 rounded-full ${active ? "bg-accent text-white" : "bg-soft"}`}>{c === "all" ? "All" : c[0].toUpperCase() + c.slice(1)}</a>;
        })}
      </div>
      {tasks.length === 0 ? <Card className="text-muted">Nothing here.</Card> : <div className="flex flex-col gap-2">{tasks.map((t) => <TaskRow key={t.id} task={t} me={me} names={names} />)}</div>}
    </>
  );
}
