"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setChildFeature, setChildPaused } from "@/app/settings/people/children-actions";
import { TIER_LABEL, WHY_TEXT, featureState, type ChildFeature, type FeatureMode } from "@/lib/child-access";
import type { ChildRow } from "@/lib/children";

const seg = (on: boolean) => `min-h-9 px-3 text-xs font-semibold rounded-lg ${on ? "bg-accent text-white" : "bg-soft"} disabled:opacity-50`;

export function ChildAccess({ child, features, ages, canEdit }: { child: ChildRow; features: ChildFeature[]; ages: Record<string, number>; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => { setErr(null); start(async () => { try { const r = await fn(); if (!r.ok) setErr(r.error ?? "That didn't work."); router.refresh(); } catch { setErr("That took too long. Try again."); } }); };
  const paused = !!child.paused_at;
  const tiers = [1, 2, 3, 4];
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="card flex items-center justify-between gap-3">
        <div><div className="font-semibold">Pause {child.display_name}&apos;s page</div><div className="text-xs text-muted mt-0.5">{paused ? "Paused. They see a plain notice and nothing else." : "Turns everything off at once. Resume any time."}</div></div>
        {canEdit && <button type="button" disabled={pending} onClick={() => run(() => setChildPaused(child.id, !paused))} className={seg(paused)}>{paused ? "Resume" : "Pause"}</button>}
      </div>
      {!child.profile_id && <div className="rounded-xl bg-soft px-3 py-2 text-xs text-muted">{child.display_name} has no login yet. These settings apply as soon as they get one, and to their page on a shared screen.</div>}
      {tiers.map((t) => {
        const list = features.filter((f) => f.tier === t);
        if (!list.length) return null;
        return (
          <div key={t} className="card flex flex-col gap-3">
            <div className="font-semibold">{TIER_LABEL[t]} <span className="text-xs text-muted font-normal">· from about {Math.min(...list.map((f) => ages[f.key] ?? f.default_min_age))}</span></div>
            {list.map((f) => {
              const st = featureState(f, child, ages);
              return (
                <div key={f.key} className={`border-t border-line pt-3 first:border-t-0 first:pt-0 ${f.built ? "" : "opacity-70"}`}>
                  <div className="flex justify-between gap-2 items-baseline">
                    <div className="font-semibold">{f.label}{f.sensitive && <span className="text-[10px] font-bold text-amber ml-1.5 align-middle">NEEDS YOUR OK</span>}{!f.built && <span className="text-[10px] font-bold text-muted ml-1.5 align-middle">COMING</span>}</div>
                    <div className={`text-xs shrink-0 ${st.on ? "text-green" : "text-muted"}`}>{WHY_TEXT[st.why](st)}</div>
                  </div>
                  <div className="text-xs text-muted mt-0.5">{f.description}</div>
                  {canEdit && (
                    <div className="flex gap-1.5 mt-2">
                      {(["auto", "on", "off"] as FeatureMode[]).map((m) => <button key={m} type="button" disabled={pending} onClick={() => run(() => setChildFeature(child.id, f.key, m))} className={seg(st.mode === m)}>{m === "auto" ? "Automatic" : m === "on" ? "Always on" : "Off"}</button>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {err && <div role="alert" className="rounded-xl bg-red-bg text-red px-3 py-2 font-semibold">{err}</div>}
    </div>
  );
}
