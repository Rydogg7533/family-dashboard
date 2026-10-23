import { Card, H1 } from "@/components/ui";
import { RemoveRuleButton } from "@/components/RemoveRuleButton";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function FilingRules() {
  let rules: { id: string; vendor_label: string; folder_template: string; created_at: string }[] = [];
  if (hasSupabaseEnv()) {
    const sb = await createClient();
    const { data } = await sb.from("filing_rules").select("id,vendor_label,folder_template,created_at").order("vendor_label");
    rules = data ?? [];
  }
  return (
    <>
      <H1>Filing rules</H1>
      <p className="text-sm text-muted mb-3">Made when you correct a folder and tap &ldquo;Always file this vendor here&rdquo;. A rule only decides the folder; you still tap Yes on every receipt. Remove one and that vendor goes back to the app&rsquo;s own guess.</p>
      {rules.length === 0 ? <Card className="text-sm text-muted">No rules yet. Correct a receipt&rsquo;s folder in the Inbox and tap &ldquo;Always file this vendor here&rdquo;.</Card> : (
        <div className="flex flex-col gap-2">{rules.map((r) => (
          <Card key={r.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0"><div className="font-semibold">{r.vendor_label}</div><div className="text-xs text-muted break-words">{r.folder_template.replace("Organized/", "").replace("{year}", "<year>")}</div></div>
            <RemoveRuleButton id={r.id} />
          </Card>))}
        </div>
      )}
    </>
  );
}
