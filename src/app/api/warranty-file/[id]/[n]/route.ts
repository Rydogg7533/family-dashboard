import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Opens one file attached to a warranty: a short-lived signed link for a signed-in member.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  if (!hasSupabaseEnv()) return new NextResponse("Not available in preview", { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const { data: row } = await sb.from("warranties").select("attachments").eq("id", id).maybeSingle();
  const f = (row?.attachments as { path: string }[] | null)?.[Number(n)];
  if (!f?.path) return new NextResponse("No file", { status: 404 });
  const { data, error } = await sb.storage.from("captures").createSignedUrl(f.path, 300);
  if (error || !data) return new NextResponse("Could not open the file", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
