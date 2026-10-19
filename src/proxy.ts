import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie and sends signed-out visitors to /login.
// When Supabase is not configured (local preview), everything is open and shows sample data.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  // Slice C: device-token routes bypass the cookie session. They authenticate themselves:
  // /api/location/overland checks a per-person token in device_tokens; /tv checks a "Family room TV" token
  // (?token= or cookie) against device_tokens kind='tv' (see src/app/tv/page.tsx).
  const p = request.nextUrl.pathname;
  if (p.startsWith("/api/location/") || p === "/tv" || p.startsWith("/tv/")) return NextResponse.next();

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

  const { data: { user } } = await supabase.auth.getUser();
  const isLogin = request.nextUrl.pathname.startsWith("/login");
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.*).*)"],
};
