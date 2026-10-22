// Pure helpers for scripts/email-subscriptions.mjs (no network, no files), so they can be tested offline.
// Only HEADERS are ever looked at here: sender, List-Id, List-Unsubscribe, List-Unsubscribe-Post and the date.

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

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// One Gmail message (format=metadata) -> a small record, or null when the message carries no List-Unsubscribe header.
export function parseMessage(msg) {
  const h = Object.fromEntries((msg.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
  if (!h["list-unsubscribe"]) return null;
  const from = h["from"] || "";
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const address = (m ? m[2] : from).trim().toLowerCase();
  if (!address.includes("@")) return null;
  const { http, mailto } = parseListUnsubscribe(h["list-unsubscribe"]);
  if (!http && !mailto) return null;
  const listId = (h["list-id"] || "").match(/<([^>]+)>/)?.[1] || (h["list-id"] || "").trim() || null;
  return {
    address, name: (m ? m[1] : "").trim() || null, domain: address.split("@")[1], listId,
    http, mailto, oneClick: isOneClick(h["list-unsubscribe-post"], http), ts: Number(msg.internalDate || 0),
  };
}

// Messages -> one record per sender address. Unsubscribe links come from the NEWEST message (links often carry a
// per-message token and older ones can expire).
export function groupSenders(records) {
  const groups = new Map();
  for (const r of records) {
    let g = groups.get(r.address);
    if (!g) { g = { address: r.address, name: r.name, domain: r.domain, listId: r.listId, http: r.http, mailto: r.mailto, oneClick: r.oneClick, newestTs: r.ts, ts: [] }; groups.set(r.address, g); }
    g.ts.push(r.ts);
    if (r.ts >= g.newestTs) Object.assign(g, { name: r.name || g.name, listId: r.listId || g.listId, http: r.http, mailto: r.mailto, oneClick: r.oneClick, newestTs: r.ts });
  }
  for (const g of groups.values()) g.method = methodOf(g);
  return groups;
}

// What to write. `existing` is a Map of sender_key -> the current row. Never touches status, status_note, requested_*,
// completed_at or deleted_at: those belong to the person and to the unsubscribe agent.
export function planWrites({ groups, existing, person, mailbox, now }) {
  const inserts = [], updates = [];
  for (const g of groups.values()) {
    const ex = existing.get(g.address);
    const sorted = [...g.ts].sort((a, b) => a - b);
    const link = { sender_name: g.name, domain: g.domain, list_id: g.listId, unsub_http: g.http, unsub_mailto: g.mailto, one_click: g.oneClick, method: g.method };
    if (!ex) {
      inserts.push({ person, mailbox, sender_key: g.address, address: g.address, ...link, message_count: sorted.length, first_seen: isoDay(sorted[0]), last_seen: isoDay(sorted[sorted.length - 1]), last_message_ts: sorted[sorted.length - 1], updated_at: now });
      continue;
    }
    if (ex.deleted_at) continue;                                  // a row someone removed stays removed
    const cursor = Number(ex.last_message_ts || 0);
    const fresh = sorted.filter((t) => t > cursor);
    if (!fresh.length) continue;
    const patch = { ...link, message_count: (ex.message_count || 0) + fresh.length, last_seen: isoDay(fresh[fresh.length - 1]), last_message_ts: fresh[fresh.length - 1], updated_at: now };
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
