import Link from "next/link";
import { notFound } from "next/navigation";
import { H1 } from "@/components/ui";
import { SitterPersonPage } from "@/components/c/SitterPersonPage";
import { getSitter } from "@/lib/data-sitter";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SitterPerson({ params }: PageProps<"/settings/sitter/people/[id]">) {
  const { id } = await params;
  const s = await getSitter(id); if (!s) notFound();
  let owner = false, archived = false, kids: { id: string; name: string }[] = [], visits: { id: string; title: string; startsAt: string; payNote: string | null }[] = [];
  if (hasSupabaseEnv()) {
    const sb = await createClient();
    const [{ data: { user } }, { data: k }, { data: row }, { data: v }] = await Promise.all([
      sb.auth.getUser(), sb.from("children").select("id, display_name").is("archived_at", null).order("birth_date"),
      sb.from("sitter_people").select("archived_at").eq("id", id).maybeSingle(),
      sb.from("sitter_nights").select("id, title, starts_at, pay_note").eq("sitter_person_id", id).eq("status", "ended").order("starts_at", { ascending: false }).limit(10),
    ]);
    kids = (k ?? []).map((c) => ({ id: c.id, name: c.display_name })); archived = !!row?.archived_at;
    visits = (v ?? []).map((n) => ({ id: n.id, title: n.title, startsAt: n.starts_at, payNote: n.pay_note }));
    if (user) { const { data: p } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle(); owner = p?.role === "owner"; }
  }
  return (
    <>
      <Link href="/settings/sitter?tab=sitters" className="text-xs font-semibold text-accent">‹ Sitters</Link>
      <H1>{s.name}</H1>
      <SitterPersonPage s={s} owner={owner} kids={kids} archived={archived} visits={visits} />
    </>
  );
}
