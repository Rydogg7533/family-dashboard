"use server";
import { serviceClient } from "@/lib/setup-state";
import { seedDemoHousehold } from "@/lib/demo-seed";

// Demo-only: a prospect signs up for their own isolated, fictional household (see
// claude/stewardos-decisions-log-2026-10-24.md, "Demo for prospects: option B"). This file only makes
// sense on the demo deployment, which is the only place `household` is multi-row and household_id
// exists; it has no effect and should never run against a single-household kit.

type Input = { name: string; email: string; password: string };
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRIAL_DAYS = 14;

export async function startDemo(input: Input) {
  const name = clean(input.name, 40);
  const email = clean(input.email, 120).toLowerCase();
  const password = String(input.password ?? "");
  if (!name) return { ok: false as const, error: "Tell us your name." };
  if (!EMAIL.test(email)) return { ok: false as const, error: `"${email}" doesn't look like an email address.` };
  if (password.length < 8) return { ok: false as const, error: "Password needs to be at least 8 characters." };

  const svc = serviceClient();
  if (!svc) return { ok: false as const, error: "Demo isn't configured yet." };

  const trialExpiresAt = new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString();
  const { data: hh, error: he } = await svc.from("household").insert({ name: `${name}'s demo`, is_demo: true, trial_expires_at: trialExpiresAt }).select("id").single();
  if (he || !hh) { console.error("startDemo household:", he?.code, he?.message); return { ok: false as const, error: "Could not start your demo household. Try again in a moment." }; }

  const { data: u, error: ue } = await svc.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name, is_demo: true } });
  if (ue || !u.user) {
    console.error("startDemo createUser:", ue?.message);
    await svc.from("household").delete().eq("id", hh.id);
    return { ok: false as const, error: ue?.code === "email_exists" ? "That email already has a demo running -- sign in instead." : "Could not create your login. Try again." };
  }

  const { error: pe } = await svc.from("profiles").insert({ id: u.user.id, display_name: name, role: "owner", household_id: hh.id });
  if (pe) { console.error("startDemo profile:", pe.code, pe.message); return { ok: false as const, error: "Login created but the profile failed. Try again." }; }

  await seedDemoHousehold(hh.id, u.user.id, name).catch((e: Error) => console.error("startDemo seed:", e.message));

  return { ok: true as const, email, password };
}
