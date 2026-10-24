"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const router = useRouter();
  const reset = useSearchParams().get("reset");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setErr("That didn't work. Check the email and password."); else { router.replace("/"); router.refresh(); }
  }
  const input = "w-full min-h-12 rounded-xl border border-line bg-bg px-4 text-base";
  return (
    <div className="pt-16">
      <h1 className="text-3xl mb-1">Family Dashboard</h1>
      <p className="text-muted mb-6">Sign in to see what needs you.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-sm font-semibold">Email<input className={input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="text-sm font-semibold">Password<input className={input} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        {reset && !err && <div className="text-amber text-sm">{reset === "expired" ? "That reset link has expired or was already used. Ask for a new one below." : "That reset link was not valid. Ask for a new one below."}</div>}
        {err && <div className="text-red text-sm">{err}</div>}
        <button className="min-h-12 rounded-xl bg-accent text-white font-semibold disabled:opacity-50" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="text-sm mt-4 flex gap-4"><Link href="/forgot-password" className="font-semibold text-accent">Forgot password?</Link><Link href="/login/pin" className="font-semibold text-accent">Kid with a code?</Link></p>
      <p className="text-xs text-muted mt-6">No sign-up here. Parents are created when the household is set up; children are added by a parent.</p>
    </div>
  );
}
