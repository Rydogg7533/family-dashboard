"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeFilingRule } from "@/app/settings/filing-rules/actions";

export function RemoveRuleButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <button disabled={busy} onClick={async () => { setBusy(true); await removeFilingRule(id); router.refresh(); }} className="shrink-0 min-h-10 px-3 rounded-xl border border-line text-sm font-semibold disabled:opacity-40">{busy ? "…" : "Remove"}</button>;
}
