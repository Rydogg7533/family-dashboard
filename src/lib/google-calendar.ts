import "server-only";
// Google Calendar, direct from the app (D72): Google is the only place events live. The app reads live and writes back with a
// calendar-only token (GOOGLE_CAL_* in the Vercel settings, made by `node scripts/google-auth.mjs --purpose calendar`).
// Nothing here is cached beyond the short access token; every page load asks Google, so what you see is what Google has.

export const HOUSEHOLD_TZ = process.env.HOUSEHOLD_TZ || "America/Denver";
const API = "https://www.googleapis.com/calendar/v3";

export function hasGoogleCal() { return !!(process.env.GOOGLE_CAL_CLIENT_ID && process.env.GOOGLE_CAL_CLIENT_SECRET && process.env.GOOGLE_CAL_REFRESH_TOKEN); }
export const googleCalAccount = () => process.env.GOOGLE_CAL_ACCOUNT || "Google Calendar";

export type Reminder = { method: "popup" | "email"; minutes: number };
export type GCal = { id: string; name: string; color: string | null; primary: boolean; canWrite: boolean };
export type GEvent = {
  id: string; calendarId: string; calendarName: string; color: string | null;
  title: string; description: string | null; location: string | null; htmlLink: string | null;
  allDay: boolean; date: string; endDate: string; start: string | null; end: string | null;   // date = YYYY-MM-DD in the household zone; start/end = HH:MM
  startIso: string; endIso: string;
  recurrence: string[] | null; recurringEventId: string | null;
  attendees: { email: string; name: string | null; status: string | null }[];
  reminders: { useDefault: boolean; overrides: Reminder[] };
  status: string; updated: string; creator: string | null;
};

// ---- token ----
let cached: { token: string; until: number } | null = null;
async function accessToken() {
  if (cached && cached.until > Date.now() + 30_000) return cached.token;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CAL_CLIENT_ID!, client_secret: process.env.GOOGLE_CAL_CLIENT_SECRET!, refresh_token: process.env.GOOGLE_CAL_REFRESH_TOKEN!, grant_type: "refresh_token" }), cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(`Google sign-in failed (${j.error || r.status}): ${j.error_description || "the calendar token may have been revoked"}`);
  cached = { token: j.access_token, until: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}
