import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { DueChip, SectionTitle } from "@/components/registers";
import { ClaimActions } from "@/components/ClaimActions";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/a-shared";

export const dynamic = "force-dynamic";

type Claim = { id: string; title: string; kind: string; vendor: string | null; vehicle_id: string | null; expected_amount: number | null; status: string; check_by: string | null; notes: string | null; documents: { role: string; inbox_id?: string; name: string }[]; opened_by: string; created_at: string };

export default async function Claims() {
  let claims: Claim[] = [], vehicles = new Map<string, string>();
  if (hasSupabaseEnv()) {
    const sb = await createClient();
    const [{ data: c }, { data: v }] = await Promise.all([sb.from("claims").select("*").order("created_at", { ascending: false }), sb.from("vehicles").select("id,short")]);
    claims = (c ?? []) as Claim[]; vehicles = new Map((v ?? []).map((x) => [x.id as string, x.short as string]));
  }
  const live = claims.filter((c) => ["open", "submitted"].includes(c.status));
  const done = claims.filter((c) => !["open", "submitted"].includes(c.status));
  const card = (c: Claim) => (
    <Card key={c.id} className="flex flex-col gap-2">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-wide text-muted uppercase">{c.kind} · {c.status}{c.vehicle_id && vehicles.get(c.vehicle_id) ? ` · ${vehicles.get(c.vehicle_id)}` : ""}</div>
          <div className="font-semibold">{c.title}</div>
          <div className="text-xs text-muted">{c.expected_amount != null ? `Expecting $${Number(c.expected_amount).toFixed(2)} · ` : ""}opened {fmtDate(c.created_at.slice(0, 10))} by {c.opened_by}</div>
        </div>
        {c.check_by && ["open", "submitted"].includes(c.status) && <div className="shrink-0 text-right"><div className="text-[10px] text-muted">CHECK</div><DueChip date={c.check_by} warnDays={7} /></div>}
      </div>
      {c.documents.length > 0 && (
        <div className="text-xs"><div className="font-semibold text-muted mb-0.5">Documents</div>
          {c.documents.map((d, i) => <div key={i}>{d.inbox_id ? <a className="text-accent font-semibold" href={`/api/capture/${d.inbox_id}`} target="_blank" rel="noreferrer">{d.name}</a> : d.name} <span className="text-muted">· {d.role}</span></div>)}
        </div>
      )}
      {["open", "submitted"].includes(c.status) && <Link href={`/inbox?capture=file&claim=${c.id}`} className="text-xs font-semibold text-accent">Add a document to this claim ›</Link>}
      {c.notes && <details className="text-xs text-muted"><summary className="cursor-pointer font-semibold">History</summary><pre className="whitespace-pre-wrap font-sans mt-1">{c.notes}</pre></details>}
      <ClaimActions id={c.id} status={c.status} />
    </Card>
  );
  return (
    <>
      <H1 right={`${live.length} open`}>Claims</H1>
      <p className="text-xs text-muted mb-3">Reimbursements, warranty claims and disputes: the documents, the amount expected, and when to check back.</p>
      {live.length === 0 ? <Card className="text-muted text-sm">No open claims. One opens when you file a receipt with &ldquo;open a reimbursement claim&rdquo;.</Card> : <div className="flex flex-col gap-2">{live.map(card)}</div>}
      {done.length > 0 && (<><SectionTitle>Finished</SectionTitle><div className="flex flex-col gap-2">{done.map(card)}</div></>)}
    </>
  );
}
