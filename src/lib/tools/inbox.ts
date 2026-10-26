import "server-only";
import type { Tool } from "@/lib/tools/types";
import { readCapture } from "@/app/inbox/read";

const BATCH = 8;   // a Vercel function cannot sit through 80 vision reads; eight is well inside one invocation

// Re-read documents that were read before the reader returned line items (capture-read-v5 and earlier), so
// they gain lines on the current category list. Idempotent: skips anything that already has lines, so asking
// again continues where it left off and asking once more after the end does nothing. A re-read never touches
// status, filed or resolution; on a resolved item it also clears missing and options afterwards, so no stale
// question or old button is left on it (build rule: reset an item by clearing options, not just read state).
export const inboxTools: Tool[] = [
  {
    name: "inbox.reread", title: "Re-read old documents", kind: "write", tier: 2, ownerOnly: true,
    description: "Re-read documents the app read before it could see line items, eight at a time, so they get lines on the current categories. Skips anything that already has lines. Ask again until it says none are left.",
    input: {},
    async run(_a, c) {
      const { data } = await c.sb.from("inbox_items").select("id, status, read_result").not("read_result", "is", null).not("file_path", "is", null).order("captured_at", { ascending: true }).limit(500);
      const needs = (r: { read_result: unknown }) => { const rr = r.read_result as { lines?: unknown; error?: unknown } | null; return !!rr && !rr.error && !Array.isArray(rr.lines); };
      const all = ((data ?? []) as { id: string; status: string; read_result: unknown }[]).filter(needs);
      const batch = all.slice(0, BATCH);
      if (!batch.length) return { ok: true, summary: "Every readable document already has line items. Nothing to re-read.", data: { done: 0, failed: 0, left: 0 } };
      let done = 0, failed = 0;
      for (const r of batch) {
        try {
          // readCapture refuses an item with read_at set ("already read"), so clear that first. The old read_result
          // stays until the new one lands: if the read fails, the item is picked up again next time, not left blank.
          await c.sb.from("inbox_items").update({ read_at: null }).eq("id", r.id);
          const res = await readCapture(r.id);
          if (!res.ok || ("already" in res && res.already)) { failed++; continue; }
          if (r.status !== "open") await c.sb.from("inbox_items").update({ missing: null, options: null }).eq("id", r.id);
          done++;
        } catch { failed++; }
      }
      const left = all.length - done;
      return { ok: true, summary: `Re-read ${done} document${done === 1 ? "" : "s"}${failed ? `, ${failed} could not be read` : ""}. ${left > 0 ? `${left} still to go: ask again.` : "That was the last of them."}`, data: { done, failed, left } };
    },
  },
];
