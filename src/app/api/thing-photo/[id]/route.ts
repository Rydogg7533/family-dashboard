import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Opens one catalog photo for a signed-in household member: a short-lived signed link, never a public URL. ?t=1 gives the small thumbnail.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseEnv() || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not available", { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const { data: row } = await sb.from("item_photos").select("path, thumb_path, removed_at").eq("id", id).maybeSingle();
  if (!row || row.removed_at) return new NextResponse("No photo", { status: 404 });
  const wantThumb = new URL(req.url).searchParams.get("t") === "1";
  const { data, error } = await sb.storage.from("captures").createSignedUrl(wantThumb && row.thumb_path ? row.thumb_path : row.path, 300);
  if (error || !data) return new NextResponse("Could not open the photo", { status: 500 });
  const res = NextResponse.redirect(data.signedUrl);
  res.headers.set("Cache-Control", "private, max-age=240");
  return res;
}
