import { getDayBlocks, getCalendarEvents, fmtDate, shortTime, weatherGlyph } from "@/lib/data-day";
import { KidChecklist, MessageParent } from "@/components/c/KidView";

export const dynamic = "force-dynamic";

// The child's own simple page (design principle: children's logins land here, not on the menu). No nav, big type,
// only what parents chose: today's schedule, pack list, jobs, this week, a message-a-parent button. No Messages view.
export default async function Kid() {
  const child = "[Child 1]";
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
          <div className="text-sm text-muted pt-3">{shortTime(school.start)}</div>
          <div className="px-3.5 py-3 bg-soft rounded-xl font-semibold">{school.title}</div>
          {mine.map((b) => (
            <div key={b.id} className="contents">
              <div className="text-sm text-muted pt-3">{shortTime(b.start)}</div>
              <div className={`px-3.5 py-3 rounded-xl ${(b.weather?.precip ?? 0) >= 50 ? "bg-amber-bg" : "bg-soft"}`}>
                <div className="font-semibold">{b.title}</div>
                {b.weather && (b.weather.precip ?? 0) >= 50 && <div className="text-sm text-amber font-semibold">{weatherGlyph(b.weather.icon)} Rain. Wear your rain jacket.</div>}
                {b.driving && <div className="text-sm text-muted">{b.driving === "Ryan" ? "Dad" : b.driving === "Melissa" ? "Mom" : b.driving} is driving</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {activity?.checklist && (
        <div className="mb-5">
          <KidChecklist title={`Pack for ${activity.title.toLowerCase()}`} items={activity.checklist.items.filter((i) => i.layer !== "done_before").map((i) => ({ id: i.id, label: i.label, done: i.packed, weather: i.weather }))} />
        </div>
      )}

      <div className="mb-5">
        <KidChecklist title="My jobs" items={[{ id: "j1", label: "Feed the dog", done: false }, { id: "j2", label: "Practice piano, 20 min", done: true }]} />
      </div>

      <section className="bg-soft rounded-xl px-3.5 py-3 text-sm mb-5">
        <div className="font-semibold">This week</div>
        <div className="text-muted">{week.length ? week.map((e) => `${fmtDate(e.date, { weekday: "short" })} ${e.title.toLowerCase()}`).join(" · ") : "nothing else yet"}</div>
      </section>

      <div className="mb-5"><MessageParent /></div>

      <div className="border-t border-line pt-3 text-xs text-muted text-center">Your page shows what your parents chose. Ask them to add things.</div>
    </div>
  );
}
