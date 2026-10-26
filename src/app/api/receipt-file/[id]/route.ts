import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Opens a receipt's stored file for a signed-in member: a short-lived signed link, never a public URL.
// receipts.file_path is a path in the private "captures" bucket (the Inbox puts it there); home_path is
// where the hub filed the copy, which this route does not serve.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseEnv()) return new NextResponse("Not available in preview", { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const { data: row } = await sb.from("receipts").select("file_path").eq("id", id).maybeSingle();
  if (!row?.file_path) return new NextResponse("No file", { status: 404 });
  const { data, error } = await sb.storage.from("captures").createSignedUrl(row.file_path, 300);
  if (error || !data) return new NextResponse("Could not open the file", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
