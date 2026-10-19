import Link from "next/link";
import { getCalendarEvents, getSyncStatus, fmtDate, fmtTime, weatherGlyph, weatherLine, type CalendarEvent } from "@/lib/data-day";
import { Card, H1 } from "@/components/ui";
import { SyncLine } from "@/components/c/SyncLine";
import { Who } from "@/components/c/Who";

export const dynamic = "force-dynamic";

// Calendar: week / agenda view with weather on every future event (F5), trips, and the landing spot for
// "Add to schedule" from Messages (?added=<event id> shows a one-line confirm card, tier 2).
export default async function Calendar({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const view = sp.view === "week" ? "week" : "agenda";
  const added = typeof sp.added === "string" ? sp.added : null;
  const [events, sync] = await Promise.all([getCalendarEvents(undefined, 14), getSyncStatus(["calendar", "weather"])]);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const days = Array.from(byDay.keys()).sort();
  const trips = events.filter((e) => e.trip);
  const addedEvent = added ? events.find((e) => e.id === added) ?? events.find((e) => e.from_message) : null;
  const chip = (active: boolean) => `px-3 py-1.5 rounded-full text-xs font-semibold ${active ? "bg-accent text-white" : "bg-soft"}`;

  return (
    <>
      <H1 right={<Link href="/day" className="font-semibold text-accent">Today's schedule</Link>}>Calendar</H1>
      <div className="flex gap-1.5 mb-3">
        <Link href="/calendar" className={chip(view === "agenda")}>Agenda</Link>
        <Link href="/calendar?view=week" className={chip(view === "week")}>Week</Link>
      </div>

      {addedEvent && (
        <Card className="mb-4 border-accent">
          <div className="text-[11px] font-bold tracking-wide text-accent">ADDED TO SCHEDULE</div>
          <div className="font-semibold">{addedEvent.title} · {fmtDate(addedEvent.date)}{addedEvent.start ? ` ${fmtTime(addedEvent.start)}` : ""}</div>
          {addedEvent.from_message && <div className="text-xs text-muted mt-0.5">From a message: “{addedEvent.from_message}”</div>}
          <Who by={addedEvent.requested_by} forPerson={addedEvent.person} source={addedEvent.source.name} href={addedEvent.source.href} className="mt-1" />
          <div className="text-xs text-muted mt-1">Lives in {addedEvent.source.name}. <Link href="/calendar" className="font-semibold text-accent">OK</Link></div>
        </Card>
      )}

      {trips.length > 0 && (
        <section className="mb-4">
          <h2 className="text-base mb-2">Trips</h2>
          {trips.map((t) => (
            <Card key={t.id} className="mb-2">
              <div className="font-semibold">{t.title}</div>
              <div className="text-sm text-muted">{fmtDate(t.date, { weekday: "long", month: "long", day: "numeric" })} · {t.place} · {t.person}</div>
              {t.weather && <div className="text-sm mt-1"><span className="text-amber">{weatherGlyph(t.weather.icon)}</span> {weatherLine(t.weather)} · packing list the evening before</div>}
              <Who by={t.requested_by} forPerson={t.person} source={t.source.name} href={t.source.href} className="mt-1" />
            </Card>
          ))}
        </section>
      )}

      {view === "week" ? (
        <div className="card mb-4 flex flex-col">
          {Array.from({ length: 7 }, (_, i) => { const dt = new Date(); dt.setDate(dt.getDate() + i); const iso = dt.toISOString().slice(0, 10); const evs = byDay.get(iso) ?? []; return (
            <div key={iso} className="flex gap-3 py-2 border-b border-line last:border-0">
              <div className="w-12 shrink-0 text-[11px] font-bold text-muted leading-tight">{dt.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}<br /><span className="text-base text-fg">{dt.getDate()}</span></div>
              <div className="flex-1 min-w-0 flex flex-wrap gap-1">
                {evs.length === 0 ? <span className="text-xs text-muted self-center">free</span> : evs.map((e) => (
                  <span key={e.id} className="text-xs font-semibold bg-soft rounded-full px-2 py-1 max-w-full truncate">{e.weather ? <span className="text-amber">{weatherGlyph(e.weather.icon)} </span> : null}{e.start ? `${fmtTime(e.start)} ` : ""}{e.title}{e.weather ? <span className="text-muted font-normal"> {e.weather.temp}°</span> : null}</span>
                ))}
              </div>
            </div>
          ); })}
        </div>
      ) : null}

      <section className="flex flex-col gap-4">
        {days.map((day) => (
          <div key={day}>
            <div className="text-[11px] font-bold tracking-wide text-muted mb-1.5">{day === new Date().toISOString().slice(0, 10) ? "TODAY · " : ""}{fmtDate(day, { weekday: "long", month: "short", day: "numeric" }).toUpperCase()}</div>
            <div className="flex flex-col gap-2">
              {(byDay.get(day) ?? []).map((e) => (
                <Card key={e.id}>
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{e.title}</div>
                      <div className="text-sm text-muted">{e.start ? `${fmtTime(e.start)}${e.end ? `–${fmtTime(e.end)}` : ""}` : "All day"}{e.place ? ` · ${e.place}` : ""} · {e.person}</div>
                    </div>
                    {e.weather && <div className="text-right text-sm shrink-0"><span className="text-amber">{weatherGlyph(e.weather.icon)}</span> {e.weather.temp}°{e.weather.precip && e.weather.precip >= 30 ? <div className="text-xs text-muted">{e.weather.precip}% rain</div> : null}</div>}
                  </div>
                  {e.weather && <div className="text-xs text-muted mt-1">{e.weather.note}</div>}
                  <Who by={e.requested_by} forPerson={e.person} source={e.source.name} href={e.source.href} className="mt-1" />
                </Card>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card mt-5"><SyncLine items={sync} /></section>
      <p className="text-xs text-muted mt-3">New events are written to the person's real calendar (Google for Ryan, Apple for Melissa, the family calendar for shared), never only here. Renewals and recurring dates: <Link href="/recurring" className="font-semibold text-accent">Recurring</Link>.</p>
    </>
  );
}
