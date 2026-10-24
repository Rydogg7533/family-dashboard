"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Sends the reset email through Supabase Auth. The reply is the same whether or not the address has an account, so the page
// cannot be used to find out who is a member.
export default function ForgotPassword() {
  const [email, setEmail] = useState(""); const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
      if (error && !/rate|too many/i.test(error.message)) console.error("reset:", error.message);
      if (error && /rate|too many/i.test(error.message)) { setErr("Too many requests just now. Wait a few minutes and try once more."); return; }
      setSent(true);
    } finally { setBusy(false); }
  }
  const input = "w-full min-h-12 rounded-xl border border-line bg-bg px-4 text-base";
  return (
    <div className="pt-16">
      <h1 className="text-3xl mb-1">Forgot your password?</h1>
      {sent ? (
        <>
          <p className="text-muted mb-6">If {email.trim()} belongs to this household, a reset link is on its way. Open it on this device; it works once and expires after an hour.</p>
          <Link href="/login" className="font-semibold text-accent">Back to sign in</Link>
        </>
      ) : (
        <>
          <p className="text-muted mb-6">Type the email you sign in with. We’ll send a link to choose a new password.</p>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="text-sm font-semibold">Email<input className={input} type="email" autoComplete="username" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            {err && <div className="text-red text-sm">{err}</div>}
            <button className="min-h-12 rounded-xl bg-accent text-white font-semibold disabled:opacity-50" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
          </form>
          <p className="text-xs text-muted mt-6"><Link href="/login" className="font-semibold text-accent">Back to sign in</Link></p>
        </>
      )}
    </div>
  );
}
