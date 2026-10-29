"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestFolderScan, saveImportItem, applyImport } from "@/app/settings/vault/import/actions";
import type { ImportItem, ImportRow, VaultImport } from "@/lib/data-vault-import";

// Map your documents (mockup approved 2026-10-29). Three buckets as tabs rather than three long sections:
// on a phone, scrolling past twenty confident cards to reach the four that want a decision is the whole
// problem. Needs you opens first. A confident card is one line; only a card that wants something opens up.
const PILL = "min-h-9 px-3 rounded-full text-[13px] font-semibold inline-flex items-center";
const Spin = () => <span aria-hidden className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin align-[-3px] mr-2" />;

export function VaultImport({ run, items, rows }: { run: VaultImport | null; items: ImportItem[]; rows: ImportRow[] }) {
  const router = useRouter();
  // While the Mac is reading or creating, the page re-reads itself: the person should never have to guess
  // whether anything is happening.
  const working = run?.status === "requested" || run?.status === "scanning" || run?.status === "applying";
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => { if (!document.hidden) router.refresh(); }, 4000);
    return () => clearInterval(t);
  }, [working, router]);

  if (!run || run.status === "done" || run.status === "failed") return <StartScan run={run} />;
  if (working) return <Working run={run} />;
  return <Mapping run={run} items={items} rows={rows} />;
}

function StartScan({ run }: { run: VaultImport | null }) {
  const [folder, setFolder] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const go = () => start(async () => {
    setErr(null);
    const r = await requestFolderScan(folder);
    if (r.ok) router.refresh(); else setErr(r.error ?? "Could not start.");
  });
  return (
    <div className="flex flex-col gap-3">
      {run?.status === "done" && (
        <div className="card border-green flex flex-col gap-1">
          <div className="text-[11px] font-bold tracking-wide text-green">LAST RUN</div>
          <div className="text-sm">{run.created} item{run.created === 1 ? "" : "s"} created in your StewardOS vaults, each tagged <b>StewardOS</b> in 1Password. Nothing already in your vault was changed.</div>
          {run.folder_deleted_at && <div className="text-xs text-muted">The folder was deleted afterwards, as you asked.</div>}
        </div>
      )}
      {run?.status === "failed" && <div className="card border-red text-sm" role="alert">Your Mac could not read that folder. {run.error}</div>}

      <div className="card flex flex-col gap-2">
        <div className="font-semibold text-sm">Gather everything into one folder</div>
        <p className="text-xs text-muted leading-relaxed">Export your documents from 1Password, add photos of anything on paper, and any PDFs you have saved. Don&apos;t worry about naming or sorting them; we read each one.</p>
        <p className="text-xs text-muted leading-relaxed"><b className="text-fg">What this will do:</b> we create new items in your StewardOS vaults, each tagged <b className="text-fg">StewardOS</b> in 1Password. We never change or delete anything already in your vault, so if you already keep copies of these documents you will have both — the tag is how you tell them apart afterwards.</p>
        <label htmlFor="folder" className="text-[11px] font-bold tracking-wide text-muted mt-1">THE FOLDER ON YOUR MAC</label>
        <input id="folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="~/Desktop/Documents to file" className="min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-[16px]" />
        {err && <div className="text-sm text-red font-semibold" role="alert">{err}</div>}
        <button type="button" disabled={busy || folder.trim().length < 2} onClick={go} className="min-h-12 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">{busy ? <><Spin />Asking your Mac…</> : "Read this folder"}</button>
        <div className="text-[11px] text-muted">Your Mac reads the folder, works out what each document is, and brings the list back here. The documents themselves never leave your Mac.</div>
      </div>
    </div>
  );
}

