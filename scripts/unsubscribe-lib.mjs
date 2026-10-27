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
// POST "List-Unsubscribe=One-Click" to the https address. No cookies, no identity beyond what is already in the address.
// Most senders (Substack, Mailchimp, …) answer the POST with a redirect to their "you are unsubscribed" page, so a redirect is
// FOLLOWED (as a plain GET, at most MAX_HOPS times) and every hop goes through the same guards as the first address: https on 443,
// public host, guarded DNS at connect time. The result reports the first status and the final one. `lookup` and `tls` exist only so
// tests can talk to a local server; production never passes them. The address itself is never put in a result, a note or a log (it
// can carry a personal token).
export const MAX_HOPS = 3;
function oneRequest({ url, host, method, body, lookup, tls, timeoutMs }) {
  return new Promise((resolve) => {
    const headers = { "User-Agent": "StewardOS unsubscribe" };
    if (body) Object.assign(headers, { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) });
    const req = https.request({ hostname: host, port: 443, path: url.pathname + url.search, method, lookup, agent: false, timeout: timeoutMs, headers, ...tls },
      (res) => { res.resume(); resolve({ kind: "http", status: res.statusCode, location: res.headers.location || null }); });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve(/^blocked:/.test(e.message) ? { kind: "refused", reason: "the host name points at a non-public address" } : { kind: "network", reason: e.code || e.message.slice(0, 40) }));
    req.end(body || undefined);
  });
}
export async function requestOneClick(urlString, { lookup = guardedLookup, tls = {}, timeoutMs = 20000 } = {}) {
  let v = validateUnsubUrl(urlString);
  if (!v.ok) return { kind: "refused", reason: v.reason };
  let r = await oneRequest({ url: v.url, host: v.host, method: "POST", body: "List-Unsubscribe=One-Click", lookup, tls, timeoutMs });
  if (r.kind !== "http") return r;
  const first = r.status;
  let hops = 0;
  while (r.kind === "http" && r.status >= 300 && r.status < 400 && r.location && hops < MAX_HOPS) {
    let next; try { next = new URL(r.location, v.url).toString(); } catch { break; }
    v = validateUnsubUrl(next);
    if (!v.ok) return { kind: "http", status: first, final: r.status, hops, redirected: true, unsafeHop: true };   // the sender pointed somewhere we refuse to go: stop, report the redirect
    hops++;
    r = await oneRequest({ url: v.url, host: v.host, method: "GET", lookup, tls, timeoutMs });
  }
  if (r.kind !== "http") return hops ? { kind: "http", status: first, final: null, hops, redirected: true } : r;
  return { kind: "http", status: first, final: r.status, hops, redirected: hops > 0 || (r.status >= 300 && r.status < 400) };
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
    const s = result.status, f = result.final ?? s;
    if (s >= 300 && s < 400) {
      // The sender redirected after the request. Followed through to its page: a 2xx there is the normal "you are unsubscribed" page.
      if (result.hops && result.final == null) return retry(`HTTP ${s}, then no answer`, tries, finish);
      if (f >= 200 && f < 300) return { status: "done", note: `The sender accepted and showed its confirmation page (HTTP ${s} → ${f}).`, completed: true };
      if (result.unsafeHop) return finish(`The sender redirected to an address that failed the safety check (HTTP ${s}).`);
      if (f >= 300 && f < 400) return finish(`The sender kept redirecting (HTTP ${s}).`);
      return finish(`The sender redirected to a page that did not confirm (HTTP ${s} → ${f}).`);
    }
    if (s >= 200 && s < 300) return { status: "done", note: `The sender confirmed (HTTP ${s}).`, completed: true };
    if (s === 429 || s >= 500) return retry(`HTTP ${s}`, tries, finish);
    return finish(`The sender refused the automatic request (HTTP ${s}).`);
  }
  return retry(result.reason || "no answer", tries, finish);
}

