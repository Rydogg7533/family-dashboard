import { todayIso } from "@/lib/google-calendar";
import Link from "next/link";
import { H1 } from "@/components/ui";
import { ChangePassword } from "@/components/ChangePassword";
import { PeopleManager } from "@/components/c/PeopleManager";
import { getPeople, getViewer } from "@/lib/data-registers";
import { getChildRows, getHouseholdMinAge, getOpenInvites } from "@/lib/data-children";
import { createClient, getRequestUser, hasSupabaseEnv } from "@/lib/supabase/server";
import SignOut from "@/components/c/SignOut";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const [viewer, people, kids, householdMin, invites] = await Promise.all([getViewer(), getPeople(), getChildRows(), getHouseholdMinAge(), getOpenInvites()]);
  const { data: pr } = hasSupabaseEnv() ? await (await createClient()).from("profiles").select("id, birth_date") : { data: null };
  const bd = new Map(((pr ?? []) as { id: string; birth_date: string | null }[]).map((r) => [r.id, r.birth_date]));
  const parents = people.filter((p) => p.role === "parent" && !!p.uuid).map((p) => ({ id: p.uuid as string, name: p.name, birth_date: bd.get(p.uuid as string) ?? null }));
  let isOwner = false;
  if (hasSupabaseEnv()) { const u = await getRequestUser(); if (u) { const sb = await createClient(); const { data } = await sb.from("profiles").select("role").eq("id", u.id).maybeSingle(); isOwner = data?.role === "owner"; } }
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>People and access</H1>
      <PeopleManager parents={parents} kids={kids} householdMin={householdMin} canEdit={isOwner} today={await todayIso()} invites={invites} />
      <div className="mt-4"><ChangePassword viewer={viewer.name} /></div>
      <SignOut who={viewer.name} />
      <p className="text-xs text-muted mt-4">Two-step set-up and the who-sees-what grid will be added here. Changes to access need both parents.</p>
    </>
  );
}
