#!/usr/bin/env node
// Offline tests for scripts/unsubscribe-lib.mjs. No network to any sender. Run: node scripts/unsubscribe-test.mjs
import assert from "node:assert/strict";
import { isPublicIp, validateUnsubUrl, guardedLookup, parseTry, decideOutcome, decideManual, decideCheck, shouldMarkStopped, requestOneClick, registrableDomain, parseAuthResults, verifySender } from "./unsubscribe-lib.mjs";

// --- public / private addresses
for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888"]) assert.equal(isPublicIp(ip), true, `${ip} should be public`);
for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
  "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.1.2.3", "::ffff:192.168.0.9", "2001:db8::1", "2002:7f00:1::", "64:ff9b::7f00:1", "not-an-ip", ""]) assert.equal(isPublicIp(ip), false, `${ip} should be refused`);
assert.equal(isPublicIp("::ffff:8.8.8.8"), true, "mapped public v4 is public");
assert.equal(isPublicIp("172.32.0.1"), true, "172.32 is outside 172.16/12");

// --- URLs
assert.equal(validateUnsubUrl("https://list.example.com/u?id=1").ok, true);
for (const bad of ["http://list.example.com/u", "https://user:pw@list.example.com/u", "https://list.example.com:8443/u", "https://localhost/u", "https://printer.local/u", "https://intranet/u",
  "https://127.0.0.1/u", "https://[::1]/u", "https://10.0.0.8/u", "https://169.254.169.254/latest/meta-data", "ftp://x.example.com/u", "javascript:alert(1)", "not a url", "https://x.example.com/" + "a".repeat(2100)])
  assert.equal(validateUnsubUrl(bad).ok, false, `${bad.slice(0, 40)} should be refused`);
assert.equal(validateUnsubUrl("https://8.8.8.8/u").ok, true, "a public IP literal is allowed");

// --- the guarded lookup refuses loopback names at connect time
await new Promise((resolve) => guardedLookup("localhost", {}, (err) => { assert.ok(err && /blocked/.test(err.message), "localhost must be blocked"); resolve(); }));
await new Promise((resolve) => guardedLookup("localhost", { all: true }, (err) => { assert.ok(err && /blocked/.test(err.message), "localhost (all) must be blocked"); resolve(); }));

// --- requests to private targets never leave the machine
assert.deepEqual(await requestOneClick("https://127.0.0.1/u"), { kind: "refused", reason: "points at a private address" });
assert.equal((await requestOneClick("http://list.example.com/u")).kind, "refused");

// --- outcomes
const link = { hasLink: true }, noLink = { hasLink: false };
assert.deepEqual(decideOutcome({ kind: "http", status: 200 }, { ...link, tries: 0 }), { status: "done", note: "The sender confirmed (HTTP 200).", completed: true });
assert.equal(decideOutcome({ kind: "http", status: 204 }, link).status, "done");
assert.equal(decideOutcome({ kind: "http", status: 302, final: 200, hops: 1 }, link).status, "done", "a redirect to a 2xx page is how most senders confirm");
assert.equal(decideOutcome({ kind: "http", status: 302, final: 200, hops: 1 }, link).completed, true);
assert.equal(decideOutcome({ kind: "http", status: 302, final: 404, hops: 1 }, link).status, "open_link", "a redirect to a page that fails is not a confirmation");
assert.equal(decideOutcome({ kind: "http", status: 302, final: 302, hops: 3 }, link).status, "open_link", "a redirect loop is handed to the person");
assert.equal(decideOutcome({ kind: "http", status: 302, final: 302, hops: 0, unsafeHop: true }, link).status, "open_link", "a redirect to an unsafe address is never followed");
assert.equal(decideOutcome({ kind: "http", status: 302, final: null, hops: 1 }, { ...link, tries: 0 }).status, "requested", "redirect then silence is retried");
assert.equal(decideOutcome({ kind: "http", status: 301 }, link).status, "open_link", "a redirect with no Location header cannot be followed");
assert.equal(decideOutcome({ kind: "http", status: 404 }, link).status, "open_link");
assert.equal(decideOutcome({ kind: "http", status: 404 }, noLink).status, "failed");
assert.deepEqual(decideOutcome({ kind: "http", status: 503 }, { ...link, tries: 0 }), { status: "requested", note: "Try 1 of 3: HTTP 503" });
assert.equal(decideOutcome({ kind: "network", reason: "ETIMEDOUT" }, { ...link, tries: 1 }).note, "Try 2 of 3: ETIMEDOUT");
assert.equal(decideOutcome({ kind: "network", reason: "ETIMEDOUT" }, { ...link, tries: 2 }).status, "open_link", "third failure hands over to the person");
assert.equal(decideOutcome({ kind: "network", reason: "ETIMEDOUT" }, { ...noLink, tries: 2 }).status, "failed");
assert.equal(decideOutcome({ kind: "refused", reason: "x" }, link).status, "failed", "an unsafe address is never offered to the person");
assert.ok(!/https?:/.test(decideOutcome({ kind: "http", status: 404 }, link).note), "notes never contain an address");
assert.equal(parseTry("Try 2 of 3: HTTP 503"), 2); assert.equal(parseTry(null), 0); assert.equal(parseTry("The sender confirmed"), 0);

