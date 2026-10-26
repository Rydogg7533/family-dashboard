"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveHousehold } from "@/app/settings/household/actions";

const COMMON = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "Europe/London",
];
const field = "w-full min-h-11 rounded-xl border border-line bg-bg px-3 text-sm";
const label = (z: string) => `${z.split("/").pop()!.replace(/_/g, " ")} — ${z}`;

export function HouseholdForm({ name: name0, tz: tz0 }: { name: string; tz: string }) {
  const router = useRouter();
  const [name, setName] = useState(name0);
  const [tz, setTz] = useState(tz0);
  const [other, setOther] = useState(!COMMON.includes(tz0));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [busy, start] = useTransition();
  const device = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  const now = (() => { try { return new Date().toLocaleString("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }); } catch { return null; } })();

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null); setErr(false);
    start(async () => {
      const r = await saveHousehold(name, tz);
      if (!r.ok) { setErr(true); setMsg(r.error ?? "Could not save."); return; }
      setMsg("Saved."); router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <section className="card flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold">Household name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Rossiter" />
        </label>
      </section>

      <section className="card flex flex-col gap-3">
        <div className="font-bold">Time zone</div>
        <p className="text-xs text-muted">This decides what “today” means everywhere: the calendar and new events, a sitter’s leave-by time, and which month the money routine is working on.</p>
        {!other ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold">Zone</span>
            <select className={field} value={tz} onChange={(e) => { if (e.target.value === "__other") { setOther(true); } else setTz(e.target.value); }}>
              {COMMON.map((z) => <option key={z} value={z}>{label(z)}</option>)}
              <option value="__other">Somewhere else…</option>
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold">Zone</span>
            <input className={field} value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Europe/Madrid" />
            <span className="text-[11px] text-muted">An IANA name, like Europe/Madrid or Asia/Tokyo. <button type="button" className="font-semibold text-accent" onClick={() => { setOther(false); setTz(COMMON[2]); }}>Pick from the list instead</button></span>
          </label>
        )}
        <div className="text-xs text-muted">{now ? <>It is <span className="font-semibold text-fg">{now}</span> there.</> : <span className="text-red font-semibold">Not a time zone this app knows.</span>}</div>
        {device && device !== tz && (
          <button type="button" className="self-start text-xs font-semibold text-accent" onClick={() => { setTz(device); setOther(!COMMON.includes(device)); }}>Use this device’s zone ({device})</button>
        )}
      </section>

      {msg && <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${err ? "bg-red-bg text-red" : "bg-green-bg text-green"}`}>{msg}</div>}
      <button disabled={busy} className="min-h-12 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
      <p className="text-xs text-muted">Changing the zone does not move any event. Events live in Google Calendar with their own zone; this is the clock the app reads them against.</p>
    </form>
  );
}
