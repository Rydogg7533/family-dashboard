import "server-only";
// Sends one plain-text email through the Gmail API as a real person's own Gmail account (GOOGLE_MAIL_* in
// the Vercel settings — same refresh-token pattern as src/lib/google-calendar.ts, but its own OAuth consent
// with the gmail.send scope, made by `node scripts/google-auth.mjs --purpose mail`). Used today only for the
// pre-onboarding "here's your onboarding link" email, sent to people Ryan knows personally.
//
// RETAIL NOTE: before this goes out to strangers who buy the kit, replace this with a real transactional
// sender (e.g. Resend) on a verified stewardos.co domain, so mail comes from StewardOS, not Ryan's personal
// Gmail. See claude/dashboard-golive-checklist.md.

export function hasGmailSend() { return !!(process.env.GOOGLE_MAIL_CLIENT_ID && process.env.GOOGLE_MAIL_CLIENT_SECRET && process.env.GOOGLE_MAIL_REFRESH_TOKEN); }
const fromAccount = () => process.env.GOOGLE_MAIL_ACCOUNT || "me";

let cached: { token: string; until: number } | null = null;
async function accessToken() {
  if (cached && cached.until > Date.now() + 30_000) return cached.token;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_MAIL_CLIENT_ID!, client_secret: process.env.GOOGLE_MAIL_CLIENT_SECRET!, refresh_token: process.env.GOOGLE_MAIL_REFRESH_TOKEN!, grant_type: "refresh_token" }), cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gmail sign-in failed (${j.error || r.status}): ${j.error_description || "the mail token may have been revoked"}`);
  cached = { token: j.access_token, until: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

function toBase64Url(s: string) {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendPlainEmail({ to, subject, body }: { to: string; subject: string; body: string }): Promise<{ ok: boolean; error?: string }> {
  if (!hasGmailSend()) return { ok: false, error: "Mail isn't set up yet." };
  try {
    const tok = await accessToken();
    const raw = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      body,
    ].join("\r\n");
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(fromAccount())}/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: toBase64Url(raw) }),
      cache: "no-store",
    });
    if (!r.ok) { const t = await r.text(); return { ok: false, error: `Gmail ${r.status}: ${t.slice(0, 200)}` }; }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed." };
  }
}
