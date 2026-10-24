import { inviteInfo } from "./actions";
import { JoinFlow } from "@/components/c/JoinFlow";
import { hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// A child's own onboarding: opened from the link or QR a parent made. No login needed to open it; the token is the proof.
export default async function Join({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const wrap = (c: React.ReactNode) => <div className="pt-12 flex flex-col gap-4">{c}</div>;
  if (!hasSupabaseEnv()) return wrap(<><h1 className="text-3xl">Welcome</h1><p className="text-muted">Preview mode: invites do not work here.</p></>);
  const info = await inviteInfo(token);
  if (!info.ok) return wrap(<><h1 className="text-3xl">This link doesn’t work</h1><p className="text-muted">{info.reason}</p><a href="/login/pin" className="inline-grid min-h-12 px-6 place-items-center rounded-xl bg-accent text-white font-semibold">Sign in</a></>);
  return <JoinFlow token={token} name={info.name} />;
}
