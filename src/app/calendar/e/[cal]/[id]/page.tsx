import Link from "next/link";
import { H1, Card } from "@/components/ui";
import { EventForm } from "@/components/EventForm";
import { hasGoogleCal, listCalendars, getEvent } from "@/lib/google-calendar";
import { fmtDate, fmtTime } from "@/lib/data-day";

export const dynamic = "force-dynamic";

export default async function EventPage({ params, searchParams }: PageProps<"/calendar/e/[cal]/[id]">) {
  const { cal, id } = await params;
  const sp = await searchParams;
  if (!hasGoogleCal()) return <><H1>Event</H1><Card>Google Calendar is not connected to the app.</Card></>;
  let calendars;
  try { calendars = await listCalendars(); }
  catch (e) { return <><H1>Event</H1><Card>Google Calendar did not answer: {(e as Error).message.slice(0, 300)}</Card></>; }
  let event; try { event = await getEvent(decodeURIComponent(cal), decodeURIComponent(id), calendars); } catch { event = null; }
  if (!event) return <><H1>Event</H1><Card>This event is no longer in Google Calendar. <Link href="/calendar" className="font-semibold text-accent">Back to the calendar</Link></Card></>;
  const edit = sp.edit === "1";
  return (
    <>
      <H1 right={!edit ? <Link href={`?edit=1`} className="font-semibold text-accent">Edit</Link> : undefined}>{edit ? "Edit event" : event.title}</H1>
      {sp.saved === "1" && <Card className="mb-3 border-accent"><div className="text-[11px] font-bold tracking-wide text-accent">SAVED TO GOOGLE CALENDAR</div><div className="text-sm">Read back from Google just now, so your phone has it too.</div></Card>}
      {edit ? <EventForm calendars={calendars} event={event} /> : (
        <Card>
          <div className="font-semibold">{fmtDate(event.date, { weekday: "long", month: "long", day: "numeric" })}{event.allDay ? (event.endDate !== event.date ? ` to ${fmtDate(event.endDate, { weekday: "long", month: "long", day: "numeric" })} · all day` : " · all day") : ` · ${fmtTime(event.start!)}${event.end ? ` – ${fmtTime(event.end)}` : ""}`}</div>
          {event.location && <div className="text-sm mt-1">{event.location}</div>}
          <div className="text-xs text-muted mt-1 flex items-center gap-1.5">{event.color && <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: event.color }} />}{event.calendarName}{event.recurrence ? " · repeats" : ""}</div>
          <div className="text-sm mt-2">Reminders: {event.reminders.useDefault ? "the calendar's default" : event.reminders.overrides.length ? event.reminders.overrides.map((r) => `${r.minutes === 0 ? "at the time" : r.minutes % 1440 === 0 ? `${r.minutes / 1440} day${r.minutes === 1440 ? "" : "s"} before` : r.minutes % 60 === 0 ? `${r.minutes / 60} h before` : `${r.minutes} min before`}${r.method === "email" ? " (email)" : ""}`).join(", ") : "none"}</div>
          {event.attendees.length > 0 && <div className="text-sm mt-1">Guests: {event.attendees.map((a) => a.name || a.email).join(", ")}</div>}
          {event.description && <div className="text-sm mt-2 whitespace-pre-wrap text-muted">{event.description}</div>}
          {event.htmlLink && <a href={event.htmlLink} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-accent mt-3">Open in Google Calendar</a>}
        </Card>
      )}
    </>
  );
}
