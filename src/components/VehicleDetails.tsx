import type { Vehicle } from "@/lib/a-shared";
import { fmtDate } from "@/lib/a-shared";
import { Fold } from "@/components/Fold";
import { VEHICLE_SECTIONS, type ServiceEntry, type Warranty } from "@/lib/vehicle-fields";

// Read-only view of everything the form holds. Only filled fields are shown; empty sections do not appear.
export function VehicleDetails({ v }: { v: Vehicle }) {
  const d = (v.details ?? {}) as Record<string, unknown>;
  const warranties = (d.warranties as Warranty[]) ?? [];
  const service = (d.serviceLog as ServiceEntry[]) ?? [];
  const sections = VEHICLE_SECTIONS.map((s) => ({ s, rows: s.fields.filter((f) => d[f.key] != null && String(d[f.key]) !== "") })).filter((x) => x.rows.length);
  if (!sections.length && !warranties.length && !service.length && !v.vinPointer) return <div className="card text-sm text-muted mt-3">No details yet. Tap Edit details to add insurance, roadside help, warranties and specs.</div>;
  const val = (type: string | undefined, x: unknown) => (type === "date" ? fmtDate(String(x)) : String(x));
  return (
    <>
      {warranties.length > 0 && (
        <Fold id="veh-warranties" title="Warranties" summary={`${warranties.length}`} defaultOpen>
        <div className="card !py-1">{warranties.map((w, i) => (
          <div key={i} className="py-2 border-b border-line last:border-b-0">
            <div className="font-semibold text-sm">{w.item || "Warranty"}{w.provider ? ` · ${w.provider}` : ""}</div>
            <div className="text-xs text-muted">{w.start ? fmtDate(w.start) : "?"} to {w.end ? fmtDate(w.end) : "?"}{w.miles ? ` · ${Number(w.miles).toLocaleString()} mi` : ""}{w.terms ? ` · ${w.terms}` : ""}{w.proof ? ` · proof: ${w.proof}` : ""}</div>
          </div>))}</div>
        </Fold>
      )}
      {sections.map(({ s, rows }) => (
        <Fold key={s.id} id={`veh-${s.id}`} title={s.title} summary={`${rows.length}`}>
          <dl className="card text-sm">{rows.map((f) => (<div key={f.key} className="flex justify-between gap-3 py-1 border-b border-line last:border-b-0"><dt className="text-muted shrink-0">{f.label}</dt><dd className="text-right">{val(f.type, d[f.key])}</dd></div>))}</dl>
        </Fold>
      ))}
      {service.length > 0 && (
        <Fold id="veh-service" title="Service history" summary={`${service.length}`}>
        <div className="card !py-1">{service.map((r, i) => (
          <div key={i} className="py-2 border-b border-line last:border-b-0">
            <div className="font-semibold text-sm">{r.what}{r.cost ? ` · $${r.cost}` : ""}</div>
            <div className="text-xs text-muted">{r.date ? fmtDate(r.date) : "date not recorded"}{r.miles ? ` · ${Number(r.miles).toLocaleString()} mi` : ""}{r.shop ? ` · ${r.shop}` : ""}{r.proof ? ` · receipt: ${r.proof}` : ""}</div>
          </div>))}</div>
        </Fold>
      )}
    </>
  );
}
