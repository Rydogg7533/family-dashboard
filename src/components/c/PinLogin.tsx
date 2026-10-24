"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PinPad } from "@/components/c/PinPad";
import { pinSignIn } from "@/app/login/pin/actions";

export function PinLogin({ remembered }: { remembered: string }) {
  const router = useRouter();
  const [name, setName] = useState(remembered);
  const [editName, setEditName] = useState(!remembered);
  const [pin, setPin] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function go(p: string) {
    setBusy(true); setErr(null);
    const r = await pinSignIn(name, p); setBusy(false);
    if (!r.ok) { setErr(r.error); setPin(""); return; }
    router.replace("/kid"); router.refresh();
  }
  return (
    <div className="pt-12 flex flex-col gap-5 max-w-sm mx-auto">
      <h1 className="text-3xl">Hi{!editName && name ? `, ${name}` : ""}!</h1>
      {editName ? (
        <label className="text-sm font-semibold">Your name<input className="w-full min-h-12 rounded-xl border border-line bg-bg px-4 text-base" value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" autoComplete="off" placeholder="First name" /></label>
      ) : <button className="text-sm font-semibold text-accent self-start min-h-9" onClick={() => setEditName(true)}>Not {name}?</button>}
      <PinPad value={pin} onChange={(v) => { setPin(v); if (v.length === 6 && name.trim()) void go(v); }} disabled={busy || !name.trim()} label="Your secret code" />
      {busy && <div className="text-sm text-muted text-center">Checking…</div>}
      {err && <div className="text-red text-sm font-semibold text-center">{err}</div>}
      <p className="text-xs text-muted text-center">Forgot your code? Ask a parent for a new invite. <Link href="/login" className="font-semibold text-accent">Parent sign-in</Link></p>
    </div>
  );
}
