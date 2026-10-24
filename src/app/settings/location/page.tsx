import Link from "next/link";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { H1 } from "@/components/ui";
import OverlandSetup from "@/components/c/OverlandSetup";
import { createClient, getRequestUser, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LocationSettings() {
  let tokens: { id: string; label: string; created_at: string; last_seen_at: string | null }[] = [], points = 0, lastPoint: string | null = null, who = "My";
  const user = await getRequestUser();
  if (user && hasSupabaseEnv() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const sb = await createClient();
    const { data: prof } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    who = prof?.display_name ?? who;
    // device_tokens is closed to browsers (credentials). Read only this person's rows, and never the token value itself.
    const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data } = await svc.from("device_tokens").select("id,label,created_at,last_seen_at").eq("kind", "overland").eq("person", user.id).is("revoked_at", null).order("created_at");
    tokens = data ?? [];
    const c = await sb.from("locations").select("id", { count: "exact", head: true });
    points = c.count ?? 0;
    const { data: last } = await sb.from("locations").select("recorded_at").order("recorded_at", { ascending: false }).limit(1);
    lastPoint = last?.[0]?.recorded_at ?? null;
  }
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>Location (Overland)</H1>
      <p className="text-xs text-muted mb-3">Your phone sends its location to your own Day page. It’s yours: only you see it, raw points are kept 30 days, and you can stop it any time.</p>
      <OverlandSetup tokens={tokens} who={who} points={points} lastPoint={lastPoint} />
      <div className="card text-xs text-muted mt-3">
        <div className="font-semibold text-fg mb-1">On your phone, once</div>
        <ol className="list-decimal pl-4 flex flex-col gap-1">
          <li>Install <b>Overland</b> (by Aaron Parecki) from the App Store. Allow location <b>Always</b> and <b>Precise</b>.</li>
          <li>Here, tap <b>Make a token for this phone</b> and copy the endpoint and token.</li>
          <li>In Overland › Settings, paste them into <b>Receiver Endpoint</b> and <b>Access Token</b>. Set Device ID to your first name.</li>
          <li>Turn on Tracking, Stationary sleeping and Visit tracking. Send interval 5 minutes. Then tap <b>Send Now</b>.</li>
        </ol>
      </div>
    </>
  );
}
