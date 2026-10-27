"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient as createBrowserSb } from "@/lib/supabase/client";
import { recordKidReceipt, answerKidReceipt, type KidReceiptRow } from "@/app/kid/receipts-actions";
import { KID_CATEGORIES } from "@/lib/kid-categories";

// Big buttons, few words: the child's receipts, a camera button, and for any receipt the reader could not
// place, a row of choices. A parent opening the child's page sees the same list, read-only.
export function KidReceipts({ rows, canAdd, parentView }: { rows: KidReceiptRow[]; canAdd: boolean; parentView: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  async function take(list: FileList | null) {
    const f = list?.[0]; if (!f) return;
    setMsg("Reading your receipt…");
    const sb = createBrowserSb();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setMsg("Sign in again."); return; }
    const buf = await f.arrayBuffer();
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buf))).map((b) => b.toString(16).padStart(2, "0")).join("");
    const safe = (f.name || "receipt.jpg").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
    const key = `${user.id}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
    const up = await sb.storage.from("captures").upload(key, f, { contentType: f.type || "image/jpeg", upsert: false });
    if (up.error) { setMsg(`Could not save the photo: ${up.error.message}`); return; }
    start(async () => {
      const r = await recordKidReceipt({ name: f.name || "receipt.jpg", path: key, mime: f.type || "image/jpeg", size: f.size, sha256: sha });
      if (!r.ok) { setMsg(r.error ?? "Something went wrong."); return; }
      setMsg(r.asked ? "Saved. Tell me what you bought below." : `Saved: ${r.vendor ?? "receipt"}${r.amount != null ? ` $${r.amount.toFixed(2)}` : ""}.`);
      router.refresh();
    });
  }

  const answer = (id: string, cat: string) => start(async () => {
    const r = await answerKidReceipt(id, cat, note[id]);
    if (!r.ok) setMsg(r.error ?? "Could not save."); else { setMsg("Thanks!"); router.refresh(); }
  });

  const label = (c: string | null) => KID_CATEGORIES.find((k) => k.id === c)?.label ?? (c ? c.replace(/_/g, " ") : "");
  const asking = rows.filter((r) => r.asked);
  const done = rows.filter((r) => !r.asked);

  return (
    <section className="flex flex-col gap-2 mb-5">
      <h2 className="text-[17px]">My receipts</h2>
      {canAdd && !parentView && (
        <>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void take(e.target.files)} />
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="min-h-14 rounded-2xl bg-accent text-white font-bold text-base disabled:opacity-50">{busy ? "Working…" : "📷 Add a receipt"}</button>
        </>
      )}
      {msg && <div className="text-sm text-muted px-1">{msg}</div>}
      {asking.length > 0 && (
        <div className="flex flex-col gap-2">
          {asking.map((r) => (
            <div key={r.id} className="card border-amber flex flex-col gap-2">
              <div className="font-semibold">{r.taskTitle ?? "What was this receipt for?"}</div>
              {!parentView && <>
                <div className="flex flex-wrap gap-1.5">
                  {KID_CATEGORIES.map((k) => <button key={k.id} type="button" disabled={busy} onClick={() => answer(r.id, k.id)} className="min-h-10 px-3 rounded-full bg-soft text-sm font-semibold disabled:opacity-50">{k.label}</button>)}
                </div>
                <input value={note[r.id] ?? ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} placeholder="What was it? (optional)" className="min-h-10 rounded-xl border border-line bg-bg px-3 text-sm" />
              </>}
              {parentView && <div className="text-xs text-muted">Waiting for their answer.</div>}
              <a href={r.open} target="_blank" rel="noopener" className="text-xs font-semibold text-accent">See the photo</a>
            </div>
          ))}
        </div>
      )}
      <div className="card p-0 overflow-hidden text-sm">
        {done.length === 0 ? <div className="px-3 py-2 text-muted">{rows.length ? "" : "No receipts yet."}{rows.length && !done.length ? "Answer the one above and it shows here." : ""}</div> : done.map((r) => (
          <div key={r.id} className="flex items-center gap-2 px-3 py-2 border-b border-line last:border-0">
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{r.vendor ?? r.title}{r.amount != null ? ` · $${r.amount.toFixed(2)}` : ""}</div>
              <div className="text-xs text-muted truncate">{r.when}{r.category ? ` · ${label(r.category)}` : ""}{r.item ? ` · ${r.item}` : ""}</div>
            </div>
            <a href={r.open} target="_blank" rel="noopener" className="shrink-0 min-h-9 px-3 rounded-full border border-line text-xs font-semibold inline-flex items-center">Photo</a>
          </div>
        ))}
      </div>
    </section>
  );
}