function Working({ run }: { run: VaultImport }) {
  const applying = run.status === "applying";
  return (
    <div className="card flex flex-col gap-2">
      <div className="text-sm font-semibold flex items-center"><Spin />{applying ? "Creating the items in 1Password…" : "Your Mac is reading the folder…"}</div>
      <div className="text-xs text-muted">{applying ? "Each one is created with its scan attached, tagged StewardOS, and linked to its row here." : run.folder}</div>
      {run.found > 0 && !applying && <div className="text-xs text-muted">{run.found} read so far.</div>}
      <div className="text-[11px] text-muted">This page keeps itself up to date; you can leave it.</div>
    </div>
  );
}

function Mapping({ run, items, rows }: { run: VaultImport; items: ImportItem[]; rows: ImportRow[] }) {
  const [tab, setTab] = useState<"needs" | "ready" | "done">("needs");
  const [picking, setPicking] = useState<ImportItem | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const byBucket = useMemo(() => ({
    needs: items.filter((x) => x.bucket === "needs"),
    ready: items.filter((x) => x.bucket === "ready"),
    done: items.filter((x) => x.bucket === "done"),
  }), [items]);
  const ticked = items.filter((x) => x.include && x.row_ids.length > 0).length;
  const stillNeeds = byBucket.needs.filter((x) => x.include && x.row_ids.length === 0).length;
  const shown = byBucket[tab];

  const toggle = (it: ImportItem) => start(async () => { await saveImportItem(it.id, { include: !it.include }); router.refresh(); });
  const apply = (deleteFolder: boolean) => start(async () => {
    setMsg(null);
    const r = await applyImport(run.id, deleteFolder);
    if (r.ok) { setConfirm(false); router.refresh(); } else setMsg(r.error ?? "Could not start.");
  });

  return (
    <div className="flex flex-col gap-3 pb-28">
      <div>
        <div className="text-sm font-semibold">{items.length} document{items.length === 1 ? "" : "s"} read</div>
        <p className="text-xs text-muted leading-relaxed mt-0.5">Check each one, then add them. New items are created in your StewardOS vaults and tagged <b className="text-fg">StewardOS</b>; nothing already in 1Password is changed.</p>
      </div>

      <div className="flex gap-1.5" role="tablist" aria-label="What needs attention">
        {([["needs", "Needs you"], ["ready", "Ready"], ["done", "Already done"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`${PILL} ${tab === id ? "bg-accent text-white border border-accent" : "border border-line text-muted"}`}>{label} {byBucket[id].length}</button>
        ))}
      </div>

      {shown.length === 0 && <div className="card text-sm text-muted">{tab === "needs" ? "Nothing here needs a decision." : tab === "ready" ? "Nothing is ready yet." : "Nothing here was already done."}</div>}

      <div className="flex flex-col gap-2">
        {shown.map((it) => (
          <ItemCard key={it.id} it={it} rows={rows} open={tab === "needs"} onPick={() => setPicking(it)} onToggle={() => toggle(it)} />
        ))}
      </div>

      {msg && <div className="text-sm text-red font-semibold px-1" role="alert">{msg}</div>}

      <div className="fixed left-0 right-0 bottom-0 z-30 border-t border-line bg-bg px-5 pt-2.5 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold">{ticked} ticked</div>
            {stillNeeds > 0 && <div className="text-[11px] text-muted">{stillNeeds} still need{stillNeeds === 1 ? "s" : ""} you</div>}
          </div>
          <button type="button" disabled={busy || ticked === 0} onClick={() => setConfirm(true)} className="min-h-12 px-5 rounded-xl bg-accent text-white font-semibold disabled:opacity-40">{busy ? <><Spin />Working…</> : `Add ${ticked} item${ticked === 1 ? "" : "s"}`}</button>
        </div>
      </div>

      {confirm && (
        <div role="alertdialog" aria-label="Confirm" className="fixed inset-0 z-40 bg-black/80 flex items-end justify-center">
          <div className="w-full max-w-md bg-bg rounded-t-2xl border-t-2 border-accent px-5 pt-3 pb-[max(18px,env(safe-area-inset-bottom))] flex flex-col gap-2.5">
            <div className="font-semibold">Add {ticked} item{ticked === 1 ? "" : "s"} to 1Password?</div>
            <div className="text-xs text-muted leading-relaxed">Each is created in the vault shown on its card, with the scan attached and tagged <b className="text-fg">StewardOS</b>. Your existing items are not touched. {stillNeeds > 0 && `The ${stillNeeds} still waiting on you are left out.`}</div>
            <div className="flex flex-col gap-2 mt-1">
              <button type="button" disabled={busy} onClick={() => apply(true)} className="min-h-12 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">Add, then delete the folder</button>
              <button type="button" disabled={busy} onClick={() => apply(false)} className="min-h-12 rounded-xl border border-line font-semibold">Add, and keep the folder</button>
              <button type="button" disabled={busy} onClick={() => setConfirm(false)} className="min-h-11 text-sm font-semibold text-muted">Not yet</button>
            </div>
            <div className="text-[11px] text-muted">The folder holds unencrypted copies of your documents. The items in 1Password are safe either way.</div>
          </div>
        </div>
      )}

      {picking && <RowPicker it={picking} rows={rows} onClose={() => setPicking(null)} />}
    </div>
  );
}

