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
