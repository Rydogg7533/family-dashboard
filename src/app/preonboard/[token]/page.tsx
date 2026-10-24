import { loadPreonboard } from "./actions";
import { PreonboardApp } from "@/components/c/PreonboardApp";
import { hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// A prospective household's pre-onboarding checklist. No login — the link itself is the proof, and it
// saves answers as they go so they can leave and come back on any device.
export default async function Preonboard({ params }: PageProps<"/preonboard/[token]">) {
  const { token } = await params;
  const wrap = (c: React.ReactNode) => <div className="min-h-screen flex items-center justify-center px-6"><div className="max-w-md text-center flex flex-col gap-3">{c}</div></div>;
  if (!hasSupabaseEnv()) return wrap(<><h1 className="text-2xl font-semibold">Preview mode</h1><p className="text-muted">Pre-onboarding links don&apos;t work here.</p></>);
  const r = await loadPreonboard(token);
  if (!r.found) return wrap(<><h1 className="text-2xl font-semibold">This link doesn&apos;t work</h1><p className="text-muted">Ask whoever sent it to send a new one.</p></>);
  if (r.revoked) return wrap(<><h1 className="text-2xl font-semibold">This link has been turned off</h1><p className="text-muted">Ask whoever sent it to send a new one.</p></>);
  return <PreonboardApp token={token} initialAnswers={r.answers} initialCompleted={r.completed} initialEmail={r.email} initialSentAt={r.sentAt} />;
}