function ItemCard({ it, rows, open, onPick, onToggle }: { it: ImportItem; rows: ImportRow[]; open: boolean; onPick: () => void; onToggle: () => void }) {
  const chosen = rows.filter((r) => it.row_ids.includes(r.id));
  const second = [it.vault_name, it.date_note, it.file_name].filter(Boolean).join(" · ");
  if (!open) {
    return (
      <div className={`card flex items-center gap-2.5 ${it.bucket === "done" ? "opacity-75" : ""}`}>
        <input type="checkbox" checked={it.include} onChange={onToggle} aria-label={`Include ${it.title || it.file_name}`} className="w-[18px] h-[18px] accent-accent shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{chosen[0]?.label ?? it.title ?? it.file_name}</div>
          <div className="text-xs text-muted truncate">{it.bucket === "done" ? it.reason : second}</div>
        </div>
        {it.bucket !== "done" && <button type="button" onClick={onPick} aria-label="Change the row" className="text-muted shrink-0 min-h-9 px-1">›</button>}
      </div>
    );
  }
  return (
    <div className="card p-0 overflow-hidden flex flex-col">
      <div className="flex gap-2.5 p-3 pb-0">
        <div className="w-[54px] h-[72px] rounded-md bg-soft shrink-0 grid place-items-center text-[10px] text-muted">{it.is_pdf ? "PDF" : "scan"}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold tracking-wide text-amber">NEEDS YOU</span>
            <label className="inline-flex items-center gap-1.5 text-[13px] font-semibold"><input type="checkbox" checked={it.include} onChange={onToggle} className="w-[18px] h-[18px] accent-accent" /> Include</label>
          </div>
          <div className="font-semibold text-sm truncate mt-0.5">{it.file_name}{it.file_count > 1 ? ` + ${it.file_count - 1} more` : ""}</div>
          <div className="text-xs text-muted mt-0.5">{it.reads_as ? `Read: ${it.reads_as}` : "Could not tell what this is"}{it.date_note ? ` · ${it.date_note}` : ""}</div>
        </div>
      </div>
      {it.reason && <div className="mx-3 mt-2.5 rounded-xl bg-amber-bg text-amber text-xs leading-relaxed px-2.5 py-2">{it.reason}</div>}
      <div className="p-3 flex flex-col gap-2.5">
        <div>
          <div className="text-[11px] font-bold tracking-wide text-muted mb-1.5">GOES TO</div>
          <button type="button" onClick={onPick} className="w-full min-h-11 px-3 rounded-lg border border-line bg-bg flex items-center justify-between gap-2 text-left">
            <span className={`text-sm truncate ${chosen.length ? "" : "text-muted"}`}>{chosen.length ? chosen.map((r) => r.label).join(", ") : "Choose a row…"}</span>
            <span aria-hidden className="text-muted">›</span>
          </button>
        </div>
        {it.preview && <details className="text-xs"><summary className="text-accent font-semibold min-h-9 flex items-center">What the scan says</summary><div className="text-muted leading-relaxed mt-1">{it.preview}</div></details>}
      </div>
    </div>
  );
}

