import { createClient as createServiceClient } from "@supabase/supabase-js";

// First-run state, read with the service role (the only key that can see an empty database). Three answers:
//   "no-service"  the app has no service key, so /setup cannot run
//   "no-schema"   the database has no tables yet: the person pastes schema.sql into the Supabase SQL editor
//   "empty"       tables exist and nobody has a profile: the form may run
//   "done"        at least one profile exists: /setup is closed for good
export type SetupState = "no-service" | "no-schema" | "empty" | "done";

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

export async function getSetupState(): Promise<SetupState> {
  const svc = serviceClient(); if (!svc) return "no-service";
  const { count, error } = await svc.from("profiles").select("id", { count: "exact", head: true });
  if (error) { if (/relation|schema cache|does not exist|PGRST205|42P01/i.test(`${error.code} ${error.message}`)) return "no-schema"; throw new Error(error.message); }
  return (count ?? 0) > 0 ? "done" : "empty";
}
