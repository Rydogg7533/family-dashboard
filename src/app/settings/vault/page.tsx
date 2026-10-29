import Link from "next/link";
import { H1 } from "@/components/ui";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { VAULT_GROUPS, type VaultPointer, type VaultOwner } from "@/lib/vault";
import { VaultList } from "@/components/VaultList";

export const dynamic = "force-dynamic";

// Settings › 1Password. One list of pointers into 1Password: the name of each sensitive item and its
// private link. Nothing sensitive is here; the number, the scan, the code live in 1Password and open only
// behind that person's own unlock. Ask reads this list to answer "where is my passport".
export default async function VaultSettings() {
  let rows: VaultPointer[] = [];
  let removed: VaultPointer[] = [];
  let me = "";
  let adults: VaultOwner[] = [];
  let kids: VaultOwner[] = [];
  let retired: string[] = [];
  let isOwner = false;
  let vehicles: VaultOwner[] = [];
  let devices: VaultOwner[] = [];
  let accounts: VaultOwner[] = [];
  if (hasSupabaseEnv()) {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    me = user?.id ?? "";
    const [{ data }, { data: a }, { data: k }, { data: ret }, { data: prof }, { data: v }, { data: d }, { data: ac }, { data: gone }] = await Promise.all([
      sb.from("vault_pointers").select("id, person, \"group\", label, item_type, link, expires_on, attached_kind, attached_id, note, updated_at, template_key").is("deleted_at", null).order("group").order("label"),
      sb.from("profiles").select("id, display_name").neq("role", "child").order("created_at"),
      sb.from("children").select("id, display_name, archived_at").order("birth_year"),
      sb.from("vault_retired_owners").select("owner_key").not("retired_at", "is", null),
      sb.from("profiles").select("role").eq("id", user?.id ?? "").maybeSingle(),
      sb.from("vehicles").select("id, short").neq("status", "sold").order("short"),
      sb.from("devices").select("id, name").in("status", ["in use", "spare", "loaned"]).order("name"),
      sb.from("accounts").select("id, institution, kind, last4").is("retired_at", null).order("institution"),
      sb.from("vault_pointers").select("id, person, \"group\", label, item_type, link, expires_on, attached_kind, attached_id, note, updated_at").not("deleted_at", "is", null).order("updated_at", { ascending: false }).limit(200),
    ]);
    removed = (gone ?? []) as VaultPointer[];
    vehicles = (v ?? []).map((x) => ({ id: String(x.id), name: String(x.short) }));
    devices = (d ?? []).map((x) => ({ id: String(x.id), name: String(x.name) }));
    accounts = (ac ?? []).map((x) => ({ id: String(x.id), name: `${x.institution} ${x.kind}${x.last4 ? ` ending ${x.last4}` : ""}` }));
    isOwner = prof?.role === "owner";
    rows = (data ?? []) as VaultPointer[];
    adults = (a ?? []).map((p) => ({ id: String(p.id), name: String(p.display_name ?? "Member") }));
    kids = (k ?? []).map((c) => ({ id: String(c.id), name: String(c.display_name ?? "Child") }));
    // Retired by hand here, or an archived child elsewhere in the app: either way the section is retired.
    retired = [...(ret ?? []).map((r) => String(r.owner_key)), ...(k ?? []).filter((c) => c.archived_at).map((c) => `k:${c.id}`)];
  }
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>1Password</H1>
      <p className="text-xs text-muted mb-3">The sensitive things live in 1Password. This page holds only each item&rsquo;s name and its private link, so Ask can say &ldquo;it&rsquo;s in 1Password&rdquo; and open it behind your own unlock. Three levels: Just me, Parents (the two of you), Everyone (the whole family). Never a number, never a scan. Items are grouped by person, the same way your 1Password vaults are: each adult&rsquo;s own items are theirs alone, each child&rsquo;s items sit under that child, and <span className="text-fg">Shared</span> is the vault both parents hold.</p>
      <p className="text-xs text-muted mb-3">To get a link: in 1Password, open the item &rsaquo; the &ldquo;&hellip;&rdquo; menu &rsaquo; <span className="text-fg">Copy Private Link</span>. It opens only for someone signed in to your 1Password.</p>
      <Link href="/settings/vault/import" className="block mb-3">
        <div className="card border-accent flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm">Map your documents</div>
            <div className="text-xs text-muted">Point at a folder of scans on your Mac. It reads each one, works out what it is, and fills these rows for you.</div>
          </div>
          <span aria-hidden className="text-accent shrink-0">&rsaquo;</span>
        </div>
      </Link>
      <VaultList rows={rows} removed={removed} me={me} adults={adults} kids={kids} vehicles={vehicles} devices={devices} accounts={accounts} retired={retired} isOwner={isOwner} groups={VAULT_GROUPS.map((g) => ({ id: g.id, label: g.label, blurb: g.blurb }))} />
    </>
  );
}
