"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { InboxItem, DecidedItem, PaidWithContext } from "@/lib/data-inbox";
import { SKIP, CLEAR } from "@/lib/paid-with";
import { destination, folderWarnings, isFiledByCard, type DestRead } from "@/lib/destination";
import { NOT_VEHICLE } from "@/lib/inbox-answers";
import { NeededToContinue } from "@/components/c/NeededToContinue";
import { ReadFields, type ReadShape } from "@/components/c/ReadFields";
import { inboxStatus, isPaidWithSkipped, missingNote, docKind, decidedOutcome, KIND_ORDER, DECIDED_DAYS } from "@/lib/inbox-status";
import { readCapture, sweepRuleAnswered } from "@/app/inbox/read";
import { resolveInboxItem, recordCapture, addPage, getFolderChoices, changeFiling, saveFilingRule, assignInboxItem, setInboxPaidWith, type CapturedFile } from "@/app/inbox/actions";
import { createClient as createBrowserSb } from "@/lib/supabase/client";

const KIND: Record<InboxItem["kind"], string> = { identify: "IDENTIFY", file: "FILE", decide: "DECIDE", ask_thread: "FROM ASK" };

export function InboxList({ items, me = null, names = {}, pendingIds = [], capture, claimId, resolvedThisWeek, decided = [], paid = { known: [], suggestions: {} } }: { items: InboxItem[]; me?: string | null; names?: Record<string, string>; pendingIds?: string[]; capture: string | null; claimId?: string | null; resolvedThisWeek: number; decided?: DecidedItem[]; paid?: PaidWithContext }) {
  const [open, setOpen] = useState(items);
  useEffect(() => { setOpen(items); }, [items]);
  const router = useRouter();
  const healed = useRef(false);
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const total = items.length + resolvedThisWeek;
  const done = total - open.length;
  const [filter, setFilter] = useState<string>("all");
  // Self-heal, once per visit: any stored file that was never read (a dropped or failed read) is read, and then
  // every item still asking "file it?" is checked against the filing rules. The second pass matters because a rule
  // made after an item was read cannot reach back into that read -- so without it, a rule would only ever help the
  // NEXT document from that vendor, and a morning's backlog would stay a morning's worth of taps.
  useEffect(() => {
    if (healed.current) return; healed.current = true;
    const todo = [...pendingIds, ...items.filter((i) => i.file_path && !i.read_at).map((i) => i.id)];
    void (async () => {
      for (const id of todo) { await readCapture(id).catch(() => null); }
      const swept = await sweepRuleAnswered().catch(() => ({ filed: 0 }));
      // Deliberate: items vanishing from the list with no word for it is worse than one extra render. The Log has
      // a line per item naming the rule, and Undo is the usual one.
      if (swept.filed) setToast({ text: `Filed ${swept.filed} ${swept.filed === 1 ? "item" : "items"} your rules already answered.` });
      if (todo.length || swept.filed) router.refresh();
    })();
  }, [items, pendingIds, router]);
  const ids = Object.keys(names);
  const sorted = [...open].sort((a, b) => Number(b.assigned_to === me) - Number(a.assigned_to === me));
  const handedToMe = sorted.filter((i) => me && i.assigned_to === me).length;
  const fromWho = (i: InboxItem, id: string) => i.created_by === id || i.requested_by === names[id];
  const byPerson = filter === "all" ? sorted : filter === "mine" ? sorted.filter((i) => me && i.assigned_to === me) : sorted.filter((i) => fromWho(i, filter));
  // Status row (what is decided, what waits on you, what waits on a missing fact) and, once there are many items, a kind row (what went in).
  const [st, setSt] = useState<"all" | "needs_answer" | "missing_info" | "skipped" | "handed" | "decided">("all");
  const [kd, setKd] = useState<string>("all");
  const stCount = { all: byPerson.length, needs_answer: byPerson.filter((i) => inboxStatus(i) === "needs_answer").length, missing_info: byPerson.filter((i) => inboxStatus(i) === "missing_info").length, skipped: byPerson.filter((i) => isPaidWithSkipped(i)).length, handed: byPerson.filter((i) => i.assigned_to).length, decided: decided.length };
  const byStatus = st === "all" || st === "decided" ? byPerson : st === "handed" ? byPerson.filter((i) => i.assigned_to) : st === "skipped" ? byPerson.filter((i) => isPaidWithSkipped(i)) : byPerson.filter((i) => inboxStatus(i) === st);
  const kindOf = (i: InboxItem) => docKind(i);
  const kinds = KIND_ORDER.map((k) => ({ k, n: (st === "decided" ? decided.filter((d) => docKind({ read_result: { kind: d.kind } }) === k) : byStatus.filter((i) => kindOf(i) === k)).length })).filter((x) => x.n > 0);
  const showKinds = (st === "decided" ? decided.length : byPerson.length) >= 20 && kinds.length > 1;
  const visible = kd === "all" || !showKinds ? byStatus : byStatus.filter((i) => kindOf(i) === kd);
  const decidedShown = (kd === "all" || !showKinds ? decided : decided.filter((d) => docKind({ read_result: { kind: d.kind } }) === kd));
  const shown = showAll ? visible : visible.slice(0, 5);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 10_000); return () => clearTimeout(t); }, [toast]);

  function resolve(item: InboxItem, answer: string) {
    const before = open;
    setOpen((o) => o.filter((x) => x.id !== item.id));
    setToast(item.file_path ? { text: "Filing…" } : { text: `${item.title.slice(0, 32)}${item.title.length > 32 ? "…" : ""}: ${answer}. Filed.`, undo: () => setOpen(before) });
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
      {!capture && <CapturePanel kind="file" compact claimId={null} onDone={(n) => setToast({ text: `${n} item${n === 1 ? "" : "s"} received. Saved. Anything unclear appears below as one question.` })} />}

      <section className="mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base">Needs you</h2>
          <span className="text-xs text-muted">{done} of {total} resolved this week</span>
        </div>
        <div className="h-1.5 rounded-full bg-soft overflow-hidden mb-3"><div className="h-full bg-green" style={{ width: `${total ? (done / total) * 100 : 100}%` }} /></div>
        <div className="flex gap-1.5 flex-wrap text-xs font-semibold mb-2" role="group" aria-label="Filter by status">
          {([["all", "All"], ["needs_answer", "Needs answer"], ["missing_info", "Missing info"], ["skipped", "Skipped"], ["handed", "Handed over"], ["decided", "Decided"]] as const).filter(([id]) => id === "all" || id === "decided" || id === st || stCount[id] > 0).map(([id, label]) => (
            <button key={id} onClick={() => { setSt(id); setKd("all"); setShowAll(false); }} aria-pressed={st === id} className={`px-3 py-1.5 rounded-full min-h-9 ${st === id ? "bg-accent text-white" : "bg-soft"}`}>{label} <b>{stCount[id]}</b></button>
          ))}
        </div>
        {showKinds && (
          <div className="flex gap-1.5 flex-wrap text-xs mb-2" role="group" aria-label="Filter by what it is">
            {[{ k: "all", n: st === "decided" ? decided.length : byStatus.length }, ...kinds].map((x) => (
              <button key={x.k} onClick={() => { setKd(x.k); setShowAll(false); }} aria-pressed={kd === x.k} className={`px-2.5 py-1 rounded-lg min-h-8 ${kd === x.k ? "bg-fg text-bg font-semibold" : "bg-soft"}`}>{x.k === "all" ? "Everything" : x.k} {x.n}</button>
            ))}
          </div>
        )}
        {ids.length > 1 && st !== "decided" && (
          <div className="flex gap-1.5 flex-wrap text-xs font-semibold mb-2">
            {[{ id: "all", label: "All" }, ...ids.map((id) => ({ id, label: `From ${names[id]}` })), ...(handedToMe ? [{ id: "mine", label: `Handed to me (${handedToMe})` }] : [])].map((c) => (
              <button key={c.id} onClick={() => { setFilter(c.id); setShowAll(false); }} className={`px-3 py-1.5 rounded-full min-h-9 ${filter === c.id ? "bg-accent text-white" : "bg-soft"}`}>{c.label}</button>
            ))}
          </div>
        )}
        {pendingIds.length > 0 && <div className="card text-sm text-muted mb-2 animate-pulse">Reading {pendingIds.length} new document{pendingIds.length === 1 ? "" : "s"}… it will appear here in a few seconds.</div>}
        {st === "decided" ? (
          <DecidedList items={decidedShown} names={names} />
        ) : open.length === 0 && pendingIds.length === 0 ? (
          <div className="card text-muted">Nothing to identify, file or decide. Everything is where it belongs.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {shown.length === 0 && st === "skipped" && <div className="card text-muted text-sm">Nothing skipped right now. Receipts you already said Yes to without a card are under Money › Receipts to finish › No card yet.</div>}
            {shown.map((it) => <InboxCard key={it.id} item={it} me={me} names={names} paid={paid} onAnswer={(a) => resolve(it, a)} />)}
            {!showAll && visible.length > 5 && <button onClick={() => setShowAll(true)} className="text-sm font-semibold text-accent px-1 text-left min-h-10">and {visible.length - 5} more</button>}
          </div>
        )}
      </section>

      <p className="text-xs text-muted">A vendor you file the same way can get a rule: open the item and tap Always file this vendor here, and the next one from that vendor is filed without asking. Nothing here expires. Synced from the Mac mini drop folder · <button className="font-semibold text-accent">Sync now</button></p>

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[150px] z-10 card shadow-lg text-sm flex items-center gap-3 max-w-[360px]">
          <span>{toast.text}</span>
          {toast.undo && <button onClick={() => { toast.undo!(); setToast(null); }} className="font-bold text-accent">Undo</button>}
        </div>
      )}
    </>
  );
}

