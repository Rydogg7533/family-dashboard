"use client";
// New or edit event, written straight to Google Calendar. Google's own limits apply: up to 5 reminders.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GCal, GEvent, Reminder } from "@/lib/google-calendar";
import { saveEvent, type EventForm as Form } from "@/app/calendar/actions";
import { Fold } from "@/components/Fold";

const REMINDER_PRESETS: [string, number][] = [["At the time", 0], ["10 min before", 10], ["30 min before", 30], ["1 hour before", 60], ["2 hours before", 120], ["1 day before", 1440], ["2 days before", 2880], ["1 week before", 10080]];
const REPEATS: [string, string | null][] = [["Does not repeat", null], ["Every day", "RRULE:FREQ=DAILY"], ["Every week", "RRULE:FREQ=WEEKLY"], ["Every 2 weeks", "RRULE:FREQ=WEEKLY;INTERVAL=2"], ["Every month", "RRULE:FREQ=MONTHLY"], ["Every year", "RRULE:FREQ=YEARLY"], ["Weekdays", "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"]];
const field = "min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-[16px]";
const label = "text-[11px] font-bold tracking-wide text-muted";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const nextHour = () => { const d = new Date(); d.setMinutes(0); d.setHours(d.getHours() + 1); return `${String(d.getHours()).padStart(2, "0")}:00`; };
const plusHour = (t: string) => { const [h, m] = t.split(":").map(Number); return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`; };
const describeReminder = (r: Reminder) => `${REMINDER_PRESETS.find((p) => p[1] === r.minutes)?.[0] ?? (r.minutes % 1440 === 0 ? `${r.minutes / 1440} days before` : r.minutes % 60 === 0 ? `${r.minutes / 60} hours before` : `${r.minutes} min before`)}${r.method === "email" ? " (email)" : ""}`;

export function EventForm({ calendars, event, prefill }: { calendars: GCal[]; event?: GEvent; prefill?: Partial<Form> }) {
  const router = useRouter();
  const writable = calendars.filter((c) => c.canWrite);
  const [f, setF] = useState<Form>(() => event
    ? { id: event.id, fromCalendarId: event.calendarId, title: event.title, calendarId: event.calendarId, allDay: event.allDay, date: event.date, endDate: event.endDate, start: event.start, end: event.end, location: event.location, description: (event.description ?? "").split(/\n\n(?=From a message: |Added in StewardOS by )/)[0], reminders: event.reminders.useDefault ? null : event.reminders.overrides, recurrence: event.recurrence, attendees: event.attendees.map((a) => a.email) }
    : { title: "", calendarId: writable.find((c) => c.primary)?.id ?? writable[0]?.id ?? "", allDay: false, date: today(), endDate: undefined, start: nextHour(), end: plusHour(nextHour()), location: "", description: "", reminders: null, recurrence: null, attendees: [], ...prefill });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [customMin, setCustomMin] = useState("");
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const rems = f.reminders ?? [];
  const addRem = (minutes: number, method: Reminder["method"] = "popup") => { if (rems.length >= 5 || rems.some((r) => r.minutes === minutes && r.method === method)) return; set({ reminders: [...rems, { method, minutes }].sort((a, b) => a.minutes - b.minutes) }); };
  const save = async () => {
    setBusy(true); setErr(null);
    const r = await saveEvent({ ...f, end: f.allDay ? null : f.end, start: f.allDay ? null : f.start });
    setBusy(false);
    if (r.ok) router.push(`/calendar/e/${encodeURIComponent(r.event.calendarId)}/${encodeURIComponent(r.event.id)}?saved=1`);
    else setErr(r.error);
  };

  return (
    <div className="flex flex-col gap-3">
      <input className={`${field} text-lg font-semibold`} placeholder="Title" value={f.title} onChange={(e) => set({ title: e.target.value })} autoFocus={!event} />
      {prefill?.fromMessage && <div className="text-xs text-muted">From a message: “{prefill.fromMessage}”</div>}

      <div>
        <div className={label}>CALENDAR</div>
        <div className="flex flex-wrap gap-1.5 mt-1">{writable.map((c) => <button key={c.id} type="button" onClick={() => set({ calendarId: c.id })} className={`min-h-9 px-3 rounded-full text-sm font-semibold flex items-center gap-1.5 ${f.calendarId === c.id ? "bg-accent text-white" : "bg-soft"}`}>{c.color && <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />}{c.name}</button>)}</div>
      </div>

      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.allDay} onChange={(e) => set({ allDay: e.target.checked })} className="w-5 h-5" /> All day</label>
      <div className="flex gap-2">
        <div className="flex-1"><div className={label}>{f.allDay ? "FROM" : "DATE"}</div><input type="date" className={field} value={f.date} onChange={(e) => set({ date: e.target.value, endDate: f.endDate && f.endDate < e.target.value ? e.target.value : f.endDate })} /></div>
        {f.allDay
          ? <div className="flex-1"><div className={label}>TO</div><input type="date" className={field} value={f.endDate ?? f.date} min={f.date} onChange={(e) => set({ endDate: e.target.value })} /></div>
          : <>
            <div className="w-28"><div className={label}>START</div><input type="time" className={field} value={f.start ?? ""} onChange={(e) => set({ start: e.target.value, end: f.end && f.end <= e.target.value ? plusHour(e.target.value) : f.end })} /></div>
            <div className="w-28"><div className={label}>END</div><input type="time" className={field} value={f.end ?? ""} onChange={(e) => set({ end: e.target.value })} /></div>
          </>}
      </div>
      {!f.allDay && <div><div className={label}>ENDS ON A LATER DAY?</div><input type="date" className={field} value={f.endDate ?? ""} min={f.date} placeholder="Same day" onChange={(e) => set({ endDate: e.target.value || undefined })} /></div>}

      <div><div className={label}>WHERE</div><input className={field} placeholder="Place or address" value={f.location ?? ""} onChange={(e) => set({ location: e.target.value })} /></div>
      <div><div className={label}>NOTES</div><textarea className={`${field} min-h-20 py-2`} value={f.description ?? ""} onChange={(e) => set({ description: e.target.value })} /></div>
      <Fold id="event-more" title="More" summary={[f.recurrence ? "repeats" : "", (f.attendees ?? []).length ? `${(f.attendees ?? []).length} guest${(f.attendees ?? []).length === 1 ? "" : "s"}` : "", f.reminders === null ? "default reminders" : `${rems.length} reminder${rems.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}>
        <div className="flex flex-col gap-3">
      <div><div className={label}>REPEAT</div>
        <select className={field} value={f.recurrence?.[0] ?? ""} onChange={(e) => set({ recurrence: e.target.value ? [e.target.value] : null })}>{REPEATS.map(([l, v]) => <option key={l} value={v ?? ""}>{l}</option>)}</select>
      </div>
      <div><div className={label}>GUESTS (EMAIL, COMMA-SEPARATED)</div><input className={field} inputMode="email" placeholder="Optional; they get Google's invitation" value={(f.attendees ?? []).join(", ")} onChange={(e) => set({ attendees: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></div>

      <div>
        <div className={label}>REMINDERS {f.reminders === null ? "· using the calendar's default" : `· ${rems.length} of 5`}</div>
        <div className="flex flex-col gap-1 mt-1">
          {rems.map((r, i) => <div key={i} className="flex items-center justify-between rounded-lg bg-soft px-3 min-h-10 text-sm"><span>{describeReminder(r)}</span><button type="button" className="text-accent font-semibold" onClick={() => set({ reminders: rems.filter((_, j) => j !== i) })}>Remove</button></div>)}
          {f.reminders === null && <button type="button" className="min-h-10 rounded-lg border border-line text-sm font-semibold text-accent" onClick={() => set({ reminders: [] })}>Set my own reminders</button>}
        </div>
        {f.reminders !== null && rems.length < 5 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {REMINDER_PRESETS.map(([l, m]) => <button key={m} type="button" onClick={() => addRem(m)} className="min-h-9 px-3 rounded-full bg-soft text-sm font-semibold">+ {l}</button>)}
            <div className="flex gap-1 items-center"><input className="min-h-9 w-20 rounded-lg border border-line bg-bg px-2 text-sm" inputMode="numeric" placeholder="min" value={customMin} onChange={(e) => setCustomMin(e.target.value.replace(/\D/g, ""))} /><button type="button" className="min-h-9 px-3 rounded-full bg-soft text-sm font-semibold" onClick={() => { if (customMin) { addRem(Number(customMin)); setCustomMin(""); } }}>+ min before</button></div>
            {rems.length > 0 && <button type="button" onClick={() => addRem(rems[rems.length - 1].minutes, "email")} className="min-h-9 px-3 rounded-full bg-soft text-sm font-semibold">+ same by email</button>}
          </div>
        )}
        {f.reminders !== null && rems.length === 0 && <div className="text-xs text-muted mt-1">No reminders. Add one above, or leave it.</div>}
      </div>

        </div>
      </Fold>
      {err && <div className="text-sm text-red">{err}</div>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={save} className="flex-1 min-h-12 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">{busy ? "Saving to Google…" : event ? "Save changes" : "Add to Google Calendar"}</button>
        <button type="button" disabled={busy} onClick={() => router.back()} className="min-h-12 px-4 rounded-xl border border-line font-semibold">Cancel</button>
      </div>
    </div>
  );
}
