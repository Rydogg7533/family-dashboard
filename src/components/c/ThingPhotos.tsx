"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addThingPhotos, removeThingPhoto } from "@/app/things/actions";
import { uploadThingPhotos } from "@/lib/things-upload";

export function ThingPhotos({ itemId, photos }: { itemId: string; photos: { id: string; name: string | null }[] }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const router = useRouter();
  async function add(list: FileList | null) {
    const files = Array.from(list ?? []).filter((x) => x.type.startsWith("image/"));
    if (pick.current) pick.current.value = "";
    if (!files.length) return;
    setBusy(true); setErr(null);
    try { const up = await uploadThingPhotos(files); const r = await addThingPhotos(itemId, up); if (!r.ok) throw new Error(r.error); router.refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not add the photo."); }
    setBusy(false);
  }
  return (
    <div className="flex flex-col gap-2">
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">{photos.map((p) => (
          <div key={p.id} className="relative shrink-0">
            <a href={`/api/thing-photo/${p.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/thing-photo/${p.id}`} alt={p.name ?? "Photo"} className="h-48 w-auto max-w-[80vw] rounded-xl object-cover bg-soft" loading="lazy" />
            </a>
            <button type="button" disabled={busy} onClick={async () => { setBusy(true); const r = await removeThingPhoto(p.id, itemId); setBusy(false); if (!r.ok) setErr(r.error ?? "Could not hide it."); else router.refresh(); }} className="absolute top-1 right-1 bg-black/60 text-white text-[11px] font-semibold rounded-full px-2 min-h-7">Hide</button>
          </div>))}
        </div>
      )}
      <button type="button" disabled={busy || photos.length >= 12} onClick={() => pick.current?.click()} className="min-h-10 rounded-xl border border-line text-sm font-semibold disabled:opacity-40 w-fit px-4">{busy ? "Working…" : photos.length ? "Add a photo" : "Add the first photo"}</button>
      <p className="text-[11px] text-muted">Hiding a photo only removes it from view. The file is kept.</p>
      <input ref={pick} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void add(e.target.files)} />
      {err && <div className="text-sm text-red font-semibold">{err}</div>}
    </div>
  );
}
