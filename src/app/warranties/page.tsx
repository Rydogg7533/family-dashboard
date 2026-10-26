import { todayIso } from "@/lib/google-calendar";
import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { SectionTitle } from "@/components/registers";
import { AddWarranty } from "@/components/AddWarranty";
import { createClient, hasSupabaseEnv, getRequestUser } from "@/lib/supabase/server";
import { syncWarrantyTasks, stateOf, type WarrantyRow, type WState } from "@/lib/warranties";
import { fmtDate } from "@/lib/a-shared";

export const dynamic = "force-dynamic";

const GROUPS: { id: WState; title: string; note: string }[] = [
  { id: "soon", title: "Ending soon", note: "A reminder task is created about 30 days before: extend or let it lapse." },
  { id: "needs_end", title: "Needs an end date", note: "The paper didn’t say, or it hasn’t been entered. Each one has a task in your list until you add the date or dismiss it." },
  { id: "active", title: "Active", note: "" },
  { id: "expired", title: "Expired", note: "Kept for the record." },
];
const SRC: Record<WarrantyRow["source"], string> = { vehicle: "Vehicle", device: "Device", other: "Other" };

export default async function Warranties() {
  let rows: WarrantyRow[] = [];
  if (hasSupabaseEnv()) {
    const sb = await createClient();
    const user = await getRequestUser();
    rows = user ? await syncWarrantyTasks(sb, user.id) : [];
  }
  const today = await todayIso();
  const by = (s: WState) => rows.filter((w) => stateOf(w, today) === s).sort((a, b) => (a.end ?? "9999").localeCompare(b.end ?? "9999"));
  return (
    <>
      <H1>Warranties</H1>
      <p className="text-sm text-muted mb-2">Everything with a warranty or protection plan, in one list: vehicles, devices, and anything you add here. Receipts filed in the Inbox add to the vehicle list automatically.</p>
      <div className="mb-3"><AddWarranty /></div>
      {rows.length === 0 && <Card className="text-sm text-muted">No warranties yet. File a receipt in the Inbox, add a device with a warranty end, or tap Add warranty.</Card>}
      {GROUPS.map((g) => { const list = by(g.id); if (!list.length) return null; return (
        <section key={g.id}>
          <SectionTitle right={`${list.length}`}>{g.title}</SectionTitle>
          {g.note && <p className="text-xs text-muted mb-1.5">{g.note}</p>}
          <div className="flex flex-col gap-2">{list.map((w) => (
            <Card key={w.key} className="flex flex-col gap-1">
              <div className="flex justify-between items-start gap-2">
                <div className="font-semibold text-[15px] min-w-0">{w.item}</div>
                <div className={`shrink-0 text-xs font-bold ${g.id === "soon" ? "text-amber" : g.id === "expired" ? "text-muted" : g.id === "needs_end" ? "text-amber" : "text-green"}`}>{w.end ? `ends ${fmtDate(w.end)}` : "no end date"}</div>
              </div>
              <div className="text-xs text-muted">{SRC[w.source]} · {w.who}{w.provider ? ` · ${w.provider}` : ""}{w.start ? ` · from ${fmtDate(w.start)}` : ""}</div>
              {w.terms && <div className="text-xs">{w.terms}</div>}
              {w.proof && <div className="text-xs text-muted">Proof: {w.proof}</div>}
              {w.attachments && w.attachments.length > 0 && <div className="text-xs flex flex-wrap gap-x-3 gap-y-1">{w.attachments.map((a, n) => <a key={n} href={`/api/warranty-file/${w.id}/${n}`} target="_blank" rel="noreferrer" className="font-semibold text-accent">{a.role === "receipt" ? "Receipt" : "Warranty info"}: {a.name.length > 28 ? a.name.slice(0, 26) + "…" : a.name}</a>)}</div>}
              {w.source === "other" && w.id && <div><AddWarranty initial={{ id: w.id, item: w.item, provider: w.provider ?? "", for_who: w.who === "Household" ? "" : w.who, start: w.start ?? "", end: w.end ?? "", terms: w.terms ?? "", attachments: w.attachments ?? [] }} /></div>}
              <div className="text-xs"><Link href={w.href} className="font-semibold text-accent">{w.source === "vehicle" ? "Open vehicle to edit" : w.source === "device" ? "Open in Devices" : ""}</Link></div>
            </Card>))}
          </div>
        </section>); })}
    </>
  );
}
