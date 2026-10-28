import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { SitterSheetEditor } from "@/components/c/SitterSheetEditor";
import { SitterNightList } from "@/components/c/SitterNightList";
import { SitterPeople } from "@/components/c/SitterPeople";
import { SitterTemplates } from "@/components/c/SitterTemplates";
import { getTemplate, getSections, getNights, getSitterTemplates, getSitters } from "@/lib/data-sitter";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const TABS = [["sitters", "Sitters"], ["house", "Emergency and house"], ["general", "General"], ["kids", "Kids"]] as const;
type Tab = (typeof TABS)[number][0];

export default async function SitterSettings({ searchParams }: PageProps<"/settings/sitter">) {
  const sp = await searchParams; const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const addName = (Array.isArray(sp.add) ? sp.add[0] : sp.add)?.toString().slice(0, 80) ?? null;
  const tab: Tab = (TABS.find(([t]) => t === raw)?.[0] ?? "sitters");
  let owner = false, completed = false, kids: { id: string; name: string }[] = [];
  if (hasSupabaseEnv()) {
    const sb = await createClient();
    const [{ data: { user } }, { data: g }, { data: k }] = await Promise.all([sb.auth.getUser(), sb.from("guided_tasks").select("completed_at").eq("key", "sitter_sheet").maybeSingle(), sb.from("children").select("id, display_name").is("archived_at", null).order("birth_date")]);
    completed = !!g?.completed_at; kids = (k ?? []).map((c) => ({ id: c.id, name: c.display_name }));
    if (user) { const { data: p } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle(); owner = p?.role === "owner"; }
  }
  return (
    <>
      <Link href="/settings" className="text-xs font-semibold text-accent">‹ Settings</Link>
      <H1>Sitter</H1>
      <p className="text-sm text-muted mb-3">Who may sit, what every sitter sees, and the instruction sets you reuse. Each visit starts from these and you change it for that night. <Link href="/settings/tablet" className="font-semibold text-accent">Pair the kitchen tablet</Link></p>
      <div className="flex gap-1 mb-3 overflow-x-auto">{TABS.map(([t, label]) => <Link key={t} href={`/settings/sitter?tab=${t}`} className={`shrink-0 rounded-full px-3 min-h-9 flex items-center text-xs font-bold no-underline ${tab === t ? "bg-accent text-white" : "bg-soft"}`}>{label}</Link>)}</div>
      {tab === "sitters" && <SitterPeople sitters={await getSitters()} owner={owner} kids={kids} addName={addName} />}
      {tab === "house" && (<>
        <SitterNightList nights={await getNights(["needed", "proposed", "scheduled", "awaiting_review", "confirmed"], 20)} />
        <SitterSheetEditor items={await getTemplate()} states={await getSections()} completed={completed} />
        <Card className="mt-3 text-xs text-muted">This card is on every sheet. Door codes and passwords never go here; type them in “Just for tonight” on a visit and they are erased when it ends. The kids’ own routines live under Per child.</Card>
      </>)}
      {tab === "general" && (<>
        <p className="text-xs text-muted mb-2">House instructions for a kind of visit. The default is picked for you on each visit; one tap swaps it.</p>
        <SitterTemplates kind="general" templates={await getSitterTemplates()} kids={kids} />
      </>)}
      {tab === "kids" && (<>
        <p className="text-xs text-muted mb-2">One or more sets per child, named for the situation. Allergies and medicine are stored here and stay off until you tick them for a visit.</p>
        <SitterTemplates kind="child" templates={await getSitterTemplates()} kids={kids} />
      </>)}
    </>
  );
}
