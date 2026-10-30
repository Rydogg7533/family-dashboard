import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Opens an uploaded statement for a signed-in OWNER: a 5-minute signed link, never a public URL. Row-level security on statement_uploads and
// on the "statements" bucket lets only owners through; this route fails closed for everyone else. No model is involved.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseEnv()) return new NextResponse("Not available in preview", { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const { data: row } = await sb.from("statement_uploads").select("file_path").eq("id", id).maybeSingle();
  if (!row?.file_path) return new NextResponse("No file", { status: 404 });
  const { data, error } = await sb.storage.from("statements").createSignedUrl(row.file_path, 300);
  if (error || !data) return new NextResponse("Could not open the file", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
