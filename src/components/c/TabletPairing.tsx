"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { issueKitchenToken, stopKitchenToken } from "@/app/settings/sitter/actions";

export type Tablet = { id: string; label: string; createdAt: string; lastSeenAt: string | null };
export function TabletPairing({ tablets, isOwner }: { tablets: Tablet[]; isOwner: boolean }) {
  const router = useRouter();
  const [label, setLabel] = useState("Kitchen tablet");
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";
  return (
    <div className="flex flex-col gap-3">
      {tablets.map((t) => (
        <div key={t.id} className="card flex flex-col gap-1">
          <div className="font-semibold text-sm">{t.label}</div>
          <div className="text-xs text-muted">Paired {new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {t.lastSeenAt ? `last seen ${new Date(t.lastSeenAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "never opened yet"}</div>
          {isOwner && <button disabled={busy} onClick={async () => { setBusy(true); setErr(null); const r = await stopKitchenToken(t.id); setBusy(false); if (!r.ok) setErr(r.error ?? "Could not stop it."); else router.refresh(); }} className="text-xs font-semibold text-muted min-h-9 self-start">Stop this tablet</button>}
        </div>
      ))}
      {isOwner ? (
        <div className="card flex flex-col gap-2">
          <div className="text-xs font-bold tracking-wide text-muted">PAIR A TABLET</div>
          <input className={inp} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name (e.g. Kitchen tablet)" />
          <button disabled={busy} onClick={async () => { setBusy(true); setErr(null); const r = await issueKitchenToken(label); setBusy(false); if (!r.ok) { setErr(r.error ?? "Could not pair."); return; } setLink(r.link ?? null); router.refresh(); }} className="min-h-11 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50">{busy ? "Working…" : "Make a pairing link"}</button>
          {link && (
            <div className="rounded-xl border border-accent p-3 flex flex-col gap-2 text-sm">
              <div className="font-semibold">Open this link on the tablet, once.</div>
              <div className="text-xs break-all bg-soft rounded-lg p-2 select-all">{link}</div>
              <button onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } }} className="min-h-10 rounded-xl border border-line text-sm font-semibold">{copied ? "Copied" : "Copy the link"}</button>
              <div className="text-[11px] text-muted">This link is a key. It is shown only now; anyone who opens it can show the sitter sheet on their device. Send it to the tablet yourself (Messages to the tablet, or type it), and do not post it anywhere. Lost it? Stop the tablet and make a new one.</div>
            </div>
          )}
        </div>
      ) : <div className="card text-sm text-muted">Only a parent with the owner role can pair a tablet.</div>}
      {err && <div role="alert" className="text-sm text-red font-semibold">{err}</div>}
    </div>
  );
}
