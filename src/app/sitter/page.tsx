import { cookies } from "next/headers";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import { verifyTablet, getTabletState, TABLET_COOKIE } from "@/lib/sitter-tablet";
import { TabletView } from "@/components/c/TabletView";

export const dynamic = "force-dynamic";

// The kitchen tablet. Needs a paired device token (cookie). Shows the confirmed sitter sheet only while a confirmed night is happening; otherwise a quiet clock.
export default async function Sitter({ searchParams }: PageProps<"/sitter">) {
  const sp = await searchParams;
  const shell = (msg: string) => <div className="fixed inset-0 bg-[#16181D] text-white flex items-center justify-center text-3xl p-16 text-center">{msg}</div>;
  if (!hasSupabaseEnv()) return <TabletView state={{ kind: "idle" }} sample />;
  const token = (await cookies()).get(TABLET_COOKIE)?.value;
  if (!(await verifyTablet(token))) return shell(sp.e ? "That pairing link did not work. Make a new one in Settings › Kitchen tablet." : "This tablet is not paired. Open the pairing link from Settings › Kitchen tablet.");
  return <TabletView state={await getTabletState()} />;
}
