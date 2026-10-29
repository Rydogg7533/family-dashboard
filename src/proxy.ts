import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie and sends signed-out visitors to /login.
// When Supabase is not configured (local preview), everything is open and shows sample data.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  // Slice C: device-token routes bypass the cookie session. They authenticate themselves:
  // /api/location/overland checks a per-person token in device_tokens; /api/capture/shortcut the same, kind='capture'
  // (the iPhone camera shortcut, 2026-10-29); /tv checks a "Family room TV" token (?token= or cookie) against
  // device_tokens kind='tv' (see src/app/tv/page.tsx).
  const p = request.nextUrl.pathname;
  if (p.startsWith("/api/location/") || p === "/api/capture/shortcut" || p === "/tv" || p.startsWith("/tv/")) return NextResponse.next();
  // Public legal pages (Google's OAuth consent screen links here): no login, no data, static text.
  if (p === "/privacy" || p === "/terms") return NextResponse.next();
  // The kitchen tablet proves itself with a paired device token; the review screen (/sitter/review/...) still needs a login.
  if (p === "/sitter" || p === "/sitter/pair") return NextResponse.next();
  // A child's invite link proves itself with its token; no session yet.
  if (p.startsWith("/join/")) return NextResponse.next();
  // A pre-onboarding checklist link proves itself with its token; the buyer has no account yet.
  if (p.startsWith("/preonboard/")) return NextResponse.next();
  // Placeholder landing page linked from the pre-onboarding "you're ready" email; the buyer has no account yet.
  if (p === "/onboarding-soon") return NextResponse.next();
  // First run: /setup works before anyone can sign in. The page itself refuses once a profile exists.
  if (p === "/setup" || p.startsWith("/setup/")) return NextResponse.next();
  // Password reset: the email link lands on /auth/callback signed out; /forgot-password is for signed-out people.
  if (p === "/auth/callback" || p === "/forgot-password") return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Signed-in check without a network call when the project uses asymmetric keys; also refreshes the cookie when due.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims ?? null;
  const isLogin = request.nextUrl.pathname.startsWith("/login");
  // /reset-password needs the session the callback just set; a signed-out visitor is sent to ask for a new link.
  if (!user && request.nextUrl.pathname === "/reset-password") { const to = request.nextUrl.clone(); to.pathname = "/forgot-password"; return NextResponse.redirect(to); }
  if (!user && !isLogin) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    return NextResponse.redirect(to);
  }
  if (user && isLogin) {
    const to = request.nextUrl.clone();
    to.pathname = "/";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  // preonboard-assets: public screenshots for the pre-onboarding walkthrough, fetched by <img> tags on the
  // no-login /preonboard/[token] page — must never redirect to /login or those images 404 into the placeholder.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.*|preonboard-assets/).*)"],
};
