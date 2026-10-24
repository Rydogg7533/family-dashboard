"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MIN = 10;

// Reached from the reset-email link (after /auth/callback signed the person in). Sets a new password through the person's own session.
// The same screen can serve a parent who signed in with a temporary password: it only ever changes the signed-in person's own password.
export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "none">("checking");
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState(false);
  useEffect(() => { createClient().auth.getUser().then(({ data }) => setReady(data.user ? "ok" : "none")); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    if (pw.length < MIN) { setErr(`Use at least ${MIN} characters.`); return; }
    if (pw !== pw2) { setErr("The two passwords do not match."); return; }
    setBusy(true);
    const sb = createClient();
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { setErr(error.message.includes("different") ? "Choose a password different from the old one." : "Could not save the new password. Try the link again."); setBusy(false); return; }
    await sb.from("activity_log").insert({ actor: "Member", action: "password_reset", subject: "Set a new password from a reset link", undoable: false }).then(() => {}, () => {});
    setDone(true); setBusy(false);
    setTimeout(() => { router.replace("/"); router.refresh(); }, 1200);
  }
  const input = "w-full min-h-12 rounded-xl border border-line bg-bg px-4 text-base";
  return (
    <div className="pt-16">
      <h1 className="text-3xl mb-1">Choose a new password</h1>
      {ready === "checking" && <p className="text-muted">One moment…</p>}
      {ready === "none" && <p className="text-muted">This link has expired or was already used. <a href="/forgot-password" className="font-semibold text-accent">Send a new one</a>.</p>}
      {ready === "ok" && (done ? <p className="text-muted">Saved. Taking you in…</p> : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <p className="text-muted mb-2">At least {MIN} characters. Your password manager can make one for you.</p>
          <label className="text-sm font-semibold">New password<input className={input} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
          <label className="text-sm font-semibold">Again<input className={input} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></label>
          {err && <div className="text-red text-sm">{err}</div>}
          <button className="min-h-12 rounded-xl bg-accent text-white font-semibold disabled:opacity-50" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
        </form>
      ))}
    </div>
  );
}
