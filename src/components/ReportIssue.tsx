"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient as createBrowserSb } from "@/lib/supabase/client";
import { reportIssue, type IssueInput } from "@/app/issues/actions";

type Sev = IssueInput["severity"];
const SEV: { id: Sev; label: string; hint: string }[] = [
  { id: "blocks", label: "Blocks me", hint: "I can't do the thing" },
  { id: "annoying", label: "Annoying", hint: "Works, but badly" },
  { id: "cosmetic", label: "Cosmetic", hint: "Looks wrong" },
  { id: "idea", label: "Feature request", hint: "Something it should do but does not" },
];

// Works out what the report is about from the URL: /tasks/<id> → task, /records/<id> → record, etc.
function itemFromPath(path: string): { kind: string | null; id: string | null } {
  const m = path.match(/^\/(tasks|records|family|messages|money\/reconcile)\/([^/?#]+)/);
  if (!m) return { kind: null, id: null };
  const kind = m[1] === "money/reconcile" ? "account" : m[1] === "family" ? "person" : m[1] === "messages" ? "thread" : m[1].replace(/s$/, "");
  return { kind, id: m[2] };
}

export function ReportIssueSheet({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent?: (id: string) => void }) {
  const path = usePathname();
  const [text, setText] = useState("");
  const [sev, setSev] = useState<Sev>("annoying");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const [shots, setShots] = useState<{ name: string; url: string; file: File }[]>([]);
  const item = itemFromPath(path);

  useEffect(() => { if (open) { setDone(null); setErr(null); setShots([]); setTimeout(() => ta.current?.focus(), 50); } }, [open]);
  if (!open) return null;

  function addShots(list: FileList | null) {
    const imgs = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") && f.size <= 15 * 1024 * 1024);
    setShots((cur) => [...cur, ...imgs.map((file) => ({ name: file.name, url: URL.createObjectURL(file), file }))].slice(0, 3));
    if (pick.current) pick.current.value = "";
  }

  async function send() {
    setBusy(true); setErr(null);
    const paths: string[] = [];
    if (shots.length) {
      try {
        const sb = createBrowserSb();
        const { data: { user } } = await sb.auth.getUser();
        for (const s of shots) {
          const key = `${user?.id}/issues/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID().slice(0, 8)}-${s.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80)}`;
          const { error } = await sb.storage.from("captures").upload(key, s.file, { contentType: s.file.type || undefined, upsert: false });
          if (error) throw new Error(error.message);
          paths.push(key);
        }
      } catch (e) { setBusy(false); setErr(`A screenshot did not upload (${e instanceof Error ? e.message : "unknown error"}). Nothing was sent; try again or remove it.`); return; }
    }
    const r = await reportIssue({
      screenshots: paths,
      text, severity: sev, page: path, item_kind: item.kind, item_id: item.id,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : null,
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Could not send."); return; }
    setDone(r.id ?? "ok"); setText(""); setShots([]); onSent?.(r.id ?? "");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="ri-title">
      <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-bg rounded-t-2xl border-t border-line p-5 pb-[max(20px,env(safe-area-inset-bottom))] flex flex-col gap-3 shadow-xl">
        <div className="flex justify-between items-baseline">
          <h2 id="ri-title" className="text-lg">Report a problem or request a feature</h2>
          <button className="text-sm text-muted min-h-9 px-2" onClick={onClose}>Close</button>
        </div>
        {done ? (
          <>
            <p className="text-sm">Sent. It shows under <b>Your reports</b> on System health with its status, and you’ll see when it’s fixed and in which version.</p>
            <button className="min-h-11 rounded-xl bg-accent text-white font-semibold" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <p className="text-xs text-muted">One problem per report, in your words. Where you are is attached automatically{item.kind ? ` (this ${item.kind})` : ""}. Add a screenshot if it helps (up to 3). Nothing else is sent.</p>
            <textarea ref={ta} id="ri-text" value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="What happened, or what you expected to happen…" className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-[15px]" />
            <div className="flex items-center gap-2 flex-wrap">
              {shots.map((s, i) => (
                <div key={s.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.url} alt={`Screenshot ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border border-line" />
                  <button type="button" aria-label="Remove screenshot" onClick={() => setShots((c) => c.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/70 text-white text-xs leading-5">×</button>
                </div>
              ))}
              {shots.length < 3 && <button type="button" onClick={() => pick.current?.click()} className="min-h-11 px-3 rounded-xl border border-line font-semibold text-sm">{shots.length ? "Add another" : "Add screenshot or photo"}</button>}
              <input ref={pick} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addShots(e.target.files)} />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {SEV.map((s) => (
                <button key={s.id} type="button" onClick={() => setSev(s.id)} title={s.hint} className={`px-3 py-1.5 rounded-full min-h-9 text-sm font-semibold ${sev === s.id ? "bg-accent text-white" : "bg-soft"}`}>{s.label}</button>
              ))}
            </div>
            <div className="text-[11px] text-muted font-mono truncate">page {path}{item.id ? ` · ${item.kind} ${item.id.slice(0, 8)}` : ""}</div>
            {err && <div className="text-sm text-red font-semibold">{err}</div>}
            <button disabled={busy || !text.trim()} className="min-h-11 rounded-xl bg-accent text-white font-semibold disabled:opacity-50" onClick={send}>{busy ? "Sending…" : "Send report"}</button>
          </>
        )}
      </div>
    </div>
  );
}

// A plain button that opens the sheet; used on pages like System health and Settings.
export function ReportIssueButton({ label = "Report a problem or request a feature", className = "" }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || "min-h-11 px-4 rounded-xl border border-line font-semibold text-sm"}>{label}</button>
      <ReportIssueSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
