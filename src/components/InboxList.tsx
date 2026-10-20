"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { InboxItem } from "@/lib/data-inbox";
import { readCapture } from "@/app/inbox/read";
import { resolveInboxItem, recordCapture, addPage, type CapturedFile } from "@/app/inbox/actions";
import { createClient as createBrowserSb } from "@/lib/supabase/client";

const KIND: Record<InboxItem["kind"], string> = { identify: "IDENTIFY", file: "FILE", decide: "DECIDE", ask_thread: "FROM ASK" };

export function InboxList({ items, pendingIds = [], capture, claimId, resolvedThisWeek }: { items: InboxItem[]; pendingIds?: string[]; capture: string | null; claimId?: string | null; resolvedThisWeek: number }) {
  const [open, setOpen] = useState(items);
  useEffect(() => { setOpen(items); }, [items]);
  const router = useRouter();
  const healed = useRef(false);
  // Self-heal: any stored file that was never read (a dropped or failed read) is read when the Inbox opens.
  useEffect(() => {
    if (healed.current) return; healed.current = true;
    const todo = [...pendingIds, ...items.filter((i) => i.file_path && !i.read_at).map((i) => i.id)];
    if (!todo.length) return;
    void (async () => { for (const id of todo) { await readCapture(id).catch(() => null); } router.refresh(); })();
  }, [items, pendingIds, router]);
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const total = items.length + resolvedThisWeek;
  const done = total - open.length;
  const shown = showAll ? open : open.slice(0, 5);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 10_000); return () => clearTimeout(t); }, [toast]);

  function resolve(item: InboxItem, answer: string) {
    const before = open;
    setOpen((o) => o.filter((x) => x.id !== item.id));
    setToast(item.file_path ? { text: "Filing…" } : { text: `${item.title.slice(0, 32)}${item.title.length > 32 ? "…" : ""}: ${answer}. Filed; rule proposed for the weekly review.`, undo: () => setOpen(before) });
    void resolveInboxItem(item.id, answer, true).then((r) => {
      if (r.kept) setOpen(before);
      if (r.summary) setToast({ text: r.summary });
      else if (!r.ok) { setOpen(before); setToast({ text: "That did not save. Try again." }); }
      router.refresh();
    });
  }

  return (
    <>
      {capture && <CapturePanel kind={capture} claimId={claimId ?? null} onDone={(n) => setToast({ text: `${n} item${n === 1 ? "" : "s"} received. Saved. Anything unclear appears below as one question.` })} />}

      <section className="mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base">Needs you</h2>
          <span className="text-xs text-muted">{done} of {total} resolved this week</span>
        </div>
        <div className="h-1.5 rounded-full bg-soft overflow-hidden mb-3"><div className="h-full bg-green" style={{ width: `${total ? (done / total) * 100 : 100}%` }} /></div>
        {pendingIds.length > 0 && <div className="card text-sm text-muted mb-2 animate-pulse">Reading {pendingIds.length} new document{pendingIds.length === 1 ? "" : "s"}… it will appear here in a few seconds.</div>}
        {open.length === 0 && pendingIds.length === 0 ? (
          <div className="card text-muted">Nothing to identify, file or decide. Everything is where it belongs.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {shown.map((it) => <InboxCard key={it.id} item={it} onAnswer={(a) => resolve(it, a)} />)}
            {!showAll && open.length > 5 && <button onClick={() => setShowAll(true)} className="text-sm font-semibold text-accent px-1 text-left min-h-10">and {open.length - 5} more</button>}
          </div>
        )}
      </section>

      <p className="text-xs text-muted">Every answer becomes a rule, so the same question is never asked twice. Nothing here expires; after a few days an item folds into the weekly review. Synced from the Mac mini drop folder · <button className="font-semibold text-accent">Sync now</button></p>

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[150px] z-10 card shadow-lg text-sm flex items-center gap-3 max-w-[360px]">
          <span>{toast.text}</span>
          {toast.undo && <button onClick={() => { toast.undo!(); setToast(null); }} className="font-bold text-accent">Undo</button>}
        </div>
      )}
    </>
  );
}

