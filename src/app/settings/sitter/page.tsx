import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { SitterSheetEditor } from "@/components/c/SitterSheetEditor";
import { SitterNightList } from "@/components/c/SitterNightList";
import { getTemplate, getSections, getNights } from "@/lib/data-sitter";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SitterSettings() {
  const [items, states, nights] = await Promise.all([getTemplate(), getSections(), getNights(["proposed", "scheduled", "awaiting_review", "confirmed"], 20)]);
  let completed = false;
  if (hasSupabaseEnv()) { const sb = await createClient(); const { data } = await sb.from("guided_tasks").select("completed_at").eq("key", "sitter_sheet").maybeSingle(); completed = !!data?.completed_at; }
  return (
    <>
      <Link href="/settings" className="text-xs font-semibold text-accent">‹ Settings</Link>
      <H1>Sitter sheet</H1>
      <p className="text-sm text-muted mb-3">What a babysitter needs, written once. On a sitter night you review it, change it for that visit, confirm, and it shows on the kitchen tablet while the sitter is here. <Link href="/settings/tablet" className="font-semibold text-accent">Pair the kitchen tablet</Link></p>
      <SitterNightList nights={nights} />
      <SitterSheetEditor items={items} states={states} completed={completed} />
      <Card className="mt-3 text-xs text-muted">Door codes and passwords do not belong in this saved sheet. Type them in the “Just for tonight” box on a sitter night; they are erased when the night ends. Allergies and medicine are always off until you tick them for a visit.</Card>
    </>
  );
}