// One scan can fill several rows: a family insurance card covers everybody on it. So this picks many, with
// the rows the Mac thought likely at the top, and never hides a row that is already linked -- it says so
// instead, because a renewal is exactly the case where you do want the one that is already filled.
function RowPicker({ it, rows, onClose }: { it: ImportItem; rows: ImportRow[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>(it.row_ids);
  const [busy, start] = useTransition();
  const router = useRouter();
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => r.label.toLowerCase().includes(s)) : rows;
  }, [q, rows]);
  const suggested = matches.filter((r) => it.row_ids.includes(r.id));
  const rest = matches.filter((r) => !it.row_ids.includes(r.id));
  const flip = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const save = () => start(async () => { await saveImportItem(it.id, { row_ids: picked }); onClose(); router.refresh(); });

  const Row = ({ r }: { r: ImportRow }) => (
    <label className={`flex items-center gap-2.5 min-h-12 px-3 rounded-xl border bg-bg ${picked.includes(r.id) ? "border-accent" : "border-line"}`}>
      <input type="checkbox" checked={picked.includes(r.id)} onChange={() => flip(r.id)} className="w-[19px] h-[19px] accent-accent shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate">{r.label}</span>
        <span className="block text-xs text-muted">{r.linked ? "already linked — tick only if this is newer" : "empty"}</span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-40 bg-black/80 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Where does this go?">
      <div className="w-full max-w-md bg-bg rounded-t-2xl border-t-2 border-accent flex flex-col max-h-[86%]">
        <div className="px-5 pt-3 pb-2 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[15px] font-bold">Where does this go?</div>
            <div className="text-xs text-muted truncate">{it.file_name}{it.reads_as ? ` · ${it.reads_as}` : ""}</div>
          </div>
          <button type="button" onClick={onClose} className="min-h-9 px-3.5 rounded-full bg-soft text-[13px] font-semibold shrink-0">Close</button>
        </div>
        <div className="px-5 pb-2 shrink-0">
          <label htmlFor="rowfind" className="sr-only">Find a row</label>
          <input id="rowfind" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a row…" className="w-full min-h-11 px-3 rounded-xl border border-line bg-soft text-[16px]" />
          <div className="text-[11px] text-muted mt-1.5">Tick every person this card covers — one scan can fill several rows.</div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 flex flex-col gap-1.5">
          {suggested.length > 0 && <div className="text-[11px] font-bold tracking-wide text-muted pt-1">SUGGESTED</div>}
          {suggested.map((r) => <Row key={r.id} r={r} />)}
          {rest.length > 0 && <div className="text-[11px] font-bold tracking-wide text-muted pt-2">{suggested.length ? "EVERYTHING ELSE" : "YOUR CHECKLIST"}</div>}
          {rest.map((r) => <Row key={r.id} r={r} />)}
          {matches.length === 0 && <div className="text-sm text-muted py-3">No row matches &ldquo;{q}&rdquo;.</div>}
        </div>
        <div className="px-5 pt-2.5 pb-[max(18px,env(safe-area-inset-bottom))] shrink-0">
          <button type="button" disabled={busy} onClick={save} className="w-full min-h-12 rounded-xl bg-accent text-white font-semibold disabled:opacity-50">{busy ? <><Spin />Saving…</> : picked.length ? `Use ${picked.length} row${picked.length === 1 ? "" : "s"}` : "Use no row"}</button>
        </div>
      </div>
    </div>
  );
}