function InboxCard({ item, onAnswer }: { item: InboxItem; onAnswer: (a: string) => void }) {
  const [text, setText] = useState("");
  const [thread, setThread] = useState(false);
  return (
    <div className="card flex flex-col gap-2">
      <div>
        <div className="text-[11px] font-bold tracking-wide text-accent">{KIND[item.kind]}</div>
        <div className="font-semibold">{item.title}</div>
        <div className="text-xs text-muted mt-0.5">{item.requested_by === "System" ? "System" : `${item.requested_by} asked`}{item.for_person ? ` · for ${item.for_person}` : ""} · {item.origin} · {item.file_path ? <a href={`/api/capture/${item.id}`} target="_blank" rel="noreferrer" className="font-semibold text-accent">View the file</a> : <a href={item.origin_href} className="font-semibold text-accent">Open in {item.origin_label}</a>}</div>
      </div>
      {item.thread && (
        <div>
          <button onClick={() => setThread((v) => !v)} className="text-xs font-semibold text-accent min-h-8">{thread ? "Hide" : "Show"} the conversation</button>
          {thread && <div className="flex flex-col gap-1 text-xs mt-1">{item.thread.map((t, i) => <div key={i} className={t.who === "you" ? "text-fg" : "text-muted"}><span className="font-semibold">{t.who === "you" ? "You" : "Assistant"}:</span> {t.text}</div>)}</div>}
        </div>
      )}
      <div className="text-sm font-semibold text-amber">{item.missing}</div>
      {item.read_result?.plan && item.read_result.plan.length > 0 && (
        <div className="rounded-xl bg-soft px-3 py-2 text-xs">
          <div className="font-bold tracking-wide text-muted mb-1">IF YOU SAY YES</div>
          <ul className="flex flex-col gap-1">{item.read_result.plan.map((p, i) => { const o = typeof p === "string" ? { t: "link" as const, text: p } : p; return (<li key={i} className="flex gap-2"><span className={`shrink-0 rounded px-1.5 text-[10px] font-bold leading-5 ${o.t === "file" ? "bg-accent text-white" : "bg-line text-muted"}`}>{o.t === "file" ? "FILED" : "LINK"}</span><span>{o.text}</span></li>); })}</ul>
          {item.options.includes("File it and open a reimbursement claim") && item.read_result.claim_plan && <div className="mt-1 text-muted">With a claim, also: {item.read_result.claim_plan.replace("LINK ", "link: ")}</div>}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {item.options.map((o) => <button key={o} onClick={() => onAnswer(o)} className="min-h-10 px-3 rounded-full border border-line text-sm font-semibold">{o}</button>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAnswer(text.trim()); }} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Or answer in words…" className="flex-1 min-h-10 rounded-xl border border-line bg-bg px-3 text-sm" />
        <button type="submit" disabled={!text.trim()} className="min-h-10 px-3 rounded-xl bg-soft text-sm font-semibold disabled:opacity-40">Answer</button>
      </form>
    </div>
  );
}

async function storeFile(f: File): Promise<CapturedFile> {
  const sb = createBrowserSb();
  let sha: string | null = null, path: string | null = null, failed: string | undefined;
  try {
    const { data: { user } } = await sb.auth.getUser();
    const buf = await f.arrayBuffer();
    sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buf))).map((b) => b.toString(16).padStart(2, "0")).join("");
    const safe = f.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    const key = `${user?.id ?? "member"}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
    const { error } = await sb.storage.from("captures").upload(key, f, { contentType: f.type || undefined, upsert: false });
    if (error) failed = error.message; else path = key;
  } catch (e) { failed = String(e); }
  return { name: f.name, path, mime: f.type, size: f.size, sha256: sha, failed };
}

// Photo and Upload file take ONE document (add pages to it afterwards); Bulk drop takes many, each its own item.
function CapturePanel({ kind, claimId, onDone }: { kind: string; claimId: string | null; onDone: (n: number) => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState("");
  const [docId, setDocId] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const bulk = kind === "bulk";
  const title = kind === "photo" ? "Take a photo" : kind === "file" ? "Upload a file" : "Bulk drop";
  const hint = kind === "photo" ? "One document per photo: a receipt, a label, a serial plate, a form. If it has more pages, add them after. You will get one question; most are a single tap." : kind === "file" ? "One document: a PDF or an image. A multi-page PDF is already one file; for photos of a longer receipt, add the other pages after." : "Drop a shoebox of scans, statements, photos. Each file is its own item and nothing is filed without your tap; pages that look like one document are offered as a set.";

  async function take(list: FileList | null) {
    if (!list || !list.length) return;
    const picked = bulk ? Array.from(list) : [list[0]];
    setNames(picked.map((f) => f.name)); setStatus("Saving…"); setDocId(null); setPageCount(0);
    const out: CapturedFile[] = [];
    for (const f of picked) out.push(await storeFile(f));
    const r = await recordCapture(kind as "photo" | "file" | "bulk", out, claimId);
    const bad = r.failed?.length ?? 0;
    setStatus(bad ? `${bad} of ${out.length} did not upload. Saved by name only; see the Inbox to retry.` : `Saved ${r.stored} file${r.stored === 1 ? "" : "s"}.${r.duplicates?.length ? ` ${r.duplicates.length} look like repeats; the Inbox asks.` : ""} Reading…`);
    onDone(out.length);
    if (!bulk && r.ids?.[0]) { setDocId(r.ids[0]); setPageCount(1); }
    // One at a time: concurrent server actions can be dropped by the refresh that follows the first.
    void (async () => { for (const id of r.ids ?? []) { await readCapture(id).catch(() => null); } setStatus((s) => s.replace(" Reading…", " Read.")); router.refresh(); })();
  }

  async function more(list: FileList | null) {
    if (!list?.[0] || !docId) return;
    setStatus("Adding the page…");
    const f = await storeFile(list[0]);
    if (!f.path) { setStatus("That page did not upload. Try again."); return; }
    const r = await addPage(docId, { path: f.path, mime: f.mime, size: f.size, sha256: f.sha256 });
    if (!r.ok) { setStatus("Could not add the page."); return; }
    setPageCount(r.pages ?? pageCount + 1); setStatus(`Page added (${r.pages} pages). Reading all of them…`);
    await readCapture(docId).catch(() => null); setStatus(`${r.pages} pages saved and read together.`); router.refresh();
  }

  return (
    <div className="card mb-4 flex flex-col gap-2 border-accent">
      <div className="flex items-baseline justify-between"><div className="font-semibold">{title}</div><Link href="/inbox" className="text-xs text-muted">Close</Link></div>
      {claimId && <p className="text-xs font-semibold text-accent">This will be added to the open claim.</p>}
      <p className="text-xs text-muted">{hint}</p>
      {bulk ? (
        <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files); }} onClick={() => inputRef.current?.click()}
          className={`min-h-32 rounded-xl border-2 border-dashed flex items-center justify-center text-sm font-semibold cursor-pointer ${over ? "border-accent bg-soft" : "border-line"}`}>
          Drop files here, or tap to choose
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} className="min-h-12 rounded-xl bg-accent text-white font-semibold">{kind === "photo" ? "Open camera" : "Choose file"}</button>
      )}
      <input ref={inputRef} type="file" className="hidden" multiple={bulk} accept={kind === "photo" ? "image/*" : "image/*,application/pdf"} capture={kind === "photo" ? "environment" : undefined} onChange={(e) => { void take(e.target.files); e.target.value = ""; }} />
      <input ref={pageRef} type="file" className="hidden" accept="image/*" capture={kind === "photo" ? "environment" : undefined} onChange={(e) => { void more(e.target.files); e.target.value = ""; }} />
      {names.length > 0 && <div className="text-xs text-green font-semibold">{status || "Saving…"} ({names.join(", ")})</div>}
      {docId && <button onClick={() => pageRef.current?.click()} className="min-h-11 rounded-xl border border-line font-semibold text-sm">Add another page to this document{pageCount > 1 ? ` (${pageCount} so far)` : ""}</button>}
    </div>
  );
}