function InboxCard({ item, me, names, paid, onAnswer }: { item: InboxItem; me: string | null; names: Record<string, string>; paid: PaidWithContext; onAnswer: (a: string) => void }) {
  const [text, setText] = useState("");
  const [thread, setThread] = useState(false);
  const router = useRouter();
  const [handBusy, setHandBusy] = useState(false);
  const otherId = Object.keys(names).find((x) => x !== me) ?? null;
  const assignedName = item.assigned_to ? names[item.assigned_to] : null;
  const by = item.created_by && names[item.created_by] ? names[item.created_by] : item.requested_by;
  const rrk = item.read_result as { kind?: string; error?: string } | null;
  const showRead = !!item.file_path && !!rrk && !("error" in rrk) && ["receipt", "bill", "warranty", "service_report", "form", "other"].includes(String(rrk.kind ?? ""));
  const vehicleMissing = showRead && inboxStatus(item) === "missing_info" && item.options.includes(NOT_VEHICLE);
  async function hand(to: string | null) { setHandBusy(true); await assignInboxItem(item.id, to).catch(() => null); setHandBusy(false); router.refresh(); }
  return (
    <div className="card flex flex-col gap-2">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold tracking-wide text-accent">{KIND[item.kind]}</span>
          {inboxStatus(item) === "needs_answer"
            ? <span className="text-[11px] font-bold tracking-wide rounded-full bg-soft text-accent px-2 py-0.5">NEEDS YOUR ANSWER</span>
            : <span className="text-[11px] font-bold tracking-wide rounded-full border border-amber text-amber px-2 py-0.5">MISSING: {missingNote(item).toUpperCase()}</span>}
        </div>
        <div className="font-semibold">{item.title}</div>
        <div className="text-xs text-muted mt-0.5">{by === "System" ? "System" : by.includes("@") ? "Uploaded" : `${by} asked`}{item.for_person ? ` · for ${item.for_person}` : ""} · {item.origin} · {item.file_path ? <a href={`/api/capture/${item.id}`} target="_blank" rel="noreferrer" className="font-semibold text-accent">View the file</a> : <a href={item.origin_href} className="font-semibold text-accent">Open in {item.origin_label}</a>}</div>
      </div>
      {item.thread && (
        <div>
          <button onClick={() => setThread((v) => !v)} className="text-xs font-semibold text-accent min-h-8">{thread ? "Hide" : "Show"} the conversation</button>
          {thread && <div className="flex flex-col gap-1 text-xs mt-1">{item.thread.map((t, i) => <div key={i} className={t.who === "you" ? "text-fg" : "text-muted"}><span className="font-semibold">{t.who === "you" ? "You" : "Assistant"}:</span> {t.text}</div>)}</div>}
        </div>
      )}
      {showRead && <ReadFields id={item.id} rr={item.read_result as ReadShape} />}
      {item.read_result?.plan && item.read_result.plan.length > 0 && (
        <div className="rounded-xl bg-soft px-3 py-2 text-xs">
          <div className="font-bold tracking-wide text-muted mb-1">IF YOU SAY YES</div>
          <ul className="flex flex-col gap-1">{item.read_result.plan.map((p, i) => { const o = typeof p === "string" ? { t: "link" as const, text: p } : p; return (<li key={i} className="flex gap-2"><span className={`shrink-0 rounded px-1.5 text-[10px] font-bold leading-5 ${o.t === "file" ? "bg-accent text-white" : "bg-line text-muted"}`}>{o.t === "file" ? "FILED" : "LINK"}</span><span>{o.text}</span></li>); })}</ul>
          {(() => { const d = destination(item.read_result as DestRead | null); const w = folderWarnings(item.read_result as DestRead | null); return (<>
            {d && <div className="mt-1.5"><span className="font-bold tracking-wide text-muted">FOLDER </span>{d.text}</div>}
            {w.length > 0 && <div className="mt-1 font-semibold text-amber">Check the folder: {w.join(" ")}</div>}
          </>); })()}
          {item.options.includes("File it and open a reimbursement claim") && item.read_result.claim_plan && <div className="mt-1 text-muted">With a claim, also: {item.read_result.claim_plan.replace("LINK ", "link: ")}</div>}
        </div>
      )}
      {me && otherId && (
        <div className="text-xs flex items-center gap-2 flex-wrap">
          {assignedName && <span className="rounded-full bg-soft px-2.5 py-0.5 font-semibold">{item.assigned_to === me ? "Handed to you" : `Handed to ${assignedName}`}</span>}
          {item.assigned_to !== otherId && <button disabled={handBusy} onClick={() => hand(otherId)} className="font-semibold text-accent min-h-8 disabled:opacity-50">Hand to {names[otherId]}</button>}
          {item.assigned_to && item.assigned_to !== null && <button disabled={handBusy} onClick={() => hand(item.assigned_to === me ? null : me)} className="font-semibold text-accent min-h-8 disabled:opacity-50">{item.assigned_to === me ? "Hand back to anyone" : "Take it"}</button>}
        </div>
      )}
      {inboxStatus(item) === "needs_answer" && isFiledByCard(item.read_result as DestRead) && <PaidWith item={item} known={paid.known} suggestion={paid.suggestions[item.id] ?? null} />}
      {item.read_result?.home && !isFiledByCard(item.read_result as DestRead) && <FolderFix item={item} />}
      <div className="text-sm font-semibold text-amber">{item.missing}</div>
      {vehicleMissing
        ? <NeededToContinue id={item.id} vehicles={item.options.filter((o) => o !== NOT_VEHICLE)} onNotVehicle={() => onAnswer(NOT_VEHICLE)} notVehicleLabel={NOT_VEHICLE} />
        : <div className="flex flex-wrap gap-1.5">
        {item.options.map((o) => <button key={o} onClick={() => onAnswer(o)} className="min-h-10 px-3 rounded-full border border-line text-sm font-semibold">{o}</button>)}
      </div>}
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
function CapturePanel({ kind, claimId, onDone, compact = false }: { kind: string; claimId: string | null; onDone: (n: number) => void; compact?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLInputElement>(null);
  const [names, setNames] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState("");
  const [docId, setDocId] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const bulk = kind === "bulk";
  const title = kind === "photo" ? "Scan with AI: take a photo" : kind === "file" ? "Scan with AI: upload a file" : "Scan with AI: bulk drop";
  const hint = kind === "photo" ? "One document per photo: a receipt, a label, a serial plate, a form. If it has more pages, add them after. You will get one question; most are a single tap." : kind === "file" ? "One document: a PDF or an image. A multi-page PDF is already one file; for photos of a longer receipt, add the other pages after." : "Drop a shoebox of scans and photos. Each file is its own item and nothing is filed without your tap; pages that look like one document are offered as a set.";

  async function take(list: FileList | null) {
    if (!list || !list.length) return;
    // Several files dropped at once become separate documents (like Bulk drop); the picker itself still takes one document.
    const asBulk = bulk || list.length > 1;
    const picked = asBulk ? Array.from(list) : [list[0]];
    setNames(picked.map((f) => f.name)); setStatus("Saving…"); setDocId(null); setPageCount(0);
    const out: CapturedFile[] = [];
    for (const f of picked) out.push(await storeFile(f));
    const r = await recordCapture(asBulk ? "bulk" : (kind as "photo" | "file" | "bulk"), out, claimId);
    const bad = r.failed?.length ?? 0;
    setStatus(bad ? `${bad} of ${out.length} did not upload. Saved by name only; see the Inbox to retry.` : `Saved ${r.stored} file${r.stored === 1 ? "" : "s"}.${r.duplicates?.length ? ` ${r.duplicates.length} look like repeats; the Inbox asks.` : ""} Reading…`);
    onDone(out.length);
    if (!asBulk && r.ids?.[0]) { setDocId(r.ids[0]); setPageCount(1); }
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
    <div className={`card mb-4 flex flex-col gap-2 ${compact ? "" : "border-accent"}`}>
      {!compact && <div className="flex items-baseline justify-between"><div className="font-semibold">{title}</div><Link href="/inbox" className="text-xs text-muted">Close</Link></div>}
      {claimId && <p className="text-xs font-semibold text-accent">This will be added to the open claim.</p>}
      {!compact && <p className="text-xs text-muted">{hint}</p>}
      {kind !== "photo" ? (
        <div role="button" tabIndex={0} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files); }} onClick={() => inputRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
          className={`${compact ? "min-h-16" : "min-h-32"} rounded-xl border-2 border-dashed flex items-center justify-center text-center px-3 text-sm font-semibold cursor-pointer ${over ? "border-accent bg-soft" : "border-line"}`}>
          {bulk ? "Scan with AI: drop files here, or tap to choose" : compact ? "Scan with AI: drop or choose a photo or file" : "Drop a file or image here, or tap to choose from your Photos or Files"}
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} className="min-h-12 rounded-xl bg-accent text-white font-semibold">Open camera</button>
      )}
      <input ref={inputRef} type="file" className="hidden" multiple accept={kind === "photo" ? "image/*" : "image/*,application/pdf"} capture={kind === "photo" ? "environment" : undefined} onChange={(e) => { void take(e.target.files); e.target.value = ""; }} />
      <input ref={pageRef} type="file" className="hidden" accept="image/*" capture={kind === "photo" ? "environment" : undefined} onChange={(e) => { void more(e.target.files); e.target.value = ""; }} />
      <p className="text-[11px] text-muted">Read by AI (the file is sent to Anthropic), so it is not private. For bank or card statements, or anything with account numbers, use Money › Statements (private) instead.</p>
      {names.length > 0 && <div className="text-xs text-green font-semibold">{status || "Saving…"} ({names.join(", ")})</div>}
      {docId && <button onClick={() => pageRef.current?.click()} className="min-h-11 rounded-xl border border-line font-semibold text-sm">Add another page to this document{pageCount > 1 ? ` (${pageCount} so far)` : ""}</button>}
    </div>
  );
}

