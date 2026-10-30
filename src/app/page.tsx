import { householdTz } from "@/lib/google-calendar";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/data-registers";
import { getDisplayName, getOpenTasks, getPeopleNames, getStatus, overall } from "@/lib/data";
import { createClient, hasSupabaseEnv, getRequestUser, getMyProfile } from "@/lib/supabase/server";
import { after } from "next/server";
import { splitTasks } from "@/lib/tasks-view";
import { getReview } from "@/lib/data-review";
import { Banner, Card } from "@/components/ui";
import { TodayGreeting } from "@/components/TodayGreeting";
import { TaskRow } from "@/components/TaskRow";
import { buildQueue, countNew, type QueueInboxItem } from "@/lib/today-queue";
import { TodaySeen } from "@/components/TodaySeen";
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
  const t0 = Date.now();
  // A child's login has one page: theirs. (One profile read per request: getMyProfile feeds viewer, owner, name, tabs.)
  if ((await getViewer()).role === "child" && hasSupabaseEnv()) redirect("/kid");
  const [owner, user] = await Promise.all([isOwnerViewer(), getRequestUser()]);
  const me = user?.id ?? null;
  // Everything the page reads, in one batch (2026-10-30: this used to be ten serial awaits plus a Google Calendar call
  // before the first paint; Ryan: "initial load on app open to Today tab is slow"). The nudges and sitter rows are
  // fetched here too and only *shown* according to the same rules as before.
  const [name, status, allTasks, names, setup, tz, review, inboxRes, catalog, sitterNudge, due, asks, up, people, deb, kidsRes] = await Promise.all([
    getDisplayName(), getStatus(), getOpenTasks(), getPeopleNames(), getMyConnections(), householdTz(), getReview(),
    me && hasSupabaseEnv() ? createClient().then((sb) => Promise.all([
      sb.from("inbox_items").select("id,title,missing,captured_at,assigned_to,for_person,requested_by").eq("status", "open").order("captured_at", { ascending: false }).limit(50),
      getMyProfile(),
    ])) : null,
    getCatalogNudge(), getSitterSheetNudge(),
    me && hasSupabaseEnv() ? getNights(["awaiting_review"], 1) : [], me && hasSupabaseEnv() ? getNights(["proposed"], 1) : [],
    me && hasSupabaseEnv() ? getNights(["needed", "scheduled", "confirmed"], 5) : [], me && hasSupabaseEnv() ? getSitters() : [],
    me && hasSupabaseEnv() ? getDebriefNight() : null,
    me && hasSupabaseEnv() ? createClient().then((sb) => sb.from("children").select("id, display_name").is("archived_at", null).order("birth_date")) : null,
  ]);
  const tRead = Date.now() - t0;
  // Side effects run after the response is sent, never in front of the paint (next/server after()):
  //  - a parent gets one task per sensitive feature a child has just become old enough for;
  //  - the sitter detector looks at the next three days of the calendar for evening events with no kids on them
  //    (that is a Google Calendar call: a night it finds shows on the next open of Today, not this one);
  //  - opening Today marks the queue seen.
  if (me && hasSupabaseEnv()) {
    const uid = me;
    after(async () => {
      if (owner) { const [kids, feats, ages] = await Promise.all([getChildRows(), getChildFeatures(), getFeatureAges()]); await syncChildUnlockTasks(await createClient(), uid, kids, feats, ages).catch(() => null); }
      await detectSitterNights(uid).catch(() => null);
      const sb = await createClient();
      await sb.from("profiles").update({ today_seen_at: new Date().toISOString() }).eq("id", uid).then(() => {}, () => {});
    });
  }
  // The weekly review card: whenever something is waiting, and every Sunday regardless (the one scheduled moment).
  const reviewOpen = review.stale.length + review.asking.length;
  const isSunday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date()) === "Sun";
  const tasks = splitTasks(allTasks, me).mine;
  // The one queue (D23, 2026-10-28): urgent tasks, Inbox items waiting on me, replies to send, then the rest. Items that
  // arrived since I last opened Today are marked new; that count is the badge. Opening Today marks them all seen (above).
  const inbox = ((inboxRes?.[0]?.data ?? []) as QueueInboxItem[]);
  const seenAt: string | null = inboxRes?.[1]?.today_seen_at ?? null;
  const queue = buildQueue(tasks, inbox, { me, myName: name, tz, seenAt });
  const newCount = countNew(queue);
  // One set-up step at a time: the first connection that is not done and was not put off with "Not now".
  const nextStep = setup.conns.find((c) => (c.state === "todo" || c.state === "needs") && !setup.dismissed.has(c.step));
  const showCatalog = nextStep ? null : catalog;
  const showSitterNudge = nextStep || showCatalog?.show ? null : sitterNudge;
  // Sitter nights: the app looks for evening events with no kids on them (and asks), and surfaces a night that is due for review.
  const sitterReview = due[0] ?? null, sitterProposal = asks[0] ?? null, sitterDebrief = deb;
  const kidList = (kidsRes?.data ?? []).map((k) => ({ id: k.id, name: k.display_name }));
  const sitterUpcoming = up.filter((n) => new Date(n.endsAt) > new Date());
  const sitterList = people.filter((p) => p.approvedAt).map((p) => ({ id: p.id, name: p.name }));
  console.log(`[today] reads ${tRead} ms, total ${Date.now() - t0} ms`);
  const connDone = setup.conns.filter((c) => c.state === "connected" || c.state === "off").length;
  const o = overall(status);
  const top = queue.slice(0, 7);
  const more = queue.length - top.length;
  const fyi = tasks.filter((t) => t.kind === "fyi").length;
  const today = new Date().toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <TodayGreeting date={today} name={name} tz={tz} />
      <Link href="/health" className="block mb-4"><Banner level={o.level} text={o.level === "ok" ? "System: all good" : `System: ${o.text}`} /></Link>

      {(reviewOpen > 0 || isSunday) && <Link href="/review" className="block mb-3"><Card className="flex justify-between items-center gap-3"><div><div className="font-semibold">Weekly review</div><div className="text-xs text-muted">{reviewOpen > 0 ? `${reviewOpen} thing${reviewOpen === 1 ? "" : "s"} to settle` : "Nothing waiting. Confirm the week."}</div></div><span className="text-accent font-semibold text-sm flex-none">Open ›</span></Card></Link>}
      {nextStep && <SetupCard step={nextStep.step} label={nextStep.label} detail={nextStep.detail} href={nextStep.href} state={nextStep.state as "todo" | "needs"} done={connDone} total={setup.conns.length} />}
      {showCatalog?.show && <GuidedCard step="catalog" title={showCatalog.started ? "Keep cataloging what you own" : "Next: showCatalog what you own"} progress={showCatalog.started && showCatalog.total > 0 ? `${showCatalog.done} of ${showCatalog.total} areas done` : undefined}
        body={showCatalog.started ? (showCatalog.next ? `Next area: ${showCatalog.next}. A few minutes at a time is fine; it keeps your place.` : "Every area is marked done. Run the final check to finish.") : "Pick the rooms, then photograph things one room at a time. It takes a few minutes per room, over as many days as you like, and it keeps your place."} href="/things/showCatalog" startLabel={showCatalog.started ? "Continue" : "Start"} />}
      {showSitterNudge?.show && <GuidedCard step="sitter_sheet" title="Set up your sitter sheet" progress={`${showSitterNudge.done} of ${showSitterNudge.total} sections done`} body={`What a babysitter needs, written once.${showSitterNudge.next ? ` Next: ${showSitterNudge.next}.` : ""} It shows on the kitchen tablet on sitter nights.`} href="/settings/sitter?tab=house" startLabel="Continue" />}
      {sitterDebrief && <SitterDebrief night={sitterDebrief} kids={kidList} />}
      <SitterToday review={sitterReview} proposal={sitterProposal} tz={tz} upcoming={sitterUpcoming} sitters={sitterList} />
      <TodaySeen />
      <section className="mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base">Needs you</h2>
          <span className="text-xs text-muted">{queue.length === 0 ? "" : `${queue.length} to do${newCount ? ` · ${newCount} new` : ""}`}</span>
        </div>
        {top.length === 0 ? (
          <Card className="text-muted">Nothing needs you. You&apos;re done for now.</Card>
        ) : (
          <div className="flex flex-col gap-2">
            {top.map((q) => q.kind === "task" ? (
              <div key={q.id} className="relative">
                {(q.why || q.isNew) && <div className="flex gap-2 px-1 mb-0.5 text-[11px] font-semibold">{q.why && <span className={q.why === "Overdue" || q.why === "Due today" ? "text-red" : "text-muted"}>{q.why}</span>}{q.isNew && <span className="text-accent">New</span>}</div>}
                <TaskRow task={q.task} me={me} names={names} />
              </div>
            ) : (
              <Link key={q.id} href="/inbox" className="block">
                <div className="flex gap-2 px-1 mb-0.5 text-[11px] font-semibold"><span className="text-muted">{q.why}</span>{q.isNew && <span className="text-accent">New</span>}</div>
                <Card className="flex flex-col gap-0.5"><div className="font-semibold text-sm">{q.item.title}</div><div className="text-xs text-muted">{q.item.missing}</div></Card>
              </Link>
            ))}
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
