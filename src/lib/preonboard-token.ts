import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { hashToken } from "@/lib/pin";
import { ALL_KEYS, type Answers } from "@/lib/preonboard-shared";
import { sendPlainEmail } from "@/lib/gmail-send";

// The public /preonboard/[token] page has no session, so it proves itself with the raw token and these
// helpers do the lookup with the service role (same shape as the kitchen tablet and /join flows): only
// the hash is ever stored, and the only thing matched is "does this hash exist and is it not revoked."
const service = () => createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
const onboardingLink = () => `${siteUrl()}/onboarding-soon`;

function emailBody(label: string) {
  return [
    `Hi${label ? " " + label : ""},`,
    "",
    "Thanks for finishing the StewardOS pre-onboarding checklist — you're all set to start the real setup.",
    "",
    `Your onboarding link: ${onboardingLink()}`,
    "",
    "We'll be in touch to schedule a time to walk through it together on a call.",
    "",
    "— Ryan",
  ].join("\n");
}

export type PreonboardSession = { id: string; answers: Answers; completedAt: string | null; onboardingEmail: string | null; onboardingSentAt: string | null; label: string };

export async function loadByToken(token: string): Promise<{ found: boolean; revoked?: boolean; session?: PreonboardSession }> {
  if (!token || token.length > 128) return { found: false };
  const svc = service();
  const { data } = await svc.from("preonboard_links").select("id, answers, completed_at, revoked_at, onboarding_email, onboarding_sent_at, label").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data) return { found: false };
  if (data.revoked_at) return { found: true, revoked: true };
  await svc.from("preonboard_links").update({ last_opened_at: new Date().toISOString() }).eq("id", data.id);
  return { found: true, session: { id: data.id, answers: (data.answers ?? {}) as Answers, completedAt: data.completed_at, onboardingEmail: data.onboarding_email, onboardingSentAt: data.onboarding_sent_at, label: data.label || "" } };
}

export async function saveAnswerByToken(token: string, key: string, checked: boolean, value?: string): Promise<{ ok: boolean; error?: string }> {
  if (!ALL_KEYS.includes(key)) return { ok: false, error: "Unknown item." };
  const svc = service();
  const { data } = await svc.from("preonboard_links").select("id, answers, revoked_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data || data.revoked_at) return { ok: false, error: "This link isn't available." };
  const answers = { ...(data.answers ?? {}) } as Answers;
  answers[key] = { checked, value: value?.slice(0, 200), updatedAt: new Date().toISOString() };
  const { error } = await svc.from("preonboard_links").update({ answers }).eq("id", data.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saveContactEmailByToken(token: string, email: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = email.trim().slice(0, 200);
  if (trimmed && !EMAIL_RE.test(trimmed)) return { ok: false, error: "That doesn't look like an email address." };
  const svc = service();
  const { data } = await svc.from("preonboard_links").select("id, revoked_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data || data.revoked_at) return { ok: false, error: "This link isn't available." };
  const { error } = await svc.from("preonboard_links").update({ onboarding_email: trimmed || null }).eq("id", data.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markCompleteByToken(token: string): Promise<{ ok: boolean; error?: string; email?: string; sentAt?: string }> {
  const svc = service();
  const { data } = await svc.from("preonboard_links").select("id, revoked_at, label, onboarding_email").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data || data.revoked_at) return { ok: false, error: "This link isn't available." };
  const email = (data.onboarding_email || "").trim();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Add your email above before finishing — that's where we'll send the onboarding link." };

  const sent = await sendPlainEmail({ to: email, subject: "Your StewardOS onboarding link", body: emailBody(data.label || "") });
  if (!sent.ok) return { ok: false, error: sent.error || "Couldn't send the onboarding email — try again in a moment." };

  const now = new Date().toISOString();
  const { error } = await svc.from("preonboard_links").update({ completed_at: now, onboarding_sent_at: now }).eq("id", data.id);
  if (error) return { ok: false, error: error.message };

  // Best-effort nudge to both parents; a failed insert here should never block the buyer's own confirmation.
  const { data: parents } = await svc.from("profiles").select("id").eq("role", "owner");
  for (const p of parents ?? []) {
    await svc.from("notifications").insert({ person: p.id, type: "other", channel: "today", title: "Pre-onboarding ready", body: `${data.label || "A household"} finished the pre-onboarding checklist.` }).then(() => {}, () => {});
  }
  return { ok: true, email, sentAt: now };
}

export async function resendOnboardingEmailByToken(token: string): Promise<{ ok: boolean; error?: string; sentAt?: string }> {
  const svc = service();
  const { data } = await svc.from("preonboard_links").select("id, revoked_at, label, onboarding_email, onboarding_sent_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data || data.revoked_at) return { ok: false, error: "This link isn't available." };
  const email = (data.onboarding_email || "").trim();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "No email on file for this link." };
  if (data.onboarding_sent_at && Date.now() - new Date(data.onboarding_sent_at).getTime() < 30_000) return { ok: false, error: "Just sent — give it a moment before resending." };

  const sent = await sendPlainEmail({ to: email, subject: "Your StewardOS onboarding link", body: emailBody(data.label || "") });
  if (!sent.ok) return { ok: false, error: sent.error || "Couldn't send the onboarding email — try again in a moment." };

  const now = new Date().toISOString();
  const { error } = await svc.from("preonboard_links").update({ onboarding_sent_at: now }).eq("id", data.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, sentAt: now };
}
