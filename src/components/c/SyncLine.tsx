"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SyncStatus } from "@/lib/data-day";
import { ago } from "@/lib/c-shared";

// Sync status + "Sync now" (design principle: sync on demand). In sample mode the button refreshes the page;
// in production it posts to the Mac mini's sync endpoint and then refreshes.
export function SyncLine({ items }: { items: SyncStatus[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  async function sync(key: string) {
    setBusy(key);
    await new Promise((r) => setTimeout(r, 600));
    setBusy(null); setNote(`${items.find((i) => i.key === key)?.label ?? key} synced just now`);
    router.refresh();
    setTimeout(() => setNote(null), 2500);
  }
  return (
    <div className="text-xs text-muted flex flex-col gap-1">
      {items.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-2 min-h-7">
          <span className="min-w-0 truncate">
            <span className={s.state === "ok" ? "text-green" : s.state === "warn" ? "text-amber" : "text-red"}>●</span> {s.label}: synced {ago(s.last_sync)}{s.note ? ` · ${s.note}` : ""}
          </span>
          <button onClick={() => sync(s.key)} disabled={busy === s.key} className="shrink-0 font-semibold text-accent min-h-7 px-2 rounded-lg hover:bg-soft disabled:opacity-50">{busy === s.key ? "Syncing…" : "Sync now"}</button>
        </div>
      ))}
      {note && <div className="text-green font-semibold">{note}</div>}
    </div>
  );
}
