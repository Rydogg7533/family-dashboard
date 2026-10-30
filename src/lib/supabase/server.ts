import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

export function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component: the proxy refreshes sessions instead.
          }
        },
      },
    },
  );
}

// The signed-in person for READ paths, once per request. getClaims() checks the signed token locally when the project
// uses asymmetric keys (no network round trip); otherwise it falls back to asking the Auth server, as before.
// Writes (server actions) keep calling getUser() so they always verify with the Auth server.
export const getRequestUser = cache(async (): Promise<{ id: string; email: string | null } | null> => {
  if (!hasSupabaseEnv()) return null;   // sample mode (no env): nobody is signed in, pages show samples
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const c = data?.claims;
  return c?.sub ? { id: String(c.sub), email: typeof c.email === "string" ? c.email : null } : null;
});

// The signed-in person's own profile row, once per request. Today, the layout and the badge route each used to read
// profiles separately (display_name, tab_bar, role, today_seen_at: four round trips, two of them serial) before the
// page could paint. One read, shared by everyone in the request through React's cache (2026-10-30, Today slow).
export type MyProfile = { id: string; display_name: string | null; role: string | null; tab_bar: string[] | null; today_seen_at: string | null };
export const getMyProfile = cache(async (): Promise<MyProfile | null> => {
  const user = await getRequestUser();
  if (!user) return null;
  const sb = await createClient();
  const { data } = await sb.from("profiles").select("id, display_name, role, tab_bar, today_seen_at").eq("id", user.id).maybeSingle();
  return (data as MyProfile | null) ?? null;
});
