import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

// Opens a file the hub delivered: a short-lived signed link into the private "deliveries" bucket.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseEnv()) return new NextResponse("Not available in preview", { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const { data: row } = await sb.from("fetch_requests").select("storage_path, delivered_at, error").eq("id", id).maybeSingle();
  if (!row) return new NextResponse("No such request", { status: 404 });
  if (row.error) return new NextResponse(`The hub could not fetch it: ${row.error}`, { status: 409 });
  if (!row.delivered_at || !row.storage_path) return new NextResponse("Not here yet. The hub fetches within about a minute.", { status: 202 });
  const { data, error } = await sb.storage.from("deliveries").createSignedUrl(row.storage_path, 300);
  if (error || !data) return new NextResponse("Could not open the file", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
