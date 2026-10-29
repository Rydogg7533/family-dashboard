"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueCaptureToken, stopCaptureToken } from "@/app/settings/capture/actions";

type Tok = { id: string; label: string; created_at: string; last_seen_at: string | null };
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never used");

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* the text is selectable */ } }} className="min-h-11 px-3 rounded-xl bg-soft text-xs font-semibold self-start">{done ? "Copied" : label}</button>;
}

// The shortcut is built once, by hand, in the Shortcuts app: three actions. Apple will not install a shortcut from a
// file any more (they must be signed by Shortcuts itself), so the honest path is the steps below -- about two minutes.
// For a customer, the setup wizard will hand over a signed shortcut made on the hub (a Mac can sign them); not yet built.
export default function CaptureSetup({ tokens, who, received }: { tokens: Tok[]; who: string; received: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ token: string; endpoint: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const issue = () => { setErr(null); start(async () => { try { const r = await issueCaptureToken(`${who}'s iPhone`); if (!r.ok) { setErr(r.error); return; } setMade({ token: r.token, endpoint: r.endpoint }); router.refresh(); } catch { setErr("Could not make a token. Try again."); } }); };
  const stop = (id: string) => { setErr(null); start(async () => { try { const r = await stopCaptureToken(id); if (!r.ok) setErr(r.error); setConfirm(null); router.refresh(); } catch { setErr("That token could not be stopped."); } }); };
  const bearer = made ? `Bearer ${made.token}` : "Bearer <your token>";
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="card">
        <div className="font-semibold">From your phone so far</div>
        <div className="text-xs text-muted mt-1">{received ? `${received} photo${received === 1 ? "" : "s"} received through the shortcut.` : "Nothing yet. Make a token, then build the shortcut below."}</div>
      </div>

      {made && (
        <div className="card flex flex-col gap-2 border-accent">
          <div className="font-semibold">New token: shown only now</div>
          <div className="text-xs text-muted">Put it in the shortcut (step 3 below), then leave this page. If you lose it, stop it here and make another.</div>
          <div className="text-xs text-muted">Address</div>
          <div className="font-mono text-xs break-all select-all rounded-xl border border-line p-2">{made.endpoint}</div>
          <Copy text={made.endpoint} label="Copy address" />
          <div className="text-xs text-muted">Authorization header value</div>
          <div className="font-mono text-xs break-all select-all rounded-xl border border-line p-2">{bearer}</div>
          <Copy text={bearer} label="Copy header value" />
        </div>
      )}
      {err && <div role="alert" className="rounded-xl bg-red-bg text-red px-3 py-2 font-semibold">{err}</div>}
      <button type="button" disabled={busy} onClick={issue} className="min-h-11 rounded-xl bg-accent text-white font-semibold disabled:opacity-60">{busy ? "Working…" : "Make a token for this phone"}</button>

      <div className="card flex flex-col gap-2">
        <div className="font-semibold">Build the shortcut (once, about two minutes)</div>
        <ol className="list-decimal pl-5 flex flex-col gap-1.5 text-xs leading-relaxed">
          <li>Open <b>Shortcuts</b> on your iPhone, tap <b>+</b>, name it <b>StewardOS Capture</b>. Tap the icon and pick the camera glyph.</li>
          <li>Add the action <b>Take Photo</b>. Turn <i>Show Camera Preview</i> on.</li>
          <li>Add <b>Get Contents of URL</b>. URL: the address above. Tap <i>Show More</i>: Method <b>POST</b>; Headers: add <b>Authorization</b> with the header value above; Request Body <b>Form</b>; add a field named <b>file</b>, type <i>File</i>, value <i>Photo</i> (the output of Take Photo).</li>
          <li>Add <b>Show Notification</b> with the contents of the previous step, so you see &ldquo;Saved to the StewardOS Inbox&rdquo; without opening anything.</li>
          <li>Put it where you&apos;ll use it: <b>Lock screen</b> — long-press the lock screen › Customize › add a Shortcuts widget › choose it. <b>Home screen</b> — in the shortcut&apos;s details, Add to Home Screen. <b>Action Button</b> (iPhone 15 Pro and later) — Settings › Action Button › Shortcut. <b>Control Center</b> (iOS 18) — add a Shortcut control.</li>
        </ol>
        <div className="text-[11px] text-muted">The photo goes into the same private store and the same Inbox as the + button. It is read the next time the Inbox is opened on any phone, then filed by your rules or asked about. The token can only add a photo; it cannot read anything.</div>
      </div>

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
