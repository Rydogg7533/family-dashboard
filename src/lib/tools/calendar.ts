import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";
import { addDaysIso, hasGoogleCal, insertEvent, listEvents, shownCalendars } from "@/lib/google-calendar";

// Events live in Google. These read and write them there, never a copy here.
export const calendarTools: Tool[] = [
  {
    name: "calendar.find", title: "Look at the calendar", kind: "read", tier: 1,
    description: "What is on the calendar between two days, across the calendars this person follows.",
    input: {
      from: { type: "date", describe: "First day. Defaults to today.", required: false },
      days: { type: "number", describe: "How many days to look ahead. Defaults to 14.", required: false },
    },
    async run(a, c) {
      if (!hasGoogleCal()) return { ok: false, error: "No calendar is connected." };
      const from = str(a.from) || c.today;
      const span = Math.min(90, Math.max(1, Number(a.days) || 14));
      const evs = await listEvents(from, addDaysIso(from, span));
      return { ok: true, summary: `${evs.length} event${evs.length === 1 ? "" : "s"} from ${from}`, data: evs.map((e) => ({ id: e.id, calendar: e.calendarName, title: e.title, date: e.date, start: e.start, end: e.end, allDay: e.allDay, where: e.location })) };
    },
  },
  {
    name: "calendar.add", title: "Add to the calendar", kind: "write", tier: 2,
    description: "Put an event on the calendar. It is written to Google, where the household's events live.",
    input: {
      title: { type: "string", describe: "What the event is called", required: true },
      date: { type: "date", describe: "The day it is on", required: true },
      start: { type: "string", describe: "Start time, HH:MM on a 24-hour clock. Leave out for an all-day event.", required: false },
      end: { type: "string", describe: "End time, HH:MM. Defaults to an hour after the start.", required: false },
      where: { type: "string", describe: "Where it is", required: false },
      note: { type: "string", describe: "Anything else to put in the event's notes", required: false },
    },
    async run(a) {
      if (!hasGoogleCal()) return { ok: false, error: "No calendar is connected." };
      const cals = await shownCalendars();
      const target = cals.find((x) => x.primary && x.canWrite) ?? cals.find((x) => x.canWrite);
      if (!target) return { ok: false, error: "No calendar here can be written to." };
      const allDay = !str(a.start);
      const e = await insertEvent({
        title: str(a.title).slice(0, 200), calendarId: target.id, allDay, date: str(a.date),
        start: str(a.start) || null, end: str(a.end) || null, location: str(a.where) || null, description: str(a.note) || null,
      });
      return { ok: true, summary: `${e.title} on ${e.date}${e.start ? ` at ${e.start}` : ", all day"} · ${target.name}`, href: `/calendar/e/${encodeURIComponent(e.calendarId)}/${encodeURIComponent(e.id)}` };
    },
  },
];
