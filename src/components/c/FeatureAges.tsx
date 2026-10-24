"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHouseholdFeatureAge } from "@/app/settings/people/children-actions";
import { TIER_LABEL, type ChildFeature } from "@/lib/child-access";

const sel = "min-h-10 rounded-lg border border-line bg-bg px-2 text-sm";

export function FeatureAges({ features, ages, canEdit }: { features: ChildFeature[]; ages: Record<string, number>; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const change = (key: string, v: string) => { setErr(null); start(async () => { try { const r = await setHouseholdFeatureAge(key, v === "" ? null : Number(v)); if (!r.ok) setErr(r.error); router.refresh(); } catch { setErr("That took too long. Try again."); } }); };
  return (
    <div className="flex flex-col gap-3 text-sm">
      {[1, 2, 3, 4].map((t) => (
        <div key={t} className="card flex flex-col gap-2">
          <div className="font-semibold">{TIER_LABEL[t]}</div>
          {features.filter((f) => f.tier === t).map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-2 border-t border-line pt-2 first:border-t-0 first:pt-0">
              <div className="min-w-0"><div className="font-semibold">{f.label}{!f.built && <span className="text-[10px] font-bold text-muted ml-1.5">COMING</span>}</div><div className="text-xs text-muted">Standard age {f.default_min_age}{ages[f.key] != null ? ` · yours: ${ages[f.key]}` : ""}</div></div>
              <select disabled={!canEdit || pending} value={ages[f.key] ?? ""} onChange={(e) => change(f.key, e.target.value)} className={sel} aria-label={`Minimum age for ${f.label}`}>
                <option value="">Standard ({f.default_min_age})</option>
                {Array.from({ length: 19 }, (_, a) => a).map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          ))}
        </div>
      ))}
      {err && <div role="alert" className="rounded-xl bg-red-bg text-red px-3 py-2 font-semibold">{err}</div>}
    </div>
  );
}
