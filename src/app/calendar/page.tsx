import Link from "next/link";
import { CalendarPanel } from "@/components/CalendarPanel";
import { calendarsWithChoices, hasGoogleCal } from "@/lib/google-calendar";
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
  // ?day=YYYY-MM-DD is the same agenda narrowed to one day (D74): tapping a day in the week lands here,
  // free days included. ?from= remembers which view to go back to.
  const oneDay = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null;
  const from = sp.from === "week" ? "week" : "agenda";
  const added = typeof sp.added === "string" ? sp.added : null;
  const [events, sync, cals] = await Promise.all([
    getCalendarEvents(undefined, 14), getSyncStatus(["calendar", "weather"]),
    hasGoogleCal() ? calendarsWithChoices().catch(() => []) : Promise.resolve([]),
  ]);
  const shownCount = cals.filter((c) => c.shown).length;
  const back = oneDay ? (from === "week" ? "/calendar?view=week" : "/calendar") : view === "week" ? "/calendar?view=week" : "/calendar";
  const here = oneDay ? `/calendar?day=${oneDay}&from=${from}` : view === "week" ? "/calendar?view=week" : "/calendar";
  const openChoices = `${here}${here.includes("?") ? "&" : "?"}calendars=1`;
  const dayHref = (iso: string) => `/calendar?day=${iso}&from=${view}`;
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const days = Array.from(byDay.keys()).sort();
  const trips = events.filter((e) => e.trip);
  const addedEvent = added ? events.find((e) => e.id === added) ?? events.find((e) => e.from_message) : null;
  const chip = (active: boolean) => `px-3 py-1.5 rounded-full text-xs font-semibold ${active ? "bg-accent text-white" : "bg-soft"}`;

  return (
    <>
      <H1 right={<Link href="/day" className="font-semibold text-accent">Today</Link>}>Calendar</H1>
      <div className="flex gap-1.5 mb-3 items-center">
        {oneDay ? (
          <Link href={back} className={chip(false)}>‹ {from === "week" ? "Week" : "Agenda"}</Link>
        ) : (
          <>
            <Link href="/calendar" className={chip(view === "agenda")}>Agenda</Link>
            <Link href="/calendar?view=week" className={chip(view === "week")}>Week</Link>
          </>
        )}
        {cals.length > 0 && (
          <Link href={openChoices} className="ml-auto min-h-9 px-3 rounded-full border border-line text-xs font-semibold text-muted inline-flex items-center whitespace-nowrap">
            Calendars · {shownCount} of {cals.length}
          </Link>
        )}
      </div>
      {sp.calendars === "1" && <CalendarPanel back={back} />}

      {sp.deleted === "1" && <Card className="mb-4"><div className="text-sm">Deleted from Google Calendar.</div></Card>}
      {addedEvent && (
        <Card className="mb-4 border-accent">
          <div className="text-[11px] font-bold tracking-wide text-accent">ADDED TO SCHEDULE</div>
          <div className="font-semibold">{addedEvent.title} · {fmtDate(addedEvent.date)}{addedEvent.start ? ` ${fmtTime(addedEvent.start)}` : ""}</div>
          {addedEvent.from_message && <div className="text-xs text-muted mt-0.5">From a message: “{addedEvent.from_message}”</div>}
          <Who by={addedEvent.requested_by} forPerson={addedEvent.person} source={addedEvent.source.name} href={addedEvent.source.href} className="mt-1" />
          <div className="text-xs text-muted mt-1">Lives in {addedEvent.source.name}. <Link href="/calendar" className="font-semibold text-accent">OK</Link></div>
        </Card>
      )}

      {!oneDay && trips.length > 0 && (
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
            <Link key={iso} href={dayHref(iso)} className="flex gap-3 py-2 border-b border-line last:border-0 hover:bg-soft -mx-1 px-1 rounded-lg">
              <div className="w-12 shrink-0 text-[11px] font-bold text-muted leading-tight">{dt.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}<br /><span className="text-base text-fg">{dt.getDate()}</span></div>
              <div className="flex-1 min-w-0 flex flex-wrap gap-1">
                {evs.length === 0 ? <span className="text-xs text-muted self-center">free</span> : evs.map((e) => (
                  <span key={e.id} className="text-xs font-semibold bg-soft rounded-full px-2 py-1 max-w-full truncate">{e.weather ? <span className="text-amber">{weatherGlyph(e.weather.icon)} </span> : null}{e.start ? `${fmtTime(e.start)} ` : ""}{e.title}{e.weather ? <span className="text-muted font-normal"> {e.weather.temp}°</span> : null}</span>
                ))}
              </div>
            </Link>
          ); })}
        </div>
      ) : null}

      {oneDay && <h2 className="text-2xl font-bold mb-3">{fmtDate(oneDay, { weekday: "long", month: "short", day: "numeric" })}</h2>}

      {oneDay && (byDay.get(oneDay) ?? []).length === 0 && (
        <Card className="flex flex-col items-center text-center gap-3 py-7">
          <div>
            <div className="font-semibold">Nothing on {fmtDate(oneDay, { weekday: "long" })}</div>
            <div className="text-sm text-muted mt-0.5">Across the {shownCount} calendar{shownCount === 1 ? "" : "s"} you follow.</div>
          </div>
          <Link href={`/calendar/new?date=${oneDay}`} className="min-h-11 px-5 rounded-xl bg-accent text-white font-semibold text-sm inline-flex items-center">Add to {fmtDate(oneDay, { weekday: "long" })}</Link>
        </Card>
      )}

      <section className="flex flex-col gap-4">
        {(oneDay ? days.filter((d) => d === oneDay) : view === "week" ? [] : days).map((day) => (
          <div key={day}>
            {!oneDay && <Link href={dayHref(day)} className="block text-[11px] font-bold tracking-wide text-muted mb-1.5">{day === new Date().toISOString().slice(0, 10) ? "TODAY · " : ""}{fmtDate(day, { weekday: "long", month: "short", day: "numeric" }).toUpperCase()}</Link>}
            <div className="flex flex-col gap-2">
              {(byDay.get(day) ?? []).map((e) => (
                <Card key={e.id}>
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold flex items-center gap-1.5">{e.color && <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.color }} />}{e.href ? <Link href={e.href} className="truncate">{e.title}</Link> : e.title}</div>
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

      {oneDay && (byDay.get(oneDay) ?? []).length > 0 && (
        <Link href={`/calendar/new?date=${oneDay}`} className="mt-4 min-h-12 rounded-xl border border-line font-semibold text-sm flex items-center justify-center">Add to {fmtDate(oneDay, { weekday: "long" })}</Link>
      )}

      <section className="card mt-5"><SyncLine items={sync} /></section>
      <p className="text-xs text-muted mt-3">{view === "week" && !oneDay ? "Tap a day for that day on its own. " : ""}Events live in Google Calendar; the app reads and writes them there, never only here. Renewals and recurring dates: <Link href="/recurring" className="font-semibold text-accent">Recurring</Link>.</p>
    </>
  );
}
