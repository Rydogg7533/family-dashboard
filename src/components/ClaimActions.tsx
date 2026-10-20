"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setClaimStatus, snoozeClaim, type ClaimStatus } from "@/app/claims/actions";

export function ClaimActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go(s: ClaimStatus) { setBusy(true); await setClaimStatus(id, s); setBusy(false); router.refresh(); }
  const b = "min-h-10 px-3 rounded-full border border-line text-xs font-semibold disabled:opacity-50";
  if (["paid", "denied", "closed"].includes(status)) return <button disabled={busy} className={b} onClick={() => go("open")}>Reopen</button>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {status === "open" && <button disabled={busy} className={b} onClick={() => go("submitted")}>I submitted it</button>}
      <button disabled={busy} className={b} onClick={() => go("paid")}>Paid</button>
      <button disabled={busy} className={b} onClick={() => go("denied")}>Denied</button>
      <button disabled={busy} className={b} onClick={async () => { setBusy(true); await snoozeClaim(id, 7); setBusy(false); router.refresh(); }}>Check again in a week</button>
      <button disabled={busy} className={b} onClick={() => go("closed")}>Close</button>
    </div>
  );
}
