"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { startDemo } from "./actions";

const SPLASH_MS = 1700;

export default function DemoSignup() {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [splash, setSplash] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const res = await startDemo({ name, email, password: pw });
    if (!res.ok) { setBusy(false); setErr(res.error); return; }
    const { error } = await createClient().auth.signInWithPassword({ email: res.email, password: res.password });
    setBusy(false);
    if (error) { setErr("Your demo was created, but signing you in didn't work. Try signing in from the login page."); return; }
    setSplash(true);
    setTimeout(() => { router.replace("/"); router.refresh(); }, SPLASH_MS);
  }

  const input = "w-full min-h-12 rounded-xl border border-line bg-bg px-4 text-base";
  if (splash) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
        <span
          className="text-5xl sm:text-6xl inline-block"
          style={{ fontFamily: "'Dancing Script', cursive", color: "var(--accent)", clipPath: "inset(0 100% 0 0)", animation: `stewardos-reveal ${SPLASH_MS - 200}ms ease forwards` }}
        >
          StewardOS
        </span>
        <style>{`@keyframes stewardos-reveal { to { clip-path: inset(0 0% 0 0); } }`}</style>
      </div>
    );
  }
  return (
    <div className="pt-16">
      <h1 className="text-5xl mb-1" style={{ fontFamily: "'Dancing Script', cursive", color: "var(--accent)" }}>StewardOS</h1>
      <p className="text-muted mb-6">Try it with a household we made up -- free for 14 days, nothing to connect.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-sm font-semibold">Your name<input className={input} type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="text-sm font-semibold">Email<input className={input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="text-sm font-semibold">Password<input className={input} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} /></label>
        {err && <div className="text-red text-sm">{err}</div>}
        <button className="min-h-12 rounded-xl bg-accent text-white font-semibold disabled:opacity-50" disabled={busy}>{busy ? "Setting up your demo…" : "Start my demo"}</button>
      </form>
      <p className="text-xs text-muted mt-6">We make up a sample family -- tasks, calendar, an account with a few transactions -- so you can click around like it's already set up. Nothing you enter here touches a real household.</p>
    </div>
  );
}
