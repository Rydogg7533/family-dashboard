"use server";
import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/setup-state";
import { tempPassword } from "@/lib/temp-password";
import { loginAllowed, minAgeFor } from "@/lib/children";

// Children and their logins. Every change needs a parent with the owner role (checked here, server-side); writes use the service role
// because members have read-only access to `children`. Nothing is deleted. A child login is a normal sign-in that can read only the child's
// own rows (migration 0035). The temporary password is shown once and never stored or logged.
type Fail = { ok: false; error: string };
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function owner(): Promise<{ id: string; name: string; svc: NonNullable<ReturnType<typeof serviceClient>> } | Fail> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Sample mode: nothing was changed." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  const { data: me } = await sb.from("profiles").select("display_name,role").eq("id", user.id).maybeSingle();
  if (me?.role !== "owner") return { ok: false, error: "Only a parent can change this." };
  const svc = serviceClient();
  if (!svc) return { ok: false, error: "The app has no service key, so this can't run." };
  return { id: user.id, name: me.display_name ?? "A parent", svc };
}
const log = (svc: NonNullable<ReturnType<typeof serviceClient>>, actor: string, action: string, subject: string) =>
  svc.from("activity_log").insert({ actor, action, subject, undoable: false }).then(() => {}, () => {});
const done = () => { revalidatePath("/settings/people"); revalidatePath("/family"); };

export async function addChild(name: string, birthYear: number): Promise<{ ok: true } | Fail> {
  const o = await owner(); if ("ok" in o) return o;
  const n = clean(name, 40); const y = Math.trunc(Number(birthYear)); const now = new Date().getFullYear();
  if (!n) return { ok: false, error: "Give the child a name." };
  if (!(y >= now - 18 && y <= now)) return { ok: false, error: "Pick a birth year within the last 18 years." };
  const { error } = await o.svc.from("children").insert({ display_name: n, birth_year: y });
  if (error) return { ok: false, error: error.message };
  await log(o.svc, o.name, "child_added", `Added ${n} to the family`);
  done(); return { ok: true };
}

export async function setHouseholdLoginAge(age: number): Promise<{ ok: true } | Fail> {
  const o = await owner(); if ("ok" in o) return o;
  const a = Math.trunc(Number(age));
  if (!(a >= 3 && a <= 17)) return { ok: false, error: "Pick an age from 3 to 17." };
  const { error } = await o.svc.from("household").update({ child_login_min_age: a }).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  await log(o.svc, o.name, "login_age_changed", `Child login minimum age set to ${a}`);
  done(); return { ok: true };
}

// A parent lets one child have a login earlier (or later) than the household default. null = use the default.
export async function setChildLoginAge(childId: string, age: number | null): Promise<{ ok: true } | Fail> {
  const o = await owner(); if ("ok" in o) return o;
  const a = age == null ? null : Math.trunc(Number(age));
  if (a != null && !(a >= 3 && a <= 17)) return { ok: false, error: "Pick an age from 3 to 17." };
  const { data: c } = await o.svc.from("children").select("display_name").eq("id", childId).maybeSingle();
  if (!c) return { ok: false, error: "That child was not found." };
  const { error } = await o.svc.from("children").update({ login_min_age: a }).eq("id", childId);
  if (error) return { ok: false, error: error.message };
  await log(o.svc, o.name, "login_age_changed", `${c.display_name}: login age ${a == null ? "back to the household default" : `set to ${a}`}`);
  done(); return { ok: true };
}

