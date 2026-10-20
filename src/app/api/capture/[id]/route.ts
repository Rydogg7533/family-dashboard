import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Opens a stored capture for a signed-in household member: a short-lived signed link, never a public URL.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseEnv()) return new NextResponse("Not available in preview", { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const { data: row } = await sb.from("inbox_items").select("file_path").eq("id", id).maybeSingle();
  if (!row?.file_path) return new NextResponse("No file", { status: 404 });
  const { data, error } = await sb.storage.from("captures").createSignedUrl(row.file_path, 300);
  if (error || !data) return new NextResponse("Could not open the file", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