// "Is that the right folder?" Ask in words, or pick another folder. Nothing is filed until the Yes tap.
function FolderFix({ item }: { item: InboxItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<string[]>([]);
  const [words, setWords] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canRule, setCanRule] = useState(false);
  async function toggle() {
    const next = !open; setOpen(next); setMsg(null);
    if (next && !choices.length) { const r = await getFolderChoices(item.id); if (r.ok && r.choices) setChoices(r.choices); }
  }
  async function run(input: { folder?: string; request?: string }) {
    setBusy(true); const r = await changeFiling(item.id, input).catch(() => ({ ok: false, message: "That did not work. Try again.", changed: false })); setBusy(false);
    setMsg(r.message); if (r.changed) { setWords(""); setCanRule(true); router.refresh(); }
  }
  return (
    <div className="text-xs">
      <button type="button" onClick={toggle} className="font-semibold text-accent min-h-8">{open ? "Hide folder options" : "Wrong folder? Ask or change it"}</button>
      {open && (
        <div className="mt-1 flex flex-col gap-2 rounded-xl border border-line p-2">
          <button type="button" disabled={busy} onClick={() => void run({ request: "Check whether this folder is correct for this document. If it is clearly wrong, move it to the right one." })} className="min-h-10 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-40">{busy ? "Checking…" : "Check this folder for me"}</button>
          <form onSubmit={(e) => { e.preventDefault(); if (words.trim()) void run({ request: words }); }} className="flex gap-2">
            <input value={words} onChange={(e) => setWords(e.target.value)} placeholder="Is this the right folder? Or: put it under Home" className="flex-1 min-h-10 rounded-xl border border-line bg-bg px-3 text-sm" />
            <button type="submit" disabled={busy || !words.trim()} className="min-h-10 px-3 rounded-xl bg-soft text-sm font-semibold disabled:opacity-40">{busy ? "…" : "Ask"}</button>
          </form>
          <select value="" disabled={busy || !choices.length} onChange={(e) => { if (e.target.value) void run({ folder: e.target.value }); }} className="min-h-10 rounded-xl border border-line bg-bg px-2 text-sm">
            <option value="">{choices.length ? "Or pick a folder…" : "Loading folders…"}</option>
            {choices.map((c) => <option key={c} value={c}>{c.replace("Organized/", "")}</option>)}
          </select>
          {msg && <div className="text-sm">{msg}</div>}
          {canRule && <button type="button" disabled={busy} onClick={async () => { setBusy(true); const r = await saveFilingRule(item.id).catch(() => ({ ok: false, message: "Could not save the rule." })); setBusy(false); setMsg(r.message); if (r.ok) setCanRule(false); }} className="min-h-10 rounded-xl border border-line text-sm font-semibold disabled:opacity-40">Always file this vendor here</button>}
        </div>
      )}
    </div>
  );
}