// ---------- is this really the sender? ----------
// Anyone can put a List-Unsubscribe header on a mail. Before the agent talks to the address (or shows it as a link), the mail must
// have passed Gmail's own sender checks and the unsubscribe host must belong to the sender. Rows that fail are shown to the person as
// "Check first" and nothing is sent unless they say they know the sender.
const TWO_LEVEL = /^(co|com|org|net|gov|edu|ac|ne|or)$/i;
export function registrableDomain(host) {
  const p = String(host || "").toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (p.length < 2) return p.join(".");
  const n = p.length >= 3 && p[p.length - 1].length === 2 && TWO_LEVEL.test(p[p.length - 2]) ? 3 : 2;
  return p.slice(-n).join(".");
}
// Mailing providers whose unsubscribe pages live on their own domain, not the sender's.
export const KNOWN_LIST_HOSTS = ["substack.com", "list-manage.com", "mailchimp.com", "mailchimpapp.net", "sendgrid.net", "sendgrid.com", "convertkit.com", "kit.com", "beehiiv.com", "hubspot.com", "hubspotlinks.com", "hs-sites.com", "klaviyo.com", "klaviyomail.com", "constantcontact.com", "constantcontactpages.com", "campaign-archive.com", "mailgun.net", "mailgun.org", "sparkpostmail.com", "mailerlite.com", "mailerlite.io", "activehosted.com", "braze.com", "iterable.com", "sailthru.com", "cmail19.com", "cmail20.com", "createsend.com", "exacttarget.com", "salesforce.com", "marketo.com", "mktoweb.com", "mailjet.com", "emailoctopus.com", "aweber.com", "getresponse.com", "drip.com", "rsgsv.net", "sendinblue.com", "brevo.com", "sendibm1.com", "ghost.io", "buttondown.email", "buttondown.com", "mail.google.com", "google.com", "amazon.com", "linkedin.com", "facebookmail.com", "facebook.com", "email.apple.com", "apple.com", "microsoft.com", "nextdoor.com", "pinterest.com", "reddit.com"];

// Gmail's Authentication-Results header(s) -> { spf, dkim: [domains that passed], dmarc, dmarcFrom }
export function parseAuthResults(value) {
  const v = String(value || "");
  const out = { spf: null, dkim: [], dmarc: null, spfDomain: null };
  const spf = v.match(/\bspf=(pass|fail|softfail|neutral|none|temperror|permerror)\b/i); if (spf) out.spf = spf[1].toLowerCase();
  const mf = v.match(/smtp\.mailfrom=(?:[^;\s@]+@)?([^;\s]+)/i); if (mf) out.spfDomain = mf[1].toLowerCase();
  for (const m of v.matchAll(/\bdkim=pass\b[^;]*?header\.(?:i=@|d=)([^;\s]+)/gi)) out.dkim.push(m[1].toLowerCase());
  const dm = v.match(/\bdmarc=(pass|fail|none|bestguesspass)\b/i); if (dm) out.dmarc = dm[1].toLowerCase();
  return out;
}
// Decide. Returns { ok: boolean, note: string }. `note` is shown to the person, so it never contains an address or a token.
export function verifySender({ address, http, mailto, authResults }) {
  const fromDom = registrableDomain(String(address || "").split("@")[1] || "");
  if (!fromDom) return { ok: false, note: "The sender address could not be read." };
  const a = parseAuthResults(authResults);
  const aligned = a.dmarc === "pass" || a.dkim.some((d) => registrableDomain(d) === fromDom) || (a.spf === "pass" && a.spfDomain && registrableDomain(a.spfDomain) === fromDom);
  if (!aligned) {
    const passed = a.dkim.length || a.spf === "pass";
    return { ok: false, note: passed ? "The mail was sent through another domain, not the sender's own, so the sender could not be confirmed." : "The mail did not pass Gmail's sender checks, so it may not be from who it says." };
  }
  const trusted = new Set([fromDom, ...a.dkim.map(registrableDomain), ...KNOWN_LIST_HOSTS]);
  if (http) {
    let host; try { host = new URL(http).hostname; } catch { return { ok: false, note: "The unsubscribe address could not be read." }; }
    if (!trusted.has(registrableDomain(host))) return { ok: false, note: "The unsubscribe link points at a site that is not the sender's own and not a known mailing service." };
  } else if (mailto) {
    let dom; try { dom = decodeURIComponent(new URL(mailto).pathname).split("@")[1]; } catch { return { ok: false, note: "The unsubscribe address could not be read." }; }
    if (!trusted.has(registrableDomain(dom || ""))) return { ok: false, note: "The unsubscribe email address is not at the sender's own domain or a known mailing service." };
  }
  return { ok: true, note: "Sender verified by Gmail and the unsubscribe address belongs to it." };
}

// Agent-side gate: a requested row the person has not marked as known must pass verification before anything is sent.
export function decideCheck(row) {
  if (row.trusted_at) return null;
  if (row.auth_ok === true) return null;
  const why = row.auth_ok === false ? row.auth_note || "The sender could not be verified." : "This sender has not been checked yet (it is checked on the next mail scan).";
  return { status: "check", note: `${why} Nothing was sent. If you know this sender, tap "I know this sender" to go ahead; otherwise mark it as spam in Gmail.` };
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