export async function createChildLogin(childId: string, email: string): Promise<{ ok: true; name: string; email: string; password: string } | Fail> {
  const o = await owner(); if ("ok" in o) return o;
  const addr = clean(email, 120).toLowerCase();
  if (!EMAIL.test(addr)) return { ok: false, error: "That doesn't look like an email address." };
  const { data: c } = await o.svc.from("children").select("id,display_name,birth_year,login_min_age,profile_id,archived_at").eq("id", childId).maybeSingle();
  if (!c || c.archived_at) return { ok: false, error: "That child was not found." };
  if (c.profile_id) return { ok: false, error: `${c.display_name} already has a login.` };
  const { data: hh } = await o.svc.from("household").select("child_login_min_age").eq("id", 1).maybeSingle();
  const houseMin = Number(hh?.child_login_min_age ?? 10);
  if (!loginAllowed(c, houseMin)) return { ok: false, error: `${c.display_name} is under the login age (${minAgeFor(c, houseMin)}). Change the age for this child first if you want to allow it.` };
  const password = tempPassword();
  const { data, error } = await o.svc.auth.admin.createUser({ email: addr, password, email_confirm: true, user_metadata: { display_name: c.display_name } });
  if (error || !data.user) return { ok: false, error: `Could not create the login: ${error?.message ?? "unknown error"}.` };
  const { error: pe } = await o.svc.from("profiles").insert({ id: data.user.id, display_name: c.display_name, role: "child" });
  if (pe) return { ok: false, error: `The login was made but its profile failed: ${pe.message}. Ask for help before trying again.` };
  const { error: le } = await o.svc.from("children").update({ profile_id: data.user.id }).eq("id", childId);
  if (le) return { ok: false, error: `The login was made but could not be linked: ${le.message}.` };
  await log(o.svc, o.name, "child_login_created", `Created a login for ${c.display_name}`);
  done(); return { ok: true, name: c.display_name, email: addr, password };
}

// ---- per-child access (migration 0036) ----
async function featureKnown(svc: NonNullable<ReturnType<typeof serviceClient>>, key: string) {
  const { data } = await svc.from("child_features").select("key,label").eq("key", key).maybeSingle();
  return data as { key: string; label: string } | null;
}

// mode: "auto" (by age; sensitive ones wait for a parent), "on" (always), "off". Stored per child; the database enforces it for the child's login.
export async function setChildFeature(childId: string, key: string, mode: "auto" | "on" | "off"): Promise<{ ok: true } | Fail> {
  const o = await owner(); if ("ok" in o) return o;
  if (!["auto", "on", "off"].includes(mode)) return { ok: false, error: "Pick automatic, on or off." };
  const f = await featureKnown(o.svc, key); if (!f) return { ok: false, error: "That feature was not found." };
  const { data: c } = await o.svc.from("children").select("display_name,access").eq("id", childId).maybeSingle();
  if (!c) return { ok: false, error: "That child was not found." };
  const access = { ...((c.access as Record<string, string>) ?? {}) };
  if (mode === "auto") delete access[key]; else access[key] = mode;
  const { error } = await o.svc.from("children").update({ access }).eq("id", childId);
  if (error) return { ok: false, error: error.message };
  await log(o.svc, o.name, "child_access_changed", `${c.display_name}: ${f.label} set to ${mode === "auto" ? "automatic" : mode}`);
  revalidatePath("/settings/people", "layout"); revalidatePath("/kid");
  return { ok: true };
}

export async function setChildPaused(childId: string, paused: boolean): Promise<{ ok: true } | Fail> {
  const o = await owner(); if ("ok" in o) return o;
  const { data: c } = await o.svc.from("children").select("display_name").eq("id", childId).maybeSingle();
  if (!c) return { ok: false, error: "That child was not found." };
  const { error } = await o.svc.from("children").update({ paused_at: paused ? new Date().toISOString() : null }).eq("id", childId);
  if (error) return { ok: false, error: error.message };
  await log(o.svc, o.name, "child_access_changed", `${c.display_name}'s page ${paused ? "paused" : "resumed"}`);
  revalidatePath("/settings/people", "layout"); revalidatePath("/kid");
  return { ok: true };
}

// Moves a feature to a different minimum age for the whole household. age = null puts it back to the default.
export async function setHouseholdFeatureAge(key: string, age: number | null): Promise<{ ok: true } | Fail> {
  const o = await owner(); if ("ok" in o) return o;
  const f = await featureKnown(o.svc, key); if (!f) return { ok: false, error: "That feature was not found." };
  const a = age == null ? null : Math.trunc(Number(age));
  if (a != null && !(a >= 0 && a <= 18)) return { ok: false, error: "Pick an age from 0 to 18." };
  const { data: h } = await o.svc.from("household").select("child_feature_ages").eq("id", 1).maybeSingle();
  const ages = { ...((h?.child_feature_ages as Record<string, number>) ?? {}) };
  if (a == null) delete ages[key]; else ages[key] = a;
  const { error } = await o.svc.from("household").update({ child_feature_ages: ages }).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  await log(o.svc, o.name, "child_access_changed", `${f.label}: minimum age ${a == null ? "back to the default" : `set to ${a}`} for the household`);
  revalidatePath("/settings/people", "layout"); revalidatePath("/kid");
  return { ok: true };
}
