"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addChild, setBirthDate, createChildLogin, createChildInvite, revokeChildInvite, setChildLoginAge, setHouseholdLoginAge } from "@/app/settings/people/children-actions";
import type { InviteRow } from "@/lib/data-children";
import { ageFloor, ageOf, loginAllowed, minAgeFor, type ChildRow } from "@/lib/children";

const input = "w-full min-h-11 px-3 rounded-xl border border-line bg-bg text-base";
const btn = "min-h-11 px-4 rounded-xl text-sm font-semibold disabled:opacity-50";

// A birthday: the date, the age it makes, and a tap to set or correct it. A row saved before dates were
// kept shows the year it has and asks for the rest.
function Birthday({ who, id, date, today, canEdit, fallbackYear }: { who: "child" | "profile"; id: string; date: string | null; today: string; canEdit: boolean; fallbackYear?: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(date ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const save = () => start(async () => {
    const r = await setBirthDate(who, id, v);
    if (!("ok" in r) || !r.ok) { setErr(("error" in r && r.error) || "Could not save."); return; }
    setErr(null); setOpen(false); router.refresh();
  });
  const shown = date ? `${new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })} · ${ageOf({ birth_year: Number(date.slice(0, 4)), birth_date: date }, today)}`
    : fallbackYear ? `born ${fallbackYear} · about ${ageOf({ birth_year: fallbackYear, birth_date: null }, today)}` : "No birthday yet";
  if (!open) return (
    <div className="text-xs text-muted text-right shrink-0">
      {shown}{canEdit && <> · <button type="button" className="font-semibold text-accent" onClick={() => setOpen(true)}>{date ? "Change" : "Add"}</button></>}
    </div>
  );
  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex gap-1.5 items-center">
        <input type="date" value={v} max={today} onChange={(e) => setV(e.target.value)} className="min-h-9 rounded-lg border border-line bg-bg px-2 text-xs" />
        <button type="button" disabled={busy || !v} className="min-h-9 px-2.5 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-50" onClick={save}>{busy ? "…" : "Save"}</button>
        <button type="button" className="min-h-9 px-2 text-xs font-semibold text-muted" onClick={() => { setOpen(false); setErr(null); }}>Cancel</button>
      </div>
      {err && <div className="text-[11px] font-semibold text-red">{err}</div>}
    </div>
  );
}

export function PeopleManager({ parents, kids, householdMin, canEdit, today, invites = [] }: { parents: { id: string; name: string; birth_date: string | null }[]; kids: ChildRow[]; householdMin: number; canEdit: boolean; today: string; invites?: InviteRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const thisYear = Number(today.slice(0, 4));
  const todayMax = today;
  const [dob, setDob] = useState("");
  const [minAge, setMinAge] = useState(String(householdMin));
  const [loginFor, setLoginFor] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [made, setMade] = useState<{ name: string; email: string; password: string } | null>(null);
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ name: string; link: string; qr: string; expires: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => { setErr(null); start(async () => { try { const r = await fn(); if (!r.ok) { setErr(r.error ?? "That didn't work."); return; } after?.(); router.refresh(); } catch { setErr("That took too long. Try again."); } }); };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="card">
        <div className="font-semibold">Parents</div>
        <div className="flex flex-col gap-1 mt-1">
          {parents.length === 0 && <div className="text-xs text-muted">None yet</div>}
          {parents.map((p) => (
            <div key={p.id} className="flex justify-between gap-2 items-baseline">
              <div className="text-sm">{p.name}</div>
              <Birthday who="profile" id={p.id} date={p.birth_date} today={today} canEdit={canEdit} />
            </div>
          ))}
        </div>
      </div>

      <div className="card flex flex-col gap-3">
        <div className="font-semibold">Children</div>
        {kids.length === 0 && <div className="text-xs text-muted">No children added yet.</div>}
        {kids.map((k) => {
          const allowed = loginAllowed(k, householdMin, today);
          const min = minAgeFor(k, householdMin);
          return (
            <div key={k.id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
              <div className="flex justify-between gap-2 items-baseline"><div className="font-semibold">{k.display_name}</div><Birthday who="child" id={k.id} date={k.birth_date ?? null} today={today} canEdit={canEdit} fallbackYear={k.birth_year} /></div>
              <Link href={`/settings/people/${k.id}`} className="inline-block mt-1 text-xs font-semibold text-accent">What {k.display_name} can see and do ›</Link>
              {k.profile_id ? <div className="text-xs text-green mt-1">Has a login{k.pin_login ? " with a 6-digit code" : ""}. It opens the kid page and sees only their own things.</div> : (
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
                  ) : inviteFor === k.id ? (
                    <div className="flex flex-col gap-2 mt-2">
                      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" placeholder="Email for their login" className={input} />
                      <div className="text-xs text-muted">A parent&apos;s address works (for example name+kid@gmail.com). They never see it; they sign in with their name and a 6-digit code they pick themselves.</div>
                      <div className="flex gap-2">
                        <button type="button" disabled={pending || !email.trim()} className={`${btn} bg-accent text-white`} onClick={() => run(async () => { const r = await createChildInvite(k.id, email); if (r.ok) { setInvite({ name: r.name, link: r.link, qr: r.qr, expires: r.expires }); setCopied(false); return { ok: true }; } return r; }, () => { setInviteFor(null); setEmail(""); })}>{pending ? "Making…" : "Make the invite"}</button>
                        <button type="button" className={`${btn} bg-soft`} onClick={() => { setInviteFor(null); setErr(null); }}>Cancel</button>
                      </div>
                    </div>
                  ) : allowed ? (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <button type="button" className={`${btn} bg-accent text-white`} onClick={() => { setInviteFor(k.id); setLoginFor(null); setMade(null); setInvite(null); setErr(null); }}>Invite {k.display_name}</button>
                      <button type="button" className={`${btn} bg-soft`} onClick={() => { setLoginFor(k.id); setInviteFor(null); setMade(null); setErr(null); }}>Create login with a password</button>
                    </div>
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

      {invites.length > 0 && (
        <div className="card flex flex-col gap-2">
          <div className="font-semibold">Invites waiting</div>
          {invites.map((i) => { const kid = kids.find((k) => k.id === i.child_id); return (
            <div key={i.id} className="flex justify-between items-center gap-2 text-xs">
              <span>{kid?.display_name ?? "A child"} · expires {new Date(i.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              {canEdit && <button type="button" disabled={pending} className="font-semibold text-muted min-h-9" onClick={() => run(() => revokeChildInvite(i.id))}>Cancel</button>}
            </div>); })}
        </div>
      )}

      {invite && (
        <div className="card flex flex-col gap-2 border-accent">
          <div className="font-semibold">Invite for {invite.name}: shown only now</div>
          <div className="text-xs text-muted">Show them this code on your phone, or send them the link. It works once and expires {new Date(invite.expires).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. They pick their own 6-digit code when they open it.</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={invite.qr} alt="QR code for the invite link" className="w-56 h-56 self-center rounded-xl bg-white p-2" />
          <div className="font-mono text-[11px] break-all select-all rounded-xl border border-line p-2">{invite.link}</div>
          <div className="flex gap-2">
            <button type="button" className={`${btn} bg-soft`} onClick={async () => { try { await navigator.clipboard.writeText(invite.link); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy the link"}</button>
            <button type="button" className={`${btn} bg-soft`} onClick={() => setInvite(null)}>Done</button>
          </div>
        </div>
      )}

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
          <label className="text-xs font-semibold">Birth date
            <input type="date" value={dob} max={todayMax} min={`${thisYear - 40}-01-01`} onChange={(e) => setDob(e.target.value)} className={`${input} mt-1`} />
          </label>
          <div className="text-xs text-muted">The date gives the exact age for the login rule, and a birthday the household can use. A grown child keeps their place here, so it goes back 40 years.</div>
          <button type="button" disabled={pending || !name.trim() || !dob} className={`${btn} bg-accent text-white`} onClick={() => run(() => addChild(name, dob), () => { setName(""); setDob(""); })}>{pending ? "Adding…" : "Add child"}</button>
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
