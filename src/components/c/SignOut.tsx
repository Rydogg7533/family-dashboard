"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Signs this device out of the household. Only this device: other phones stay signed in.
export default function SignOut({ who }: { who: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await createClient().auth.signOut(); } finally { router.replace("/login"); router.refresh(); } };
  return (
    <div className="card mt-4">
      <div className="font-semibold">Sign out</div>
      <div className="text-xs text-muted mt-1">Signs {who} out on this device only. You’ll need your password to get back in; if you’ve forgotten it, the sign-in page has a reset link.</div>
      {confirm
        ? <div className="flex gap-2 mt-3"><button type="button" disabled={busy} onClick={go} className="flex-1 min-h-11 rounded-xl bg-red text-white text-sm font-semibold disabled:opacity-60">{busy ? "Signing out…" : "Yes, sign out"}</button><button type="button" onClick={() => setConfirm(false)} className="min-h-11 px-4 rounded-xl bg-soft text-sm font-semibold">Stay</button></div>
        : <button type="button" onClick={() => setConfirm(true)} className="mt-3 min-h-11 px-4 rounded-xl bg-soft text-sm font-semibold">Sign out on this device</button>}
    </div>
  );
}
