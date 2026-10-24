import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";

// A child's 6-digit PIN is never stored. Their auth password is derived from the PIN, their login email and a server-side pepper, so the PIN
// is only usable through this app's own sign-in (rate limited here), never by sending guesses straight to the auth service. The pepper is
// PIN_PEPPER from the environment or, when unset, derived from the service key. Changing either means every child on a PIN must set it again.
const pepper = () => process.env.PIN_PEPPER || createHash("sha256").update("stewardos-pin:" + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "")).digest("hex");
export const isPin = (s: string) => /^\d{6}$/.test(s);
export const weakPin = (s: string) => /^(\d)\1{5}$/.test(s) || /^(012345|123456|234567|345678|456789|567890|987654|876543|765432|654321|543210|098765)$/.test(s);
export function pinPassword(email: string, pin: string) {
  return "pin." + createHmac("sha256", pepper()).update(email.trim().toLowerCase() + "\n" + pin).digest("base64url");
}
export const newToken = () => randomBytes(24).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

// Small in-memory limiter per server instance: 6 wrong PINs for one child in 15 minutes locks that child's PIN sign-in on this instance.
const tries = new Map<string, { n: number; until: number }>();
export function pinAttempt(key: string): { allowed: boolean; waitMin?: number } {
  const now = Date.now(); const t = tries.get(key);
  if (t && t.until > now && t.n >= 6) return { allowed: false, waitMin: Math.ceil((t.until - now) / 60000) };
  return { allowed: true };
}
export function pinFailed(key: string) { const now = Date.now(); const t = tries.get(key); if (!t || t.until <= now) tries.set(key, { n: 1, until: now + 15 * 60000 }); else t.n++; }
export function pinCleared(key: string) { tries.delete(key); }
