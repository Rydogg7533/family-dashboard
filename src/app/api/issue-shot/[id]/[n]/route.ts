import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Opens one screenshot attached to a problem report: a short-lived signed link for a signed-in member.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  if (!hasSupabaseEnv()) return new NextResponse("Not available in preview", { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const { data: row } = await sb.from("issues").select("screenshots").eq("id", id).maybeSingle();
  const path = (row?.screenshots as string[] | null)?.[Number(n)];
  if (!path) return new NextResponse("No screenshot", { status: 404 });
  const { data, error } = await sb.storage.from("captures").createSignedUrl(path, 300);
  if (error || !data) return new NextResponse("Could not open the screenshot", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
