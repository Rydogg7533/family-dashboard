"use client";
import { useState } from "react";
import { FetchButton } from "@/components/FetchButton";
import { setShareLink } from "@/app/work/actions";
import { smsHref, type CustomerMaterial } from "@/lib/work-shared";

// One customer-facing file: its current version on the hub, the link to send, and the three things Ryan
// does with it: copy the link, text it, open the file. The link is set once (owner) and kept until changed.
export function CustomerMaterialCard({ m, isOwner }: { m: CustomerMaterial; isOwner: boolean }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.share_link ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileName = `${m.name}${m.ext}`;
  const when = m.updated_at ? new Date(m.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

  const copy = async () => {
    if (!m.share_link) return;
    try { await navigator.clipboard.writeText(m.share_link); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { setErr("Could not copy; long-press the link instead."); }
  };
  const save = async () => {
    setBusy(true); setErr(null);
    const r = await setShareLink(fileName, draft);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setEditing(false);
  };

  return (
    <div className="card flex flex-col gap-1.5">
      <div className="flex justify-between gap-2">
        <div className="text-[11px] font-bold tracking-wide text-accent">CUSTOMER MATERIAL</div>
        {when && <div className="text-[11px] text-muted">Updated {when}</div>}
      </div>
      <div className="font-semibold">{m.name.replace(/[-_]+/g, " ")}</div>
      <div className="text-xs text-muted break-all">{m.path.replace(/\/[^/]+$/, "/")}</div>

      {m.share_link && !editing ? (
        <a href={m.share_link} target="_blank" rel="noopener" className="text-xs text-accent font-semibold break-all">{m.share_link}</a>
      ) : !editing ? (
        <div className="text-xs text-amber">No share link yet{isOwner ? " · add one below" : ""}.</div>
      ) : null}

      {editing && (
        <div className="flex flex-col gap-1.5">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://…" inputMode="url" className="min-h-11 rounded-xl border border-line bg-bg px-3 text-sm" />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={save} className="min-h-9 px-3 rounded-full bg-accent text-white text-xs font-semibold">{busy ? "Saving…" : "Save link"}</button>
            <button type="button" onClick={() => { setEditing(false); setDraft(m.share_link ?? ""); setErr(null); }} className="min-h-9 px-3 rounded-full bg-soft text-xs font-semibold">Cancel</button>
          </div>
        </div>
      )}
      {err && <div className="text-xs text-red">{err}</div>}

      <div className="flex gap-2 flex-wrap pt-1">
        <button type="button" onClick={copy} disabled={!m.share_link} className={`min-h-9 px-3 rounded-full text-xs font-semibold ${m.share_link ? "bg-accent text-white" : "bg-soft text-muted"}`}>{copied ? "Copied" : "Copy link"}</button>
        {m.share_link && <a href={smsHref(`StewardOS overview: ${m.share_link}`)} className="min-h-9 px-3 rounded-full bg-soft text-xs font-semibold inline-flex items-center">Send by text</a>}
        {m.hub_id > 0 && <FetchButton path={m.path} register="catalog" refId={String(m.hub_id)} />}
        {isOwner && !editing && <button type="button" onClick={() => setEditing(true)} className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold">{m.share_link ? "Change link" : "Add link"}</button>}
      </div>
    </div>
  );
}
