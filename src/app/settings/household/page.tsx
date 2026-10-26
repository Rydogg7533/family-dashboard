import Link from "next/link";
import { H1 } from "@/components/ui";
import { HouseholdForm } from "@/components/HouseholdForm";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { FALLBACK_TZ } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export default async function HouseholdSettings() {
  let name = "", tz = FALLBACK_TZ;
  if (hasSupabaseEnv()) {
    try {
      const sb = await createClient();
      const { data } = await sb.from("household").select("name, tz").limit(1).maybeSingle();
      if (data) { name = String(data.name ?? ""); tz = String(data.tz ?? FALLBACK_TZ); }
    } catch { /* falls back to the env default */ }
  }
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>Household</H1>
      <HouseholdForm name={name} tz={tz} />
    </>
  );
}
