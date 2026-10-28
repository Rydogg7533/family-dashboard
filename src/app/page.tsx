import { householdTz } from "@/lib/google-calendar";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/data-registers";
import { getDisplayName, getOpenTasks, getPeopleNames, getStatus, overall } from "@/lib/data";
import { createClient, hasSupabaseEnv, getRequestUser } from "@/lib/supabase/server";
import { splitTasks } from "@/lib/tasks-view";
import { getReview } from "@/lib/data-review";
import { Banner, Card } from "@/components/ui";
import { TodayGreeting } from "@/components/TodayGreeting";
import { TaskRow } from "@/components/TaskRow";
import SetupCard from "@/components/c/SetupCard";
import GuidedCard from "@/components/c/GuidedCard";
import { SitterToday } from "@/components/c/SitterToday";
import { getDebriefNight, getNights, getSitterSheetNudge, getSitters } from "@/lib/data-sitter";
import { SitterDebrief } from "@/components/c/SitterDebrief";
import { detectSitterNights } from "@/lib/sitter-detect";
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
  const [name, status, allTasks, names, user, setup, tz, review] = await Promise.all([getDisplayName(), getStatus(), getOpenTasks(), getPeopleNames(), getRequestUser(), getMyConnections(), householdTz(), getReview()]);
  // The weekly review card: whenever something is waiting, and every Sunday regardless (the one scheduled moment).
  const reviewOpen = review.stale.length + review.asking.length;
  const isSunday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date()) === "Sun";
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
  const sitterNudge = nextStep || catalog?.show ? null : await getSitterSheetNudge();
  // Sitter nights: the app looks for evening events with no kids on them (and asks), and surfaces a night that is due for review.
  let sitterReview = null as Awaited<ReturnType<typeof getNights>>[number] | null, sitterProposal = null as typeof sitterReview;
  let sitterUpcoming: Awaited<ReturnType<typeof getNights>> = [], sitterList: { id: string; name: string }[] = [], sitterDebrief: Awaited<ReturnType<typeof getDebriefNight>> = null, kidList: { id: string; name: string }[] = [];
  if (me && hasSupabaseEnv()) {
    await detectSitterNights(me);
    const sb = await createClient();
    const [due, asks, up, people, deb, { data: kids }] = await Promise.all([getNights(["awaiting_review"], 1), getNights(["proposed"], 1), getNights(["needed", "scheduled", "confirmed"], 5), getSitters(), getDebriefNight(), sb.from("children").select("id, display_name").is("archived_at", null).order("birth_date")]);
    sitterReview = due[0] ?? null; sitterProposal = asks[0] ?? null; sitterDebrief = deb; kidList = (kids ?? []).map((k) => ({ id: k.id, name: k.display_name }));
    sitterUpcoming = up.filter((n) => new Date(n.endsAt) > new Date()); sitterList = people.filter((p) => p.approvedAt).map((p) => ({ id: p.id, name: p.name }));
  }
  const connDone = setup.conns.filter((c) => c.state === "connected" || c.state === "off").length;
  const o = overall(status);
  const top = tasks.filter((t) => t.kind !== "fyi").slice(0, 5);
  const more = tasks.filter((t) => t.kind !== "fyi").length - top.length;
  const fyi = tasks.filter((t) => t.kind === "fyi").length;
  const today = new Date().toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <TodayGreeting date={today} name={name} tz={tz} />
      <Link href="/health" className="block mb-4"><Banner level={o.level} text={o.level === "ok" ? "System: all good" : `System: ${o.text}`} /></Link>

      {(reviewOpen > 0 || isSunday) && <Link href="/review" className="block mb-3"><Card className="flex justify-between items-center gap-3"><div><div className="font-semibold">Weekly review</div><div className="text-xs text-muted">{reviewOpen > 0 ? `${reviewOpen} thing${reviewOpen === 1 ? "" : "s"} to settle` : "Nothing waiting. Confirm the week."}</div></div><span className="text-accent font-semibold text-sm flex-none">Open ›</span></Card></Link>}
      {nextStep && <SetupCard step={nextStep.step} label={nextStep.label} detail={nextStep.detail} href={nextStep.href} state={nextStep.state as "todo" | "needs"} done={connDone} total={setup.conns.length} />}
      {catalog?.show && <GuidedCard step="catalog" title={catalog.started ? "Keep cataloging what you own" : "Next: catalog what you own"} progress={catalog.started && catalog.total > 0 ? `${catalog.done} of ${catalog.total} areas done` : undefined}
        body={catalog.started ? (catalog.next ? `Next area: ${catalog.next}. A few minutes at a time is fine; it keeps your place.` : "Every area is marked done. Run the final check to finish.") : "Pick the rooms, then photograph things one room at a time. It takes a few minutes per room, over as many days as you like, and it keeps your place."} href="/things/catalog" startLabel={catalog.started ? "Continue" : "Start"} />}
      {sitterNudge?.show && <GuidedCard step="sitter_sheet" title="Set up your sitter sheet" progress={`${sitterNudge.done} of ${sitterNudge.total} sections done`} body={`What a babysitter needs, written once.${sitterNudge.next ? ` Next: ${sitterNudge.next}.` : ""} It shows on the kitchen tablet on sitter nights.`} href="/settings/sitter?tab=house" startLabel="Continue" />}
      {sitterDebrief && <SitterDebrief night={sitterDebrief} kids={kidList} />}
      <SitterToday review={sitterReview} proposal={sitterProposal} tz={tz} upcoming={sitterUpcoming} sitters={sitterList} />
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
