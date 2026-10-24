import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/server";
import type { ConnectionStatus, ContactsProvider } from "@/lib/contacts-providers";

export type ContactsConnection = { provider: ContactsProvider; chosen: boolean; account: string; status: ConnectionStatus | null; note: string | null; lastSyncedAt: string | null };

// The signed-in person's contacts source. No row yet means iCloud, which is how contacts worked before the choice existed.
export async function getMyContactsConnection(): Promise<ContactsConnection> {
  const fallback: ContactsConnection = { provider: "icloud", chosen: false, account: "", status: null, note: null, lastSyncedAt: null };
  if (!hasSupabaseEnv()) return fallback;
  try {
    const sb = await createClient();
    const user = await getRequestUser();
    if (!user) return fallback;
    const { data } = await sb.from("person_connections").select("provider,account,status,status_note,last_synced_at").eq("person", user.id).eq("kind", "contacts").maybeSingle();
    if (!data) return fallback;
    return { provider: data.provider, chosen: true, account: data.account ?? "", status: data.status, note: data.status_note, lastSyncedAt: data.last_synced_at };
  } catch { return fallback; }
}
