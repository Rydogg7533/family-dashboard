"use client";
// Statements upload: the file goes straight from the browser to the private owners-only "statements" bucket, then one row is recorded.
// The Mac mini reads it later with local OCR. Nothing here, or anywhere on this path, calls a model.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient as createBrowserSb } from "@/lib/supabase/client";
import { registerStatement } from "@/app/money/statements/actions";

const OK = ["application/pdf", "image/jpeg", "image/png"];
const MAX = 50 * 1024 * 1024;

export function StatementUpload({ pending }: { pending: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);

  // While something is waiting for or being read by the Mac mini, look again every few seconds.
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => router.refresh(), 6000);
    return () => clearInterval(t);
  }, [pending, router]);

  async function take(list: FileList | null) {
    if (!list || !list.length) return;
    setBusy(true); setLines([]);
    const sb = createBrowserSb();
    const { data: { user } } = await sb.auth.getUser();
    const out: string[] = [];
    for (const f of Array.from(list)) {
      if (!user) { out.push(`${f.name}: sign in again first`); continue; }
      if (!OK.includes(f.type)) { out.push(`${f.name}: only PDF, JPG or PNG files can be read`); continue; }
      if (f.size > MAX) { out.push(`${f.name}: larger than 50 MB`); continue; }
      try {
        const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await f.arrayBuffer()))).map((b) => b.toString(16).padStart(2, "0")).join("");
        const safe = f.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
        const key = `${user.id}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
        const up = await sb.storage.from("statements").upload(key, f, { contentType: f.type, upsert: false });
        if (up.error) { out.push(`${f.name}: ${up.error.message}`); continue; }
        const r = await registerStatement({ path: key, name: f.name, mime: f.type, size: f.size, sha256: sha });
        out.push(r.ok ? `${f.name}: received. The Mac mini will read it shortly.` : `${f.name}: ${r.reason}`);
      } catch { out.push(`${f.name}: could not upload, try again`); }
    }
    setLines(out); setBusy(false); router.refresh();
    if (input.current) input.current.value = "";
  }

  return (
    <div className="card">
      <div
        className={`rounded-xl border-2 border-dashed px-4 py-6 text-center ${over ? "border-accent bg-soft" : "border-line"}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files); }}
      >
        <div className="text-sm font-semibold mb-1">Drop a statement here</div>
        <div className="text-xs text-muted mb-3">PDF, JPG or PNG, up to 50 MB. Several at once is fine.</div>
        <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" multiple className="hidden" onChange={(e) => void take(e.target.files)} />
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="min-h-10 px-4 rounded-xl bg-soft text-sm font-semibold disabled:opacity-40">{busy ? "Uploading…" : "Choose files"}</button>
      </div>
      {lines.length > 0 && <div className="mt-3 flex flex-col gap-1">{lines.map((l, i) => <div key={i} className="text-xs text-muted">{l}</div>)}</div>}
    </div>
  );
}
