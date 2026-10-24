import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

// Where Supabase sends the person after they tap the link in a password-reset email (type=recovery). The one-time code in the
// URL is exchanged for a session here, on the server, and the person lands on /reset-password already signed in to set a new one.
// Only same-origin paths are allowed as the next step, so the link can never bounce someone to another site.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next") || "/reset-password";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/reset-password";
  const to = url.origin + next;
  if (!code) return NextResponse.redirect(`${url.origin}/login?reset=invalid`);
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !key) return NextResponse.redirect(to);
  let response = NextResponse.redirect(to);
  const sb = createServerClient(supaUrl, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); },
    },
  });
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) { response = NextResponse.redirect(`${url.origin}/login?reset=expired`); }
  return response;
}
