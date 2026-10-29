import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Opens one copied Messages attachment for a signed-in household member: a short-lived signed link to the private
// message-media bucket. The path is <person uuid>/<guid>/<n>.<ext> exactly as the mirror stored it.
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = (path ?? []).join("/");
  if (!hasSupabaseEnv() || !/^[0-9a-f-]{36}\/[^/]+\/\d+\.[a-z0-9]+$/i.test(key)) return new NextResponse("Not available", { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const { data, error } = await sb.storage.from("message-media").createSignedUrl(key, 900);
  if (error || !data) return new NextResponse("No file", { status: 404 });
  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("Cache-Control", "private, max-age=840");
  return res;
}
