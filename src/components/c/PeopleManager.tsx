"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addChild, createChildLogin, setChildLoginAge, setHouseholdLoginAge } from "@/app/settings/people/children-actions";
import { ageFloor, ageText, loginAllowed, minAgeFor, type ChildRow } from "@/lib/children";

const input = "w-full min-h-11 px-3 rounded-xl border border-line bg-bg text-base";
const btn = "min-h-11 px-4 rounded-xl text-sm font-semibold disabled:opacity-50";

export function PeopleManager({ parents, kids, householdMin, canEdit }: { parents: string[]; kids: ChildRow[]; householdMin: number; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear - 8));
  const [minAge, setMinAge] = useState(String(householdMin));
  const [loginFor, setLoginFor] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [made, setMade] = useState<{ name: string; email: string; password: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => { setErr(null); start(async () => { try { const r = await fn(); if (!r.ok) { setErr(r.error ?? "That didn't work."); return; } after?.(); router.refresh(); } catch { setErr("That took too long. Try again."); } }); };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="card">
        <div className="font-semibold">Parents</div>
        <div className="text-xs text-muted mt-1">{parents.join(", ") || "None yet"}</div>
      </div>

      <div className="card flex flex-col gap-3">
        <div className="font-semibold">Children</div>
        {kids.length === 0 && <div className="text-xs text-muted">No children added yet.</div>}
        {kids.map((k) => {
          const allowed = loginAllowed(k, householdMin);
          const min = minAgeFor(k, householdMin);
          return (
            <div key={k.id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
              <div className="flex justify-between gap-2 items-baseline"><div className="font-semibold">{k.display_name}</div><div className="text-xs text-muted">born {k.birth_year} · about {ageText(k.birth_year)}</div></div>
              <Link href={`/settings/people/${k.id}`} className="inline-block mt-1 text-xs font-semibold text-accent">What {k.display_name} can see and do ›</Link>
              {k.profile_id ? <div className="text-xs text-green mt-1">Has a login. It opens the kid page and sees only their own things.</div> : (
                <div className="mt-1">
                  <div className="text-xs text-muted">{allowed ? "Can have a login." : `No personal login until age ${min}. Their schedule and jobs can still show on a shared screen.`}</div>
                  {canEdit && (loginFor === k.id ? (
                    <div className="flex flex-col gap-2 mt-2">
                      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" placeholder="Email for their login" className={input} />
                      <div className="text-xs text-muted">A parent&apos;s address works (for example name+kid@gmail.com). You get a temporary password to give them once.</div>
                      <div className="flex gap-2">
                        <button type="button" disabled={pending || !email.trim()} className={`${btn} bg-accent text-white`} onClick={() => run(async () => { const r = await createChildLogin(k.id, email); if (r.ok) { setMade({ name: r.name, email: r.email, password: r.password }); return { ok: true }; } return r; }, () => { setLoginFor(null); setEmail(""); })}>{pending ? "Creating…" : "Create login"}</button>
                        <button type="button" className={`${btn} bg-soft`} onClick={() => { setLoginFor(null); setErr(null); }}>Cancel</button>
                      </div>
                    </div>
                  ) : allowed ? (
                    <button type="button" className={`${btn} bg-soft mt-2`} onClick={() => { setLoginFor(k.id); setMade(null); setErr(null); }}>Create login</button>
                  ) : (
                    <button type="button" disabled={pending} className={`${btn} bg-soft mt-2`} onClick={() => run(() => setChildLoginAge(k.id, Math.max(3, ageFloor(k.birth_year))))}>Allow a login for {k.display_name} now</button>
                  ))}
                </div>
              )}
              {canEdit && k.login_min_age != null && !k.profile_id && <button type="button" disabled={pending} className="text-xs font-semibold text-accent mt-1" onClick={() => run(() => setChildLoginAge(k.id, null))}>Back to the household age ({householdMin})</button>}
            </div>
          );
        })}
      </div>

      {made && (
        <div className="card flex flex-col gap-2 border-accent">
          <div className="font-semibold">Login made for {made.name}: shown only now</div>
          <div className="text-xs text-muted">Give them the email and this temporary password. They change it after signing in. Copy it now; it can&apos;t be shown again.</div>
          <div className="font-mono text-xs break-all select-all rounded-xl border border-line p-2">{made.email}</div>
          <div className="font-mono text-sm break-all select-all rounded-xl border border-line p-2">{made.password}</div>
          <button type="button" className={`${btn} bg-soft`} onClick={() => setMade(null)}>I&apos;ve saved it</button>
        </div>
      )}

      {canEdit && (
        <div className="card flex flex-col gap-2">
          <div className="font-semibold">Add a child</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={input} autoCapitalize="words" />
          <label className="text-xs font-semibold">Birth year
            <select value={year} onChange={(e) => setYear(e.target.value)} className={`${input} mt-1`}>{Array.from({ length: 19 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y}</option>)}</select>
          </label>
          <div className="text-xs text-muted">Only the year is saved; that is enough to check the login age.</div>
          <button type="button" disabled={pending || !name.trim()} className={`${btn} bg-accent text-white`} onClick={() => run(() => addChild(name, Number(year)), () => setName(""))}>{pending ? "Adding…" : "Add child"}</button>
        </div>
      )}

      {canEdit && (
        <div className="card flex flex-col gap-2">
          <div className="font-semibold">Login age</div>
          <div className="text-xs text-muted">Children below this age have no personal login. A parent can allow one earlier for a single child.</div>
          <div className="flex gap-2 items-center">
            <select value={minAge} onChange={(e) => setMinAge(e.target.value)} className={`${input} !w-24`}>{Array.from({ length: 15 }, (_, i) => i + 3).map((a) => <option key={a} value={a}>{a}</option>)}</select>
            <button type="button" disabled={pending || Number(minAge) === householdMin} className={`${btn} bg-soft`} onClick={() => run(() => setHouseholdLoginAge(Number(minAge)))}>Save</button>
          </div>
        </div>
      )}
      {err && <div role="alert" className="rounded-xl bg-red-bg text-red px-3 py-2 font-semibold">{err}</div>}
    </div>
  );
}
