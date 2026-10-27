import Link from "next/link";
import { H1 } from "@/components/ui";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { VAULT_GROUPS, type VaultPointer } from "@/lib/vault";
import { VaultList } from "@/components/VaultList";

export const dynamic = "force-dynamic";

// Settings › 1Password. One list of pointers into 1Password: the name of each sensitive item and its
// private link. Nothing sensitive is here; the number, the scan, the code live in 1Password and open only
// behind that person's own unlock. Ask reads this list to answer "where is my passport".
export default async function VaultSettings() {
  let rows: VaultPointer[] = [];
  let me = "";
  if (hasSupabaseEnv()) {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    me = user?.id ?? "";
    const { data } = await sb.from("vault_pointers").select("id, person, \"group\", label, item_type, link, expires_on, attached_kind, attached_id, note, updated_at").is("deleted_at", null).order("group").order("label");
    rows = (data ?? []) as VaultPointer[];
  }
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>1Password</H1>
      <p className="text-xs text-muted mb-3">The sensitive things live in 1Password. This page holds only each item&rsquo;s name and its private link, so Ask can say &ldquo;it&rsquo;s in 1Password&rdquo; and open it behind your own unlock. Never a number, never a scan. <span className="text-fg">Your items</span> are yours alone; <span className="text-fg">household items</span> are the Shared vault and show for both parents.</p>
      <p className="text-xs text-muted mb-3">To get a link: in 1Password, open the item &rsaquo; the &ldquo;&hellip;&rdquo; menu &rsaquo; <span className="text-fg">Copy Private Link</span>. It opens only for someone signed in to your 1Password.</p>
      <VaultList rows={rows} me={me} groups={VAULT_GROUPS.map((g) => ({ id: g.id, label: g.label, blurb: g.blurb }))} />
    </>
  );
}