// Decided: what you answered in the last 30 days, one line each. Everything stays on record; this is only the view.
function DecidedList({ items, names }: { items: DecidedItem[]; names: Record<string, string> }) {
  const [fixing, setFixing] = useState<string | null>(null);
  if (!items.length) return <div className="card text-muted">Nothing decided in the last {DECIDED_DAYS} days.</div>;
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" }) : "");
  return (
    <div className="card p-0 divide-y divide-line">
      {items.map((d) => (
        <div key={d.id} className="px-3 py-2.5 flex items-start gap-3">
          <span className="text-green font-bold mt-0.5" aria-hidden="true">✓</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{d.title}</div>
            <div className="text-xs text-muted">{decidedOutcome(d.filed, d.resolution)} · {when(d.resolved_at)}{d.resolved_by && names[d.resolved_by] ? ` · ${names[d.resolved_by]}` : ""}{d.file_path ? <> · <a href={`/api/capture/${d.id}`} target="_blank" rel="noreferrer" className="font-semibold text-accent">View the file</a></> : null}</div>
            {d.folder_note && <div className="text-xs text-muted">{d.folder_note}</div>}
            {d.read && !("error" in d.read) && ["receipt", "bill", "warranty", "service_report", "form", "other"].includes(String(d.read.kind ?? "")) && (
              fixing === d.id
                ? <div className="mt-2 flex flex-col gap-1.5">
                    {d.amend_block ? <div className="text-xs text-amber font-semibold">{d.amend_block}</div> : <ReadFields id={d.id} rr={d.read as ReadShape} decided />}
                    <button type="button" onClick={() => setFixing(null)} className="self-start min-h-11 text-xs font-semibold text-accent">Close</button>
                  </div>
                : <button type="button" onClick={() => setFixing(d.id)} className="min-h-11 text-xs font-semibold text-accent">Fix details</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// "Paid with": optional, chosen before the Yes tap. A suggestion (only when this person's last three receipts from the vendor agree) is
// highlighted with its reason; Skip for now leaves the receipt without a card (the matcher or the 7-day question settles it later).
function PaidWith({ item, known, suggestion }: { item: InboxItem; known: string[]; suggestion: { card: string; reason: string } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const pw = item.read_result?.paid_with;
  const printed = (item.read_result as { card_last4?: string | null; card_brand?: string | null } | null);
  async function choose(v: string) { setBusy(true); await setInboxPaidWith(item.id, v).catch(() => null); setBusy(false); setTyping(false); setText(""); router.refresh(); }
  const chip = "min-h-10 px-3 rounded-full border text-sm font-semibold disabled:opacity-50";
  if (pw?.value || pw?.skipped) {
    return (
      <div className="text-xs flex items-center gap-2 flex-wrap">
        <span className="font-bold tracking-wide text-muted">PAID WITH</span>
        <span className="font-semibold">{pw.value ?? "No card yet (skipped for now)"}</span>
        <button disabled={busy} onClick={() => choose(CLEAR)} className="font-semibold text-accent min-h-8 disabled:opacity-50">Change</button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs"><span className="font-bold tracking-wide text-muted">PAID WITH </span><span className="text-muted">(optional){printed?.card_last4 ? ` · the paper shows ${printed.card_brand && printed.card_brand !== "null" ? printed.card_brand + " " : ""}${printed.card_last4}` : ""}</span></div>
      {suggestion && <div className="text-xs text-muted">{suggestion.reason}.</div>}
      <div className="flex flex-wrap gap-1.5">
        {suggestion && <button disabled={busy} onClick={() => choose(suggestion.card)} className={`${chip} border-accent bg-accent text-white`}>{suggestion.card} (likely)</button>}
        {known.filter((c) => c !== suggestion?.card).map((c) => <button key={c} disabled={busy} onClick={() => choose(c)} className={`${chip} border-line`}>{c}</button>)}
        <button onClick={() => setTyping(true)} className={`${chip} border-line text-accent`}>Another card or account</button>
        <button disabled={busy} onClick={() => choose(SKIP)} className={`${chip} border-line text-muted`}>Skip for now</button>
      </div>
      {typing && (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) void choose(text.trim()); }} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Name and last four, e.g. Amex 1004" className="min-h-10 flex-1 rounded-lg border border-line bg-bg px-3 text-sm" />
          <button type="submit" disabled={busy || !text.trim()} className="min-h-10 px-3 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">Save</button>
        </form>
      )}
    </div>
  );
}