// --- who is really sending this? (Gmail's Authentication-Results + the unsubscribe host)
assert.equal(registrableDomain("mail.substack.com"), "substack.com"); assert.equal(registrableDomain("a.b.example.co.uk"), "example.co.uk"); assert.equal(registrableDomain("x.com"), "x.com");
const gmailAR = "mx.google.com; dkim=pass header.i=@substack.com header.s=google header.b=abc; spf=pass (google.com: domain of bounce@mg.substack.com designates 1.2.3.4 as permitted sender) smtp.mailfrom=bounce@mg.substack.com; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=substack.com";
assert.deepEqual(parseAuthResults(gmailAR), { spf: "pass", dkim: ["substack.com"], dmarc: "pass", spfDomain: "mg.substack.com" });
assert.equal(verifySender({ address: "writer@substack.com", http: "https://substack.com/u/1", authResults: gmailAR }).ok, true);
assert.equal(verifySender({ address: "news@acme.com", http: "https://acme.com/u", authResults: "mx.google.com; dkim=pass header.i=@acme.com; spf=pass smtp.mailfrom=b.acme.com" }).ok, true, "own domain, aligned");
assert.equal(verifySender({ address: "news@acme.com", http: "https://acme.us17.list-manage.com/u", authResults: "mx.google.com; dkim=pass header.d=acme.com" }).ok, true, "known mailing service is fine");
assert.equal(verifySender({ address: "news@acme.com", http: "https://acme.com/u", authResults: "mx.google.com; dkim=fail header.i=@acme.com; spf=softfail smtp.mailfrom=evil.com" }).ok, false, "failed Gmail's checks");
assert.equal(verifySender({ address: "news@acme.com", http: "https://acme.com/u", authResults: "mx.google.com; dkim=pass header.i=@evil.com; spf=pass smtp.mailfrom=evil.com" }).ok, false, "signed by someone else");
const via = verifySender({ address: "alerts@venmo.com", http: "https://01.emailinboundprocessing.com/u/abc?t=secret", authResults: "mx.google.com; dkim=pass header.d=venmo.com; dmarc=pass" });
assert.equal(via.ok, true, "an authenticated sender may route its unsubscribe through another service"); assert.ok(/emailinboundprocessing\.com/.test(via.note) && !/secret|abc/.test(via.note), "note names the service, never the address or token");
const spoof = verifySender({ address: "alerts@yourbank.com", http: "https://yourbank-secure-login.xyz/unsub", authResults: "mx.google.com; dkim=fail header.d=yourbank.com; spf=fail smtp.mailfrom=evil.xyz; dmarc=fail" });
assert.equal(spoof.ok, false, "a forged bank mail fails Gmail's checks"); assert.ok(!/xyz|yourbank/.test(spoof.note), "note never names the address");
assert.equal(verifySender({ address: "news@acme.com", http: null, mailto: "mailto:unsub@acme.com", authResults: "mx.google.com; dmarc=pass" }).ok, true);
assert.equal(verifySender({ address: "news@acme.com", http: null, mailto: "mailto:unsub@other.net", authResults: "mx.google.com; dmarc=pass" }).ok, true, "authenticated: a mailto on another domain is noted, not blocked");
assert.equal(verifySender({ address: "news@acme.com", http: "https://acme.com/u", authResults: "" }).ok, false, "no auth results at all is not verified");
assert.equal(decideCheck({ auth_ok: true }), null);
assert.equal(decideCheck({ auth_ok: false, auth_note: "x", trusted_at: "2026-10-27T00:00:00Z" }), null, "the person's say-so overrides");
assert.equal(decideCheck({ auth_ok: false, auth_note: "Bad." }).status, "check");
assert.equal(decideCheck({ auth_ok: null }).status, "check", "not yet checked is not verified");

// --- senders that need the person
assert.equal(decideManual({ method: "mailto", unsub_mailto: "mailto:u@x.com" }).status, "needs_tap");
assert.equal(decideManual({ method: "link", unsub_http: "https://x.com/u" }).status, "open_link");
assert.equal(decideManual({ method: "none" }).status, "failed");
assert.equal(decideManual({ method: "mailto", unsub_mailto: null }).status, "failed");

// --- 'stopped' sweep: only rows waiting on the person, 21 quiet days after the request
const now = Date.parse("2026-11-30T12:00:00Z");
assert.equal(shouldMarkStopped({ status: "open_link", requested_at: "2026-10-20T00:00:00Z", last_seen: "2026-10-18" }, now), true);
assert.equal(shouldMarkStopped({ status: "open_link", requested_at: "2026-10-20T00:00:00Z", last_seen: "2026-11-25" }, now), false, "still sending");
assert.equal(shouldMarkStopped({ status: "open_link", requested_at: "2026-11-20T00:00:00Z", last_seen: "2026-10-01" }, now), false, "asked too recently");
assert.equal(shouldMarkStopped({ status: "done", requested_at: "2026-10-01T00:00:00Z", last_seen: "2026-10-01" }, now), false, "done rows are left alone");
assert.equal(shouldMarkStopped({ status: "needs_tap", requested_at: "2026-10-20T00:00:00Z", last_seen: null }, now), true);

console.log("PASS: unsubscribe-lib (all checks)");
