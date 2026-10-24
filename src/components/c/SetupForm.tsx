"use client";
import { useEffect, useState, useTransition } from "react";
import { runSetup } from "@/app/setup/actions";

const field = "w-full min-h-12 px-3 rounded-xl border border-line bg-bg text-base";
type Made = { name: string; email: string; password: string };

export default function SetupForm({ defaultTz }: { defaultTz: string }) {
  const [busy, start] = useTransition();
  const [household, setHousehold] = useState("");
  const [tz, setTz] = useState(defaultTz);
  useEffect(() => { try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; if (z) setTz(z); } catch { /* keep the default */ } }, []);
  const [p, setP] = useState([{ name: "", email: "" }, { name: "", email: "" }]);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ household: string; parents: Made[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (k: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(null), 2000); } catch { /* selectable */ } };
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    start(async () => {
      try {
        const r = await runSetup({ household, tz, parents: p.filter((x) => x.name || x.email) });
        if (!r.ok) { setErr(r.error); return; }
        setDone({ household: r.household, parents: r.parents });
      } catch { setErr("That took too long. Reload the page and check whether the parents were made before trying again."); }
    });
  };
  if (done) return (
    <div className="flex flex-col gap-3">
      <div className="card border-accent">
        <div className="font-semibold">{done.household} is set up.</div>
        <div className="text-xs text-muted mt-1">These temporary passwords are shown only now. Write them down or send each parent theirs, then sign in and change it under Settings › People and access.</div>
      </div>
      {done.parents.map((m) => (
        <div key={m.email} className="card flex flex-col gap-2">
          <div className="font-semibold">{m.name}</div>
          <div className="text-xs text-muted">Email</div><div className="font-mono text-sm select-all">{m.email}</div>
          <div className="text-xs text-muted">Temporary password</div><div className="font-mono text-sm select-all rounded-xl border border-line p-2">{m.password}</div>
          <button type="button" onClick={() => copy(m.email, m.password)} className="min-h-11 rounded-xl bg-soft text-sm font-semibold">{copied === m.email ? "Copied" : "Copy password"}</button>
        </div>
      ))}
      <a href="/login" className="min-h-12 grid place-items-center rounded-xl bg-accent text-white font-semibold">Go to sign in</a>
    </div>
  );
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="text-sm font-semibold">Household name<input className={field} value={household} onChange={(e) => setHousehold(e.target.value)} placeholder="The Parkers" required autoComplete="off" /></label>
      <label className="text-sm font-semibold">Time zone<input className={field} value={tz} onChange={(e) => setTz(e.target.value)} placeholder="America/Denver" required autoComplete="off" /><span className="block text-xs text-muted font-normal mt-1">Taken from this device. Change it if the household lives elsewhere.</span></label>
      {p.map((x, i) => (
        <fieldset key={i} className="card flex flex-col gap-2">
          <legend className="text-sm font-semibold px-1">Parent {i + 1}{i === 1 ? " (optional)" : ""}</legend>
          <input className={field} value={x.name} onChange={(e) => setP(p.map((y, j) => j === i ? { ...y, name: e.target.value } : y))} placeholder="First name" aria-label={`Parent ${i + 1} name`} autoComplete="off" required={i === 0} />
          <input className={field} type="email" inputMode="email" autoCapitalize="none" value={x.email} onChange={(e) => setP(p.map((y, j) => j === i ? { ...y, email: e.target.value } : y))} placeholder="Email" aria-label={`Parent ${i + 1} email`} autoComplete="off" required={i === 0} />
        </fieldset>
      ))}
      <p className="text-xs text-muted">Both parents become owners: they see everything and can change settings. Children are added later from Settings › People and access, so no child needs an email today.</p>
      {err && <div role="alert" className="rounded-xl bg-red-bg text-red px-3 py-2 text-sm font-semibold">{err}</div>}
      <button type="submit" disabled={busy} className="min-h-12 rounded-xl bg-accent text-white font-semibold disabled:opacity-60">{busy ? "Setting up…" : "Create the household"}</button>
    </form>
  );
}
