"use server";
import { loadByToken, saveAnswerByToken, markCompleteByToken } from "@/lib/preonboard-token";
import type { Answers } from "@/lib/preonboard-shared";

export async function loadPreonboard(token: string): Promise<{ found: boolean; revoked: boolean; answers: Answers; completed: boolean }> {
  const r = await loadByToken(token);
  if (!r.found) return { found: false, revoked: false, answers: {}, completed: false };
  if (r.revoked) return { found: true, revoked: true, answers: {}, completed: false };
  return { found: true, revoked: false, answers: r.session!.answers, completed: !!r.session!.completedAt };
}

export async function savePreonboardAnswer(token: string, key: string, checked: boolean, value?: string): Promise<{ ok: boolean; error?: string }> {
  return saveAnswerByToken(token, key, checked, value);
}

export async function finishPreonboard(token: string): Promise<{ ok: boolean; error?: string }> {
  return markCompleteByToken(token);
}
