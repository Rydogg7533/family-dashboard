"use client";
import { useState, useTransition } from "react";
import { createPreonboardLink, revokePreonboardLink } from "@/app/settings/preonboard/actions";
import type { PreonboardLinkRow } from "@/lib/data-preonboard";

const btn = "min-h-11 px-4 rounded-xl text-sm font-semibold disabled:opacity-50";
const input = "w-full min-h-11 px-3 rounded-xl border border-line bg-bg text-base";

export function PreonboardAdmin({ links, canEdit }: { links: PreonboardLinkRow[]; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = () => { setErr(null); start(async () => { const r = await createPreonboardLink(label); if (!r.ok) { setErr(r.error ?? "That didn't work."); return; } setMade(r.link ?? null); setCopied(false); setLabel(""); }); };
  const revoke = (id: string) => { setErr(null); start(async () => { const r = await revokePreonboardLink(id); if (!r.ok) setErr(r.error ?? "That didn't work."); }); };

  return (
    <div className="flex flex-col gap-3 text-sm">
      {canEdit && (
        <div className="card flex flex-col gap-2">
          <div className="font-semibold">New pre-onboarding link</div>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Your note (e.g. The Hendersons) — never shown to them" className={input} />
          <button type="button" disabled={pending} className={`${btn} bg-accent text-white self-start`} onClick={create}>{pending ? "Making…" : "Create link"}</button>
        </div>
      )}
      {made && (
        <div className="card flex flex-col gap-2 border-accent">
          <div className="font-semibold">Send this link</div>
          <div className="text-xs text-muted">It works as many times as they like, saves as they go, and has no expiry. Revoke it any time below.</div>
          <div className="font-mono text-[11px] break-all select-all rounded-xl border border-line p-2">{made}</div>
          <div className="flex gap-2">
            <button type="button" className={`${btn} bg-soft`} onClick={async () => { try { await navigator.clipboard.writeText(made); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy the link"}</button>
            <button type="button" className={`${btn} bg-soft`} onClick={() => setMade(null)}>Done</button>
          </div>
        </div>
      )}
      <div className="card flex flex-col gap-2">
        <div className="font-semibold">Links sent</div>
        {links.length === 0 && <div className="text-xs text-muted">None yet.</div>}
        {links.map((l) => (
          <div key={l.id} className="border-t border-line pt-2 first:border-t-0 first:pt-0 flex justify-between items-start gap-2">
            <div>
              <div className="font-semibold">{l.label}</div>
              <div className="text-xs text-muted">
                {l.revokedAt ? "Revoked" : l.completedAt ? "Marked ready" : `${l.done}/${l.total} items checked`}
                {l.lastOpenedAt && !l.revokedAt ? ` · last opened ${new Date(l.lastOpenedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
              </div>
            </div>
            {canEdit && !l.revokedAt && <button type="button" disabled={pending} className="text-xs font-semibold text-muted min-h-9" onClick={() => revoke(l.id)}>Revoke</button>}
          </div>
        ))}
      </div>
      {err && <div role="alert" className="rounded-xl bg-red-bg text-red px-3 py-2 font-semibold">{err}</div>}
    </div>
  );
}
