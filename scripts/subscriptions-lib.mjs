// Pure helpers for scripts/email-subscriptions.mjs (no network, no files), so they can be tested offline.
// Only HEADERS are ever looked at here: sender, subject, List-Id, List-Unsubscribe, List-Unsubscribe-Post, Authentication-Results and the date. Never the body.
import { verifySender } from "./unsubscribe-lib.mjs";

// "<https://x.com/u?id=1>, <mailto:unsub@x.com?subject=unsubscribe>" -> { http, mailto }
// Only https links are used for web unsubscribes (plain http would send the person's token in the clear).
export function parseListUnsubscribe(value) {
  const out = { http: null, mailto: null };
  for (const m of String(value || "").matchAll(/<([^>]+)>/g)) {
    const u = m[1].trim();
    if (!out.http && /^https:\/\//i.test(u)) out.http = u;
    else if (!out.mailto && /^mailto:/i.test(u)) out.mailto = u;
  }
  return out;
}

// RFC 8058: a sender that supports one-click unsubscribe says so in List-Unsubscribe-Post and must give an https link.
export const isOneClick = (postHeader, http) => !!http && /list-unsubscribe\s*=\s*one-click/i.test(String(postHeader || ""));

export const methodOf = ({ http, mailto, oneClick }) => (oneClick ? "one_click" : http ? "link" : mailto ? "mailto" : "none");

export const cleanSubject = (v) => String(v || "").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

// ---------- what is this list about? keyword rules on the sender and its recent subjects; no model, nothing leaves the Mac mini ----------
// First match wins, so order matters. 'account' comes first on purpose: when in doubt a sender is guarded, never offered as junk.
const RULES = [
  ["account", /\b(bank|credit union|credit karma|venmo|paypal|zelle|cash app|chase|wells ?fargo|capital ?one|amex|american express|discover card|fidelity|schwab|vanguard|coinbase|insurance|statement|autopay|your (account|payment|receipt|invoice|bill|balance|password|security|appointment|prescription)|verify|verification|security alert|two-?factor|sign-?in|log-?in|password|prescription|pharmacy|clinic|patient|school|district|tax|irs|utility|terms of service|privacy policy|google account|account data|openai|anthropic|github|vercel|supabase|stripe|cloudflare|namecheap|godaddy)\b/i],
  ["social", /\b(linkedin|facebook|instagram|twitter|nextdoor|pinterest|reddit|quora|meetup|tiktok|snapchat|discord|strava|goodreads|youtube|(connection|follower|invitation)s?|mentioned you|new followers)\b|\bx\.com\b/i],
  ["travel", /\b(airlines?|flights?|hotels?|airbnb|vrbo|expedia|marriott|hilton|hyatt|cruises?|vacations?|resorts?|rental car|hertz|avis|delta|southwest|united airlines|booking\.com|travel|trip)\b/i],
  ["donations", /\b(donate|donations?|fundrais\w*|petitions?|vote|voting|election|candidate|committee|congress|senate|nonprofit|charity|pac)\b/i],
  ["promos", /\d+\s?% ?off|\b(sale|deals?|coupons?|promo\w*|discounts?|save \$?\d+|free shipping|clearance|offers?|sneak peek|new arrivals|limited time|last chance|ends (today|tonight|soon|sunday)|exclusive|rewards|bundle|shop now|black friday|cyber monday|bogo|flash|sweepstakes|giveaway|just listed|new listing|% off)\b/i],
  ["orders", /\b(orders?|shipped|shipping|delivery|delivered|tracking|package|your purchase)\b/i],
  ["news", /\b(newsletters?|digests?|weekly|daily|briefing|brief|edition|issue|roundup|substack|medium|podcasts?|blog|news|reports?|insights?|tips|stories|read|beehiiv|mailchimp|convertkit|what'?s new|now in|new features?|trending|release notes|product update)\b/i],
];
export function categorize({ name, domain, subjects }) {
  const text = `${name || ""} ${domain || ""} | ${(subjects || []).join(" | ")}`;
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return "unclear";
}

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// One Gmail message (format=metadata) -> a small record, or null when the message carries no List-Unsubscribe header.
export function parseMessage(msg) {
  const h = Object.fromEntries((msg.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
  if (!h["list-unsubscribe"]) return null;
  // Gmail can add several Authentication-Results headers (ARC); keep them all so a pass is not hidden by the last one.
  const authResults = (msg.payload?.headers || []).filter((x) => x.name.toLowerCase() === "authentication-results").map((x) => x.value).join("; ");
  const from = h["from"] || "";
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const address = (m ? m[2] : from).trim().toLowerCase();
  if (!address.includes("@")) return null;
  const { http, mailto } = parseListUnsubscribe(h["list-unsubscribe"]);
  if (!http && !mailto) return null;
  const listId = (h["list-id"] || "").match(/<([^>]+)>/)?.[1] || (h["list-id"] || "").trim() || null;
  const auth = verifySender({ address, http, mailto, authResults });
  return {
    address, name: (m ? m[1] : "").trim() || null, domain: address.split("@")[1], listId,
    http, mailto, oneClick: isOneClick(h["list-unsubscribe-post"], http), ts: Number(msg.internalDate || 0), subject: cleanSubject(h["subject"]),
    authOk: auth.ok, authNote: auth.note,
  };
}

// Messages -> one record per sender address. Unsubscribe links come from the NEWEST message (links often carry a
// per-message token and older ones can expire).
export function groupSenders(records) {
  const groups = new Map();
  for (const r of records) {
    let g = groups.get(r.address);
    if (!g) { g = { address: r.address, name: r.name, domain: r.domain, listId: r.listId, http: r.http, mailto: r.mailto, oneClick: r.oneClick, authOk: r.authOk, authNote: r.authNote, newestTs: r.ts, ts: [], subs: [] }; groups.set(r.address, g); }
    g.ts.push(r.ts); if (r.subject) g.subs.push({ ts: r.ts, subject: r.subject });
    if (r.ts >= g.newestTs) Object.assign(g, { name: r.name || g.name, listId: r.listId || g.listId, http: r.http, mailto: r.mailto, oneClick: r.oneClick, authOk: r.authOk, authNote: r.authNote, newestTs: r.ts });
  }
  for (const g of groups.values()) {
    g.method = methodOf(g);
    const seen = new Set(); g.subjects = [];
    for (const x of g.subs.sort((a, b) => b.ts - a.ts)) { const k = x.subject.toLowerCase(); if (!seen.has(k) && g.subjects.length < 3) { seen.add(k); g.subjects.push(x.subject); } }
    g.category = categorize(g);
  }
  return groups;
}

// What to write. `existing` is a Map of sender_key -> the current row. Never touches status, status_note, requested_*,
// completed_at or deleted_at: those belong to the person and to the unsubscribe agent.
export function planWrites({ groups, existing, person, mailbox, now }) {
  const inserts = [], updates = [];
  for (const g of groups.values()) {
    const ex = existing.get(g.address);
    const sorted = [...g.ts].sort((a, b) => a - b);
    const topic = { category: g.category, recent_subjects: g.category === "account" ? [] : g.subjects };   // account senders: label only, no subject text kept
    const link = { sender_name: g.name, domain: g.domain, list_id: g.listId, unsub_http: g.http, unsub_mailto: g.mailto, one_click: g.oneClick, method: g.method, auth_ok: g.authOk ?? null, auth_note: g.authNote ?? null };
    if (!ex) {
      inserts.push({ person, mailbox, sender_key: g.address, address: g.address, ...link, ...topic, message_count: sorted.length, first_seen: isoDay(sorted[0]), last_seen: isoDay(sorted[sorted.length - 1]), last_message_ts: sorted[sorted.length - 1], updated_at: now });
      continue;
    }
    if (ex.deleted_at) continue;                                  // a row someone removed stays removed
    const cursor = Number(ex.last_message_ts || 0);
    const fresh = sorted.filter((t) => t > cursor);
    if (!fresh.length) {
      // Rows found before topics existed get their label and subjects once, with no change to counts or dates.
      // Also when the rules have changed since the label was stored (the label is derived data; nothing the person sets).
      const backfill = {};
      if ((ex.category ?? null) !== g.category && (ex.category != null || g.subjects.length || g.category !== "unclear")) Object.assign(backfill, topic);
      // The verdict is derived data (newest message's headers + the current rules): filled when missing, refreshed when the rules changed it.
      if (g.authOk != null && (ex.auth_ok ?? null) !== g.authOk) Object.assign(backfill, { auth_ok: g.authOk, auth_note: g.authNote ?? null });
      if (Object.keys(backfill).length) updates.push({ id: ex.id, patch: { ...backfill, updated_at: now } });
      continue;
    }
    const patch = { ...link, ...topic, message_count: (ex.message_count || 0) + fresh.length, last_seen: isoDay(fresh[fresh.length - 1]), last_message_ts: fresh[fresh.length - 1], updated_at: now };
    if (ex.first_seen && isoDay(sorted[0]) < ex.first_seen) patch.first_seen = isoDay(sorted[0]);
    // Verification loop: mail that arrives after an unsubscribe completed is counted, so "done" can be checked later.
    if (ex.completed_at) {
      const after = Math.max(Date.parse(ex.completed_at), cursor);
      const n = fresh.filter((t) => t > after).length;
      if (n) patch.messages_since_unsub = (ex.messages_since_unsub || 0) + n;
    }
    updates.push({ id: ex.id, patch });
  }
  return { inserts, updates };
}
