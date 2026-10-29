import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Opens one contact photo for a signed-in household member: a short-lived signed link to the private avatars bucket.
// The path is <person uuid>/<uid>.jpg as the contacts sync stored it; nothing else is reachable.
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = (path ?? []).join("/");
  if (!hasSupabaseEnv() || !/^[0-9a-f-]{36}\/[^/]+\.jpg$/i.test(key)) return new NextResponse("Not available", { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const { data, error } = await sb.storage.from("avatars").createSignedUrl(key, 600);
  if (error || !data) return new NextResponse("No photo", { status: 404 });
  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("Cache-Control", "private, max-age=540");
  return res;
}
