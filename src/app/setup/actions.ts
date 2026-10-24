"use server";
import { randomInt } from "node:crypto";
import { getSetupState, serviceClient } from "@/lib/setup-state";

// First run: makes the household and its two parents. Runs only while the database has no profile at all (checked again here, server-side),
// so it can never add people to a household that already exists. Parents are created through the auth API, never SQL. Each gets a
// temporary password that is shown ONCE on the page and nowhere else (not logged, not stored by the app); they change it after signing in.
type Parent = { name: string; email: string };
export type SetupInput = { household: string; tz: string; parents: Parent[] };

const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 14 characters from an alphabet without look-alikes (no 0/O, 1/l/I). About 70 bits.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const tempPassword = () => Array.from({ length: 14 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export async function runSetup(input: SetupInput) {
  const household = clean(input.household, 60);
  const tz = clean(input.tz, 60) || "America/Denver";
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { return { ok: false as const, error: "That time zone is not recognized." }; }
  const parents = (Array.isArray(input.parents) ? input.parents : []).slice(0, 2).map((p) => ({ name: clean(p?.name, 40), email: clean(p?.email, 120).toLowerCase() })).filter((p) => p.name || p.email);
  if (!household) return { ok: false as const, error: "Give the household a name." };
  if (!parents.length) return { ok: false as const, error: "Add at least one parent." };
  for (const p of parents) { if (!p.name) return { ok: false as const, error: "Every parent needs a name." }; if (!EMAIL.test(p.email)) return { ok: false as const, error: `“${p.email}” doesn’t look like an email address.` }; }
  if (parents.length === 2 && parents[0].email === parents[1].email) return { ok: false as const, error: "The two parents need different email addresses." };

  const state = await getSetupState().catch((e: Error) => e);
  if (state instanceof Error) return { ok: false as const, error: `Could not reach the database: ${state.message}` };
  if (state !== "empty") return { ok: false as const, error: state === "done" ? "This household is already set up." : state === "no-schema" ? "The database has no tables yet. Do the schema step first." : "The app has no service key." };
  const svc = serviceClient()!;

  const made: { name: string; email: string; password: string }[] = [];
  for (const p of parents) {
    const password = tempPassword();
    const { data, error } = await svc.auth.admin.createUser({ email: p.email, password, email_confirm: true, user_metadata: { display_name: p.name } });
    if (error || !data.user) { console.error("runSetup createUser:", error?.message); return { ok: false as const, error: `Could not create ${p.name}'s login: ${error?.message ?? "unknown error"}.${made.length ? " The first parent was created; sign in as them and add the second under Settings." : ""}` }; }
    const { error: pe } = await svc.from("profiles").insert({ id: data.user.id, display_name: p.name, role: "owner" });
    if (pe) { console.error("runSetup profile:", pe.code, pe.message); return { ok: false as const, error: `Login made for ${p.name} but the profile failed: ${pe.message}` }; }
    made.push({ name: p.name, email: p.email, password });
  }
  const { error: he } = await svc.from("household").upsert({ id: 1, name: household, tz, setup_done_at: new Date().toISOString() }, { onConflict: "id" });
  if (he) console.error("runSetup household:", he.code, he.message);
  await svc.from("activity_log").insert({ actor: "Setup", action: "household_created", subject: `Household "${household}" set up with ${made.map((m) => m.name).join(" and ")}`, undoable: false }).then(() => {}, () => {});
  return { ok: true as const, household, parents: made };
}
