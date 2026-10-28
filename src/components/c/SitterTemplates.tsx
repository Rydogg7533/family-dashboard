"use client";
// Settings › Sitter › General templates / Per child: named instruction sets. One default each; duplicate, rename, archive (never delete).
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { archiveSitterTemplate, createSitterTemplate, renameSitterTemplate, setDefaultSitterTemplate } from "@/app/settings/sitter/templates-actions";
import type { SitterTemplate, TemplateKind } from "@/lib/sitter-shared";

const inp = "w-full min-h-10 rounded-xl border border-line bg-bg px-3 text-sm";
const btn = "min-h-10 px-4 rounded-xl border border-line text-sm font-semibold disabled:opacity-50";
const prim = "min-h-11 px-4 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50";

export function SitterTemplates({ kind, templates, kids }: { kind: TemplateKind; templates: SitterTemplate[]; kids: { id: string; name: string }[] }) {
  const router = useRouter();
  const [child, setChild] = useState<string>(kids[0]?.id ?? "");
  const [name, setName] = useState(""); const [copy, setCopy] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [ren, setRen] = useState<{ id: string; name: string } | null>(null);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, after?: (id?: string) => void) => { setBusy(true); setErr(null); const r = await fn(); setBusy(false); if (!r.ok) { setErr(r.error ?? "Could not save."); return; } after?.(r.id); router.refresh(); };
  const list = templates.filter((t) => t.kind === kind && (kind === "general" || t.childId === child));
  const forName = kind === "child" ? kids.find((k) => k.id === child)?.name : null;
  return (
    <div className="flex flex-col gap-3">
      {kind === "child" && kids.length > 1 && (
        <div className="flex gap-2 flex-wrap">{kids.map((k) => <button key={k.id} onClick={() => setChild(k.id)} className={`${btn} ${child === k.id ? "bg-soft" : ""}`}>{k.name}</button>)}</div>
      )}
      {kind === "child" && !kids.length && <div className="card text-sm text-muted">Add children under Settings › People first.</div>}
      {list.map((t) => (
        <div key={t.id} className="card flex flex-col gap-1">
          <div className="flex justify-between items-start gap-2">
            {ren?.id === t.id
              ? <div className="flex gap-2 flex-1"><input className={inp} value={ren.name} onChange={(e) => setRen({ id: t.id, name: e.target.value })} autoFocus /><button disabled={busy} onClick={() => run(() => renameSitterTemplate(t.id, ren.name), () => setRen(null))} className={btn}>Save</button><button onClick={() => setRen(null)} className="text-xs font-semibold text-muted px-2">Cancel</button></div>
              : <Link href={`/settings/sitter/templates/${t.id}`} className="font-semibold no-underline">{t.name}</Link>}
            {t.isDefault && <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-green-bg text-green">Default</span>}
          </div>
          <div className="text-xs text-muted">{t.itemCount} line{t.itemCount === 1 ? "" : "s"}{t.itemCount === 0 ? " · empty, open it to write" : ""}</div>
          {ren?.id !== t.id && (
            <div className="flex gap-2 flex-wrap text-xs">
              <Link href={`/settings/sitter/templates/${t.id}`} className="font-semibold text-accent min-h-9 flex items-center">Open</Link>
              {!t.isDefault && <button disabled={busy} onClick={() => run(() => setDefaultSitterTemplate(t.id))} className="font-semibold text-accent min-h-9">Make default</button>}
              <button onClick={() => setRen({ id: t.id, name: t.name })} className="font-semibold text-accent min-h-9">Rename</button>
              <button disabled={busy} onClick={() => run(() => createSitterTemplate(kind, `${t.name} copy`, t.childId, t.id), (id) => { if (id) router.push(`/settings/sitter/templates/${id}`); })} className="font-semibold text-accent min-h-9">Duplicate</button>
              <button disabled={busy} onClick={() => { if (confirm(`Hide “${t.name}”? It is kept, not deleted.`)) run(() => archiveSitterTemplate(t.id)); }} className="font-semibold text-muted min-h-9">Hide</button>
            </div>
          )}
        </div>
      ))}
      {(kind === "general" || child) && (
        <div className="card flex flex-col gap-2">
          <div className="font-semibold text-sm">New {kind === "general" ? "general" : `template for ${forName ?? "this child"}`}</div>
          <input className={inp} placeholder={kind === "general" ? "Name it for the situation: Evening out, Weekday after school, Overnight" : "Name it: School night, Weekend, Sick day"} value={name} onChange={(e) => setName(e.target.value)} />
          {list.length > 0 && <select className={inp} value={copy} onChange={(e) => setCopy(e.target.value)}><option value="">Start empty</option>{list.map((t) => <option key={t.id} value={t.id}>Start from “{t.name}”</option>)}</select>}
          <button disabled={busy || !name.trim()} onClick={() => run(() => createSitterTemplate(kind, name, kind === "child" ? child : null, copy || null), (id) => { setName(""); setCopy(""); if (id) router.push(`/settings/sitter/templates/${id}`); })} className={prim + " self-start"}>Create</button>
        </div>
      )}
      {err && <div className="text-sm text-red">{err}</div>}
    </div>
  );
}
