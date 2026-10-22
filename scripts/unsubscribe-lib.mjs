// Helpers for scripts/email-unsubscribe.mjs. No dependencies: Node 20+.
//
// WHY THIS FILE IS CAREFUL: the unsubscribe address comes from an email header, and anyone can put anything in a header. The agent
// runs on a home network, so a forged address must never be able to make it talk to a machine on that network (or to the cloud
// metadata address). Three layers: (1) the URL must be plain https on port 443 with no embedded login; (2) an address written as
// an IP must be a public one; (3) a hostname is resolved by a guarded lookup that REFUSES any non-public answer at the moment the
// connection is made (so DNS tricks cannot swap the answer afterwards).
import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import https from "node:https";

// ---------- public-address check ----------
function v4(ip) { const p = ip.split(".").map(Number); return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null; }
function parseV6(ip) {
  let s = ip.toLowerCase().split("%")[0];
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) { const q = v4(tail[1]); if (!q) return null; s = s.slice(0, -tail[1].length) + ((q[0] << 8) | q[1]).toString(16) + ":" + ((q[2] << 8) | q[3]).toString(16); }
  const halves = s.split("::"); if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [], rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const parts = [...head, ...Array(fill).fill("0"), ...rest].map((h) => parseInt(h || "0", 16));
  return parts.length === 8 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? parts : null;
}
export function isPublicIp(ip) {
  const kind = isIP(String(ip));
  if (kind === 4) {
    const [a, b, c] = v4(ip);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;                     // carrier-grade NAT
    if (a === 169 && b === 254) return false;                              // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (kind === 6) {
    const h = parseV6(ip); if (!h) return false;
    if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0xffff) return isPublicIp(`${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`);   // ::ffff:a.b.c.d
    if (h[0] < 0x2000 || h[0] > 0x3fff) return false;                       // only global unicast 2000::/3
    if (h[0] === 0x2001 && (h[1] === 0x0db8 || h[1] === 0)) return false;   // documentation, Teredo
    if (h[0] === 0x2002) return false;                                      // 6to4 (embeds an IPv4 address)
    return true;
  }
  return false;
}

// ---------- the URL ----------
export function validateUnsubUrl(raw) {
  let u; try { u = new URL(String(raw)); } catch { return { ok: false, reason: "not a valid address" }; }
  if (String(raw).length > 2048) return { ok: false, reason: "address too long" };
  if (u.protocol !== "https:") return { ok: false, reason: "not https" };
  if (u.username || u.password) return { ok: false, reason: "address carries a login" };
  if (u.port && u.port !== "443") return { ok: false, reason: "unusual port" };
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) { if (!isPublicIp(host)) return { ok: false, reason: "points at a private address" }; }
  else if (!host.includes(".") || /\.(local|localhost|internal|lan|home|corp|test|invalid)$/i.test(host)) return { ok: false, reason: "not a public host name" };
  return { ok: true, url: u, host };
}

// dns.lookup that answers only when EVERY address is public. Used as the connection's own lookup, so it is enforced at connect time.
export function guardedLookup(hostname, options, cb) {
  dnsLookup(hostname, { ...(options || {}), all: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: 4 }];
    if (!list.length || list.some((a) => !isPublicIp(a.address))) return cb(new Error("blocked: the host name points at a non-public address"));
    if (options && options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

// ---------- the request (RFC 8058 one-click) ----------
// POST "List-Unsubscribe=One-Click" to the https address. No cookies, no identity beyond what is already in the address, redirects are
// NOT followed (a redirect is reported, not trusted). `lookup` and `tls` exist only so tests can talk to a local server; production
// never passes them. The address itself is never put in a result, a note or a log (it can carry a personal token).
export function requestOneClick(urlString, { lookup = guardedLookup, tls = {}, timeoutMs = 20000 } = {}) {
  return new Promise((resolve) => {
    const v = validateUnsubUrl(urlString);
    if (!v.ok) return resolve({ kind: "refused", reason: v.reason });
    const body = "List-Unsubscribe=One-Click";
    const req = https.request({
      hostname: v.host, port: 443, path: v.url.pathname + v.url.search, method: "POST", lookup, agent: false, timeout: timeoutMs,
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body), "User-Agent": "StewardOS unsubscribe" }, ...tls,
    }, (res) => { res.resume(); resolve({ kind: "http", status: res.statusCode, redirected: !!res.headers.location }); });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve(/^blocked:/.test(e.message) ? { kind: "refused", reason: "the host name points at a non-public address" } : { kind: "network", reason: e.code || e.message.slice(0, 40) }));
    req.end(body);
  });
}

// ---------- outcomes ----------
export const MAX_TRIES = 3;
export const parseTry = (note) => { const m = String(note || "").match(/^Try (\d) of 3\b/); return m ? Number(m[1]) : 0; };

// What a finished attempt means for the row. `hasLink` = the row has an https address the person can open themselves.
// Returns { status, note, completed?: true }. status 'requested' means "try again on a later run".
export function decideOutcome(result, { hasLink, tries = 0 }) {
  const finish = (reason) => hasLink ? { status: "open_link", note: `${reason} Open the sender's page to finish.` } : { status: "failed", note: reason };
  if (result.kind === "refused") return { status: "failed", note: "This sender's unsubscribe address looked unsafe, so it was not used." };
  if (result.kind === "http") {
    const s = result.status;
    if (s >= 200 && s < 300) return { status: "done", note: `The sender confirmed (HTTP ${s}).`, completed: true };
    if (s >= 300 && s < 400) return finish(`The sender redirected instead of confirming (HTTP ${s}).`);
    if (s === 429 || s >= 500) return retry(`HTTP ${s}`, tries, finish);
    return finish(`The sender refused the automatic request (HTTP ${s}).`);
  }
  return retry(result.reason || "no answer", tries, finish);
}
function retry(reason, tries, finish) {
  const n = tries + 1;
  return n >= MAX_TRIES ? finish(`Tried ${MAX_TRIES} times (${reason}).`) : { status: "requested", note: `Try ${n} of ${MAX_TRIES}: ${reason}` };
}

// Senders that cannot be done automatically.
export function decideManual(row) {
  if (row.method === "mailto" && row.unsub_mailto) return { status: "needs_tap", note: "This sender only accepts an unsubscribe email. Open it, check it, and send it from your mail app." };
  if (row.method === "link" && row.unsub_http) return { status: "open_link", note: "This sender does not support automatic unsubscribing. Open its page to finish." };
  return { status: "failed", note: "No usable unsubscribe address was found for this sender." };
}

// Rows waiting on the person (needs_tap, open_link) become 'stopped' once no mail has arrived for 21 days after the request.
export function shouldMarkStopped(row, now = Date.now()) {
  if (!["needs_tap", "open_link"].includes(row.status) || !row.requested_at) return false;
  const cutoff = now - 21 * 86400000;
  return Date.parse(row.requested_at) < cutoff && (!row.last_seen || Date.parse(row.last_seen + "T23:59:59Z") < cutoff);
}
