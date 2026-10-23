import { H1, Card } from "@/components/ui";
import { EventForm } from "@/components/EventForm";
import { hasGoogleCal, listCalendars, googleCalAccount } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

// New event, straight into Google Calendar. ?title=&date=&time=&from= prefill it (Ask and Messages hand in here).
export default async function NewEvent({ searchParams }: PageProps<"/calendar/new">) {
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  if (!hasGoogleCal()) return <><H1>New event</H1><Card>Google Calendar is not connected to the app yet. Run the calendar sign-in on the Mac mini and add the GOOGLE_CAL settings to Vercel.</Card></>;
  let calendars;
  try { calendars = await listCalendars(); }
  catch (e) { return <><H1>New event</H1><Card>Google Calendar did not answer: {(e as Error).message.slice(0, 300)}</Card></>; }
  return (
    <>
      <H1>New event</H1>
      <div className="text-xs text-muted mb-3">Saved to {googleCalAccount()}. Reminders and guests come from Google, so they work on your phone too.</div>
      <EventForm calendars={calendars} prefill={{ title: s("title"), date: s("date"), start: s("time"), end: s("end"), allDay: s("allday") === "1", location: s("where"), fromMessage: s("from") ?? null, origin: s("origin") ? { kind: s("origin")!, ref: s("ref") ?? null, label: s("label") ?? s("origin")! } : null }} />
    </>
  );
}