async function g<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tok = await accessToken();
  let r: Response | null = null;
  for (let i = 1; i <= 3; i++) {
    try { r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", ...(init.headers || {}) }, cache: "no-store" }); }
    catch (e) { if (i === 3) throw e; await new Promise((ok) => setTimeout(ok, 400 * i)); continue; }
    if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 600 * i)); continue; }
    break;
  }
  if (!r) throw new Error("Google Calendar: no response");
  if (r.status === 204) return undefined as T;
  const t = await r.text();
  if (!r.ok) throw new Error(`Google Calendar ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : (undefined as T);
}

// ---- dates in the household zone ----
const partsIn = (iso: string, tz = HOUSEHOLD_TZ) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
};
// "2026-10-23" + "15:00" on the household clock → RFC3339 with that zone's offset at that moment (DST-correct).
export function localToIso(date: string, time: string, tz = HOUSEHOLD_TZ) {
  const [y, mo, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);                 // the wall-clock reading, pretending it is UTC
  const offsetAt = (ms: number) => { const p = partsIn(new Date(ms).toISOString(), tz); const [py, pm, pd] = p.date.split("-").map(Number), [ph, pmi] = p.time.split(":").map(Number); return Date.UTC(py, pm - 1, pd, ph, pmi) - ms; };
  let off = offsetAt(naive); off = offsetAt(naive - off);       // second pass settles a DST boundary
  const min = off / 60000, sign = min >= 0 ? "+" : "-", a = Math.abs(min);
  return `${date}T${time}:00${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

type RawEvent = { id: string; summary?: string; description?: string; location?: string; htmlLink?: string; status?: string; updated?: string; colorId?: string;
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }; recurrence?: string[]; recurringEventId?: string;
  attendees?: { email: string; displayName?: string; responseStatus?: string }[]; reminders?: { useDefault?: boolean; overrides?: Reminder[] }; creator?: { email?: string } };

function toEvent(e: RawEvent, cal: GCal): GEvent {
  const allDay = !!e.start?.date;
  const startIso = e.start?.dateTime || `${e.start?.date}T00:00:00`;
  const endIso = e.end?.dateTime || `${e.end?.date}T00:00:00`;
  const s = allDay ? { date: e.start!.date!, time: null } : partsIn(startIso);
  const en = allDay ? { date: e.end!.date!, time: null } : partsIn(endIso);
  // Google's all-day end is the day AFTER the last day; show the last day.
  const endDate = allDay ? new Date(new Date(en.date + "T00:00:00Z").getTime() - 86400_000).toISOString().slice(0, 10) : en.date;
  return { id: e.id, calendarId: cal.id, calendarName: cal.name, color: cal.color, title: e.summary || "(no title)", description: e.description || null, location: e.location || null, htmlLink: e.htmlLink || null,
    allDay, date: s.date, endDate, start: s.time, end: en.time, startIso, endIso, recurrence: e.recurrence || null, recurringEventId: e.recurringEventId || null,
    attendees: (e.attendees || []).map((a) => ({ email: a.email, name: a.displayName || null, status: a.responseStatus || null })),
    reminders: { useDefault: e.reminders?.useDefault !== false, overrides: (e.reminders?.overrides || []).map((o) => ({ method: o.method, minutes: o.minutes })) },
    status: e.status || "confirmed", updated: e.updated || "", creator: e.creator?.email || null };
}

// ---- reads ----
export async function listCalendars(): Promise<GCal[]> {
  const j = await g<{ items?: { id: string; summary: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean; accessRole?: string; selected?: boolean; hidden?: boolean }[] }>("/users/me/calendarList?maxResults=250&minAccessRole=reader");
  return (j.items || []).filter((c) => !c.hidden).map((c) => ({ id: c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor || null, primary: !!c.primary, canWrite: ["owner", "writer"].includes(c.accessRole || "") }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}
// Every event (single instances, repeats expanded) between two household-zone dates, inclusive, across the chosen calendars.
export async function listEvents(fromDate: string, toDate: string, calendars?: GCal[]): Promise<GEvent[]> {
  const cals = calendars ?? (await listCalendars());
  const timeMin = localToIso(fromDate, "00:00"), timeMax = localToIso(toDate, "23:59");
  const all = await Promise.all(cals.map(async (cal) => {
    const out: GEvent[] = []; let pageToken = "";
    do {
      const q = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", timeMin, timeMax, maxResults: "250", timeZone: HOUSEHOLD_TZ, ...(pageToken ? { pageToken } : {}) });
      const j = await g<{ items?: RawEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(cal.id)}/events?${q}`).catch(() => ({ items: [] as RawEvent[], nextPageToken: undefined }));
      for (const e of j.items || []) if (e.status !== "cancelled") out.push(toEvent(e, cal));
      pageToken = j.nextPageToken || "";
    } while (pageToken);
    return out;
  }));
  return all.flat().sort((a, b) => a.date.localeCompare(b.date) || (a.allDay ? -1 : b.allDay ? 1 : (a.start || "").localeCompare(b.start || "")));
}
export async function getEvent(calendarId: string, id: string, calendars?: GCal[]): Promise<GEvent> {
  const cals = calendars ?? (await listCalendars());
  const cal = cals.find((c) => c.id === calendarId) || { id: calendarId, name: "Calendar", color: null, primary: false, canWrite: true };
  return toEvent(await g<RawEvent>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`), cal);
}

// ---- writes (every one re-reads the event from Google afterwards, so "done" means Google has it) ----
export type EventInput = {
  title: string; calendarId: string; allDay: boolean; date: string; endDate?: string; start?: string | null; end?: string | null;
  location?: string | null; description?: string | null; reminders?: Reminder[] | null;   // null = the calendar's default; [] = none; up to 5 (Google's limit)
  recurrence?: string[] | null; attendees?: string[] | null;
};
function body(i: EventInput) {
  const endDate = i.endDate || i.date;
  const b: Record<string, unknown> = { summary: i.title.trim(), location: i.location?.trim() || null, description: i.description?.trim() || null };
  if (i.allDay) {   // Google wants the exclusive end day
    const next = new Date(new Date(endDate + "T00:00:00Z").getTime() + 86400_000).toISOString().slice(0, 10);
    b.start = { date: i.date }; b.end = { date: next };
  } else {
    const st = i.start || "09:00"; let en = i.end || null;
    if (!en) { const [h, m] = st.split(":").map(Number); const t = h * 60 + m + 60; en = `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; }
    b.start = { dateTime: localToIso(i.date, st), timeZone: HOUSEHOLD_TZ }; b.end = { dateTime: localToIso(endDate, en), timeZone: HOUSEHOLD_TZ };
  }
  if (i.reminders === null || i.reminders === undefined) b.reminders = { useDefault: true };
  else b.reminders = { useDefault: false, overrides: i.reminders.slice(0, 5).map((r) => ({ method: r.method, minutes: Math.max(0, Math.round(r.minutes)) })) };
  if (i.recurrence !== undefined) b.recurrence = i.recurrence && i.recurrence.length ? i.recurrence : [];
  if (i.attendees !== undefined) b.attendees = (i.attendees || []).filter(Boolean).map((email) => ({ email }));
  return b;
}
export async function insertEvent(i: EventInput): Promise<GEvent> {
  const made = await g<RawEvent>(`/calendars/${encodeURIComponent(i.calendarId)}/events?sendUpdates=${i.attendees?.length ? "all" : "none"}`, { method: "POST", body: JSON.stringify(body(i)) });
  return getEvent(i.calendarId, made.id);
}
export async function updateEvent(id: string, i: EventInput): Promise<GEvent> {
  await g<RawEvent>(`/calendars/${encodeURIComponent(i.calendarId)}/events/${encodeURIComponent(id)}?sendUpdates=${i.attendees?.length ? "all" : "none"}`, { method: "PATCH", body: JSON.stringify(body(i)) });
  return getEvent(i.calendarId, id);
}
export async function deleteEvent(calendarId: string, id: string): Promise<void> {
  await g<void>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}?sendUpdates=all`, { method: "DELETE" });
}
export async function moveEvent(fromCalendar: string, id: string, toCalendar: string): Promise<GEvent> {
  const r = await g<RawEvent>(`/calendars/${encodeURIComponent(fromCalendar)}/events/${encodeURIComponent(id)}/move?destination=${encodeURIComponent(toCalendar)}`, { method: "POST" });
  return getEvent(toCalendar, r.id);
}
