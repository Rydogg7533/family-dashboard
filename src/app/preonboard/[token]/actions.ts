"use server";
import { loadByToken, saveAnswerByToken, saveContactEmailByToken, markCompleteByToken, resendOnboardingEmailByToken } from "@/lib/preonboard-token";
import type { Answers } from "@/lib/preonboard-shared";

export async function loadPreonboard(token: string): Promise<{ found: boolean; revoked: boolean; answers: Answers; completed: boolean; email: string; sentAt: string | null }> {
  const r = await loadByToken(token);
  if (!r.found) return { found: false, revoked: false, answers: {}, completed: false, email: "", sentAt: null };
  if (r.revoked) return { found: true, revoked: true, answers: {}, completed: false, email: "", sentAt: null };
  return { found: true, revoked: false, answers: r.session!.answers, completed: !!r.session!.completedAt, email: r.session!.onboardingEmail ?? "", sentAt: r.session!.onboardingSentAt };
}

export async function savePreonboardAnswer(token: string, key: string, checked: boolean, value?: string): Promise<{ ok: boolean; error?: string }> {
  return saveAnswerByToken(token, key, checked, value);
}

export async function savePreonboardEmail(token: string, email: string): Promise<{ ok: boolean; error?: string }> {
  return saveContactEmailByToken(token, email);
}

export async function finishPreonboard(token: string): Promise<{ ok: boolean; error?: string; email?: string; sentAt?: string }> {
  return markCompleteByToken(token);
}

export async function resendOnboardingEmail(token: string): Promise<{ ok: boolean; error?: string; sentAt?: string }> {
  return resendOnboardingEmailByToken(token);
}
