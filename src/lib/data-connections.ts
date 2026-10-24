import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/server";
import type { ConnectionStatus, ContactsProvider } from "@/lib/contacts-providers";
import { providerLabel } from "@/lib/contacts-providers";
import { hasGoogleCal, googleCalAccount } from "@/lib/google-calendar";
import { STEPS, STEP_LABEL, STEP_HREF, STEP_PITCH, type Conn, type StepKey } from "@/lib/connections-steps";

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

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 2 ? "just now" : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

// One status per connection for the signed-in person, read under their own row-level security (nothing here can see anyone else's).
// Used by Settings › Connections and the Today set-up card. Empty in sample mode (nothing to set up).
export async function getMyConnections(): Promise<{ conns: Conn[]; dismissed: Set<StepKey> }> {
  const none = { conns: [] as Conn[], dismissed: new Set<StepKey>() };
  if (!hasSupabaseEnv()) return none;
  try {
    const user = await getRequestUser(); if (!user) return none;
    const sb = await createClient();
    const [push, mail, cards, lastPt, contacts, dis] = await Promise.all([
      sb.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("person", user.id),
      sb.from("mail_accounts").select("address,last_sync_at,last_error").eq("person", user.id),
      sb.from("contact_cards").select("id", { count: "exact", head: true }).eq("person", user.id).is("deleted_at", null),
      sb.from("locations").select("recorded_at").eq("person", user.id).order("recorded_at", { ascending: false }).limit(1),
      getMyContactsConnection(),
      sb.from("setup_dismissals").select("step,until").eq("person", user.id).gt("until", new Date().toISOString()),
    ]);
    const conns: Conn[] = [];
    const add = (step: StepKey, state: Conn["state"], detail: string, help?: string) => conns.push({ step, label: STEP_LABEL[step], state, detail, href: STEP_HREF[step], help });

    const n = push.count ?? 0;
    n > 0 ? add("push", "connected", `${n} device${n === 1 ? "" : "s"} allowed`) : add("push", "todo", STEP_PITCH.push);

    const accts = (mail.data ?? []).filter((a) => !/\.(contacts|calendar|sheets)$/.test(a.address));
    // A sync error is "needs attention" only once it is old enough to matter: a single failed 5-minute run (rate limits, a dropped
    // connection) clears itself. Errors are shown in plain words, not API paths.
    const stale = (a: { last_sync_at: string | null }) => !a.last_sync_at || Date.now() - Date.parse(a.last_sync_at) > 60 * 60000;
    const plain = (e: string) => /retries|rate|429|timeout|ECONN|fetch failed/i.test(e) ? "the mail service is not answering right now" : /invalid_grant|revoked|expired|401|403|insufficient/i.test(e) ? "the sign-in has expired; sign in again on the Mac mini" : e.slice(0, 120);
    const bad = accts.find((a) => a.last_error && stale(a)), okAcct = accts.find((a) => a.last_sync_at && !a.last_error);
    if (bad) add("mail", "needs", `${bad.address}: ${plain(String(bad.last_error))} (no sync for ${bad.last_sync_at ? ago(bad.last_sync_at) : "ever"})`);
    else if (okAcct) add("mail", "connected", `${accts.map((a) => a.address).join(", ")} · synced ${ago(okAcct.last_sync_at)}`);
    else add("mail", "todo", accts.length ? "Signed in, waiting for the first sync." : STEP_PITCH.mail, accts.length ? undefined : "On the Mac mini, once: node scripts/mail-connect.mjs --provider gmail --account <your address> --person <your name>  (icloud or other instead of gmail). It asks for an app password.");

    hasGoogleCal() ? add("calendar", "connected", `Household calendar · ${googleCalAccount()}`) : add("calendar", "todo", STEP_PITCH.calendar);

    const latest = lastPt.data?.[0]?.recorded_at ?? null;
    if (!latest) add("location", "todo", STEP_PITCH.location);
    else if (Date.now() - Date.parse(latest) > 7 * 864e5) add("location", "needs", `No location for ${Math.round((Date.now() - Date.parse(latest)) / 864e5)} days. Open Overland on your phone.`);
    else add("location", "connected", `Latest point ${ago(latest)}`);

    const c = contacts;
    if (c.provider === "none" && c.chosen) add("contacts", "off", "Not connected (your choice).");
    else if (c.chosen && c.status === "error") add("contacts", "needs", `${providerLabel(c.provider)}: ${c.note ?? "sync error"}`);
    else if (c.chosen && c.status === "waiting") add("contacts", "todo", `${providerLabel(c.provider)} chosen, waiting for the first sync.`);
    else if ((cards.count ?? 0) > 0) add("contacts", "connected", `${providerLabel(c.provider)}${c.account ? ` · ${c.account}` : ""} · ${(cards.count ?? 0).toLocaleString("en-US")} contacts`);
    else add("contacts", "todo", STEP_PITCH.contacts);

    conns.sort((a, b) => STEPS.indexOf(a.step) - STEPS.indexOf(b.step));
    return { conns, dismissed: new Set((dis.data ?? []).map((d) => d.step as StepKey)) };
  } catch { return none; }
}
