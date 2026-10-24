import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/data-registers";
import { getDisplayName, getOpenTasks, getPeopleNames, getStatus, overall } from "@/lib/data";
import { createClient, hasSupabaseEnv, getRequestUser } from "@/lib/supabase/server";
import { splitTasks } from "@/lib/tasks-view";
import { Banner, Card, H1 } from "@/components/ui";
import { TaskRow } from "@/components/TaskRow";
import SetupCard from "@/components/c/SetupCard";
import CatalogCard from "@/components/c/CatalogCard";
import { getCatalogNudge } from "@/lib/data-catalog";
import { getMyConnections } from "@/lib/data-connections";
import { getChildFeatures, getChildRows, getFeatureAges } from "@/lib/data-children";
import { syncChildUnlockTasks } from "@/lib/child-unlocks";
import { isOwnerViewer } from "@/lib/owner";


export const dynamic = "force-dynamic";

export default async function Today() {
  // A child's login has one page: theirs.
  if ((await getViewer()).role === "child" && hasSupabaseEnv()) redirect("/kid");
  // A parent gets one task per sensitive feature a child has just become old enough for.
  if (hasSupabaseEnv() && (await isOwnerViewer())) { const u = await getRequestUser(); if (u) { const [kids, feats, ages] = await Promise.all([getChildRows(), getChildFeatures(), getFeatureAges()]); await syncChildUnlockTasks(await createClient(), u.id, kids, feats, ages).catch(() => null); } }
  const [name, status, allTasks, names, user, setup] = await Promise.all([getDisplayName(), getStatus(), getOpenTasks(), getPeopleNames(), getRequestUser(), getMyConnections()]);
  const me = user?.id ?? null;
  const tasks = splitTasks(allTasks, me).mine;
  let handed = 0, handedBy = "";
  if (me && hasSupabaseEnv()) {
    const sb = await createClient();
    const { data: hs } = await sb.from("inbox_items").select("assigned_by").eq("status", "open").eq("assigned_to", me);
    handed = hs?.length ?? 0;
    const from = [...new Set((hs ?? []).map((r) => r.assigned_by as string | null).filter((x): x is string => !!x && x !== me))].map((id) => names[id]).filter(Boolean);
    handedBy = from.length === 1 ? from[0] : "";
  }
  // One set-up step at a time: the first connection that is not done and was not put off with "Not now".
  const nextStep = setup.conns.find((c) => (c.state === "todo" || c.state === "needs") && !setup.dismissed.has(c.step));
  const catalog = nextStep ? null : await getCatalogNudge();
  const connDone = setup.conns.filter((c) => c.state === "connected" || c.state === "off").length;
  const o = overall(status);
  const top = tasks.filter((t) => t.kind !== "fyi").slice(0, 5);
  const more = tasks.filter((t) => t.kind !== "fyi").length - top.length;
  const fyi = tasks.filter((t) => t.kind === "fyi").length;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <H1 right={name}>{today}</H1>
      <Link href="/health" className="block mb-4"><Banner level={o.level} text={o.level === "ok" ? "System: all good" : `System: ${o.text}`} /></Link>

      {nextStep && <SetupCard step={nextStep.step} label={nextStep.label} detail={nextStep.detail} href={nextStep.href} state={nextStep.state as "todo" | "needs"} done={connDone} total={setup.conns.length} />}
      {catalog?.show && <CatalogCard started={catalog.started} done={catalog.done} total={catalog.total} next={catalog.next} />}
      {handed > 0 && <Link href="/inbox" className="block mb-4"><div className="card border-accent text-sm font-semibold">{handedBy ? `${handedBy} handed you` : "Handed to you:"} {handed} item{handed === 1 ? "" : "s"} in the Inbox. <span className="text-accent">Open</span></div></Link>}
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
