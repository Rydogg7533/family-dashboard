"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueOverlandToken, stopOverlandToken } from "@/app/settings/location/actions";

type Tok = { id: string; label: string; created_at: string; last_seen_at: string | null };
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never used");

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* the text is selectable */ } }} className="min-h-11 px-4 rounded-xl bg-soft text-xs font-semibold">{done ? "Copied" : label}</button>;
}

export default function OverlandSetup({ tokens, who, points, lastPoint }: { tokens: Tok[]; who: string; points: number; lastPoint: string | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ token: string; endpoint: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const issue = () => { setErr(null); start(async () => { try { const r = await issueOverlandToken(`${who} iPhone`); if (!r.ok) { setErr(r.error); return; } setMade({ token: r.token, endpoint: r.endpoint }); router.refresh(); } catch { setErr("That took too long. Try again."); } }); };
  const stop = (id: string) => { setErr(null); start(async () => { try { const r = await stopOverlandToken(id); if (!r.ok) setErr(r.error); setConfirm(null); router.refresh(); } catch { setErr("That took too long. Try again."); } }); };
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="card">
        <div className="font-semibold">Your location so far</div>
        <div className="text-xs text-muted mt-1">{points ? `${points.toLocaleString("en-US")} points received, latest ${when(lastPoint)}.` : "Nothing received yet. Finish the steps below on your phone, then tap Send Now in Overland."}</div>
      </div>
      {made && (
        <div className="card flex flex-col gap-2 border-accent">
          <div className="font-semibold">New token: shown only now</div>
          <div className="text-xs text-muted">Copy both into Overland › Settings, then leave this page. If you lose it, stop it and make another.</div>
          <div className="text-xs text-muted">Receiver Endpoint</div>
          <div className="font-mono text-xs break-all select-all rounded-xl border border-line p-2">{made.endpoint}</div>
          <Copy text={made.endpoint} label="Copy endpoint" />
          <div className="text-xs text-muted">Access Token</div>
          <div className="font-mono text-xs break-all select-all rounded-xl border border-line p-2">{made.token}</div>
          <Copy text={made.token} label="Copy token" />
        </div>
      )}
      {err && <div role="alert" className="rounded-xl bg-red-bg text-red px-3 py-2 font-semibold">{err}</div>}
      <button type="button" disabled={busy} onClick={issue} className="min-h-11 rounded-xl bg-accent text-white font-semibold disabled:opacity-60">{busy ? "Working…" : "Make a token for this phone"}</button>
      <div className="card">
        <div className="font-semibold mb-1">Your tokens</div>
        {tokens.length === 0 && <div className="text-xs text-muted">None active.</div>}
        {tokens.map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-2 border-t border-line first:border-t-0">
            <div className="flex-1 min-w-0"><div className="font-semibold truncate">{t.label}</div><div className="text-xs text-muted">Made {when(t.created_at)} · last used {when(t.last_seen_at)}</div></div>
            {confirm === t.id
              ? <><button type="button" disabled={busy} onClick={() => stop(t.id)} className="min-h-11 px-3 rounded-xl bg-red text-white text-xs font-semibold">Yes, stop</button><button type="button" onClick={() => setConfirm(null)} className="min-h-11 px-3 rounded-xl bg-soft text-xs font-semibold">Keep</button></>
              : <button type="button" disabled={busy} onClick={() => setConfirm(t.id)} className="min-h-11 px-3 rounded-xl bg-soft text-xs font-semibold">Stop</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
