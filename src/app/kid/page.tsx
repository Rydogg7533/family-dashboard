import Link from "next/link";
import { getPeople, getViewer } from "@/lib/data-registers";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import { getDayBlocks, getCalendarEvents, fmtDate, shortTime, weatherGlyph } from "@/lib/data-day";
import { KidChecklist, MessageParent } from "@/components/c/KidView";

export const dynamic = "force-dynamic";

// The child's own simple page (design principle: children's logins land here, not on the menu). No nav, big type,
// only what parents chose: today's schedule, pack list, jobs, this week, a message-a-parent button. No Messages view.
export default async function Kid({ searchParams }: PageProps<"/kid">) {
  const sp = await searchParams;
  const [viewer, people] = await Promise.all([getViewer(), getPeople()]);
  const kids = people.filter((p) => p.role === "child");
  // A child signed in sees their own page. A parent opens a child's page for a shared tablet with /kid?child=<id>, or picks from the list.
  const picked = viewer.role === "child" ? viewer : kids.find((k) => k.id === sp.child);
  if (!picked) {
    return (
      <div className="text-base">
        <h1 className="text-[26px] mb-2">Kid pages</h1>
        {kids.length === 0 ? <p className="text-muted text-sm">No children added yet. A parent adds them in Settings › People and access.</p> : (
          <div className="flex flex-col gap-2">{kids.map((k) => <Link key={k.id} href={`/kid?child=${k.id}`} className="card font-semibold">{k.name}</Link>)}</div>
        )}
      </div>
    );
  }
  const child = picked.name;
  const real = hasSupabaseEnv();
  const [blocks, events] = await Promise.all([getDayBlocks(), getCalendarEvents(undefined, 7)]);
  const mine = blocks.filter((b) => b.person === child);
  const school = { start: "08:00", title: "School" };
  const activity = mine.find((b) => b.checklist);
  const week = events.filter((e) => e.person === child || e.person === "Family").filter((e) => e.date > new Date().toISOString().slice(0, 10)).slice(0, 4);
  const w = activity?.weather;
  return (
    <div className="text-base">
      <h1 className="text-[26px] mb-0.5">Hi, {child}</h1>
      <div className="text-sm text-muted mb-4">{new Date().toLocaleDateString("en-US", { weekday: "long" })}{w ? ` · ${w.note}, ${w.temp}°` : ""}</div>

      <section className="flex flex-col gap-2 mb-5">
        <h2 className="text-[17px]">Today</h2>
        <div className="grid grid-cols-[60px_minmax(0,1fr)] gap-2.5 items-start">
          {!real && <><div className="text-sm text-muted pt-3">{shortTime(school.start)}</div>
          <div className="px-3.5 py-3 bg-soft rounded-xl font-semibold">{school.title}</div></>}
          {mine.map((b) => (
            <div key={b.id} className="contents">
              <div className="text-sm text-muted pt-3">{shortTime(b.start)}</div>
              <div className={`px-3.5 py-3 rounded-xl ${(b.weather?.precip ?? 0) >= 50 ? "bg-amber-bg" : "bg-soft"}`}>
                <div className="font-semibold">{b.title}</div>
                {b.weather && (b.weather.precip ?? 0) >= 50 && <div className="text-sm text-amber font-semibold">{weatherGlyph(b.weather.icon)} Rain. Wear your rain jacket.</div>}
                {b.driving && <div className="text-sm text-muted">{b.driving} is driving</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {activity?.checklist && (
        <div className="mb-5">
          <KidChecklist title={`Pack for ${activity.title.toLowerCase()}`} items={activity.checklist.items.filter((i) => i.layer !== "done_before").map((i) => ({ id: i.id, label: i.label, done: i.packed, weather: i.weather, who: `${i.added_by.replace("System · from the forecast", "Weather").replace("Ryan", "Dad").replace("Melissa", "Mom")} · for you` }))} />
        </div>
      )}

      {!real && <div className="mb-5">
        <KidChecklist title="My jobs" items={[{ id: "j1", label: "Feed the dog", done: false, who: "Mom asked · for you" }, { id: "j2", label: "Practice piano, 20 min", done: true, who: "Dad asked · for you" }]} />
      </div>}

      <section className="bg-soft rounded-xl px-3.5 py-3 text-sm mb-5">
        <div className="font-semibold">This week</div>
        <div className="text-muted">{week.length ? week.map((e) => `${fmtDate(e.date, { weekday: "short" })} ${e.title.toLowerCase()}`).join(" · ") : "nothing else yet"}</div>
      </section>

      {!real && <div className="mb-5"><MessageParent /></div>}

      <div className="border-t border-line pt-3 text-xs text-muted text-center">Your page shows what your parents chose. Ask them to add things.</div>
    </div>
  );
}
