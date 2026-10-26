import "server-only";
import type { Tool } from "@/lib/tools/types";
import { moveEventTime, removeEvent } from "@/app/calendar/actions";
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
      return { ok: true, summary: `${evs.length} event${evs.length === 1 ? "" : "s"} from ${from}. Each carries calendarId and id for calendar.move / calendar.remove.`, data: evs.map((e) => ({ id: e.id, calendarId: e.calendarId, calendar: e.calendarName, name: e.title, title: e.title, date: e.date, start: e.start, end: e.end, allDay: e.allDay, where: e.location, href: `/calendar/e/${encodeURIComponent(e.calendarId)}/${encodeURIComponent(e.id)}` })) };
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
  {
    name: "calendar.move", title: "Move an event", kind: "write", tier: 2,
    description: "Move a timed event to a new start time on the same day. Find it with calendar.find first (it carries calendarId, id, date, start). Events with guests or that repeat are not moved from here, and a clash with another event stops it.",
    input: {
      calendarId: { type: "string", describe: "From calendar.find", required: true },
      id: { type: "string", describe: "The event's id from calendar.find", required: true },
      date: { type: "date", describe: "The day it is on", required: true },
      oldStart: { type: "string", describe: "Its current start, HH:MM", required: true },
      newStart: { type: "string", describe: "The new start, HH:MM", required: true },
      newEnd: { type: "string", describe: "The new end, HH:MM; default keeps the same length", required: false },
    },
    async run(a, c) {
      const span = (s: string, e: string) => (Number(e.slice(0, 2)) * 60 + Number(e.slice(3))) - (Number(s.slice(0, 2)) * 60 + Number(s.slice(3)));
      const evs = await listEvents(str(a.date), str(a.date));
      const cur = evs.find((e) => e.id === str(a.id) && e.calendarId === str(a.calendarId));
      if (!cur || !cur.start || !cur.end) return { ok: false, error: "That event is not on that day, or it is all-day." };
      const len = Math.max(15, span(cur.start, cur.end));
      const ns = str(a.newStart);
      const ne = str(a.newEnd) || (() => { const m = Number(ns.slice(0, 2)) * 60 + Number(ns.slice(3)) + len; return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; })();
      const r = await moveEventTime({ calendarId: str(a.calendarId), id: str(a.id), date: str(a.date), oldStart: str(a.oldStart), newStart: ns, newEnd: ne }, `Ask (${c.email})`);
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, summary: `Moved "${r.event.title}" to ${ns}–${ne} on ${str(a.date)}.`, href: `/calendar/e/${encodeURIComponent(r.event.calendarId)}/${encodeURIComponent(r.event.id)}` };
    },
  },
  {
    name: "calendar.remove", title: "Remove an event", kind: "write", tier: 3,
    description: "Take an event off the calendar. Find it with calendar.find first. This is the one thing on the calendar that cannot be undone from here, so it always asks for an explicit confirm.",
    input: { calendarId: { type: "string", describe: "From calendar.find", required: true }, id: { type: "string", describe: "The event's id", required: true }, title: { type: "string", describe: "Its title, as shown, so the confirm card says what goes", required: true } },
    async run(a) {
      const r = await removeEvent(str(a.calendarId), str(a.id), str(a.title));
      if (!r.ok) return { ok: false, error: r.error ?? "Could not remove it." };
      return { ok: true, summary: `Removed "${str(a.title)}" from the calendar.`, href: "/calendar" };
    },
  },
];
