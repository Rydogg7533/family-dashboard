import assert from "node:assert/strict";
import { parseGmailFull, htmlToText, parseAddressList } from "./mail-lib.mjs";
const enc = (s) => Buffer.from(s).toString("base64url");
const msg = { id: "m1", threadId: "t1", internalDate: "1761170000000", snippet: "Hi &amp; welcome", labelIds: ["INBOX", "UNREAD"], payload: { headers: [
  { name: "From", value: '"Doe, Jane" <Jane@Example.com>' }, { name: "To", value: 'ryan@x.com, "Bob, B" <bob@y.com>' }, { name: "Subject", value: "Lunch?" }, { name: "Message-ID", value: "<abc123@mail.example.com>" }],
  mimeType: "multipart/mixed", parts: [
  { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: enc("Hello Ryan,\r\nLunch tomorrow?") } }, { mimeType: "text/html", body: { data: enc("<p>Hello <b>Ryan</b></p>") } }] },
  { mimeType: "application/pdf", filename: "menu.pdf", body: { attachmentId: "a1", size: 1234 } }] } };
const r = parseGmailFull(msg, "inbox", "me@gmail.com");
assert.equal(r.rfc_message_id, "abc123@mail.example.com"); assert.equal(r.from_addr, "jane@example.com"); assert.equal(r.from_name, "Doe, Jane");
assert.deepEqual(r.to_addrs.map((x) => x.addr), ["ryan@x.com", "bob@y.com"]); assert.equal(r.to_addrs[1].name, "Bob, B");
assert.equal(r.body_text, "Hello Ryan,\nLunch tomorrow?"); assert.equal(r.unread, true); assert.equal(r.snippet, "Hi & welcome");
assert.deepEqual(r.attachments, [{ name: "menu.pdf", mime: "application/pdf", size: 1234 }]); assert.ok(r.web_url.endsWith("#inbox/t1")); assert.equal(r.sent_at, new Date(1761170000000).toISOString());
// html-only mail becomes readable text; images/scripts never survive
const h = htmlToText('<style>p{}</style><p>Hi&nbsp;there &amp; <a href="https://x.com/a">click</a></p><img src="https://track/p.gif"><ul><li>One</li><li>Two</li></ul><script>evil()</script>');
assert.ok(h.includes("Hi there & click (https://x.com/a)") && h.includes("• One") && !/track|evil|<|style/.test(h), h);
const only = parseGmailFull({ id: "m2", payload: { headers: [], mimeType: "text/html", body: { data: enc("<div>Only <i>html</i></div>") } } }, "draft", "a@b.com");
assert.equal(only.body_text, "Only html"); assert.equal(only.sent_at, null);
assert.deepEqual(parseAddressList('A <a@x.com>, "B, C" <b@x.com>, plain@x.com').map((x) => x.addr), ["a@x.com", "b@x.com", "plain@x.com"]);
console.log("PASS: mail parsing (headers, addresses with commas, plain/HTML bodies, attachments, no tracking content)");

// Mail sync only treats real Gmail sign-ins as mailboxes: contacts / calendar / sheets sign-ins are other purposes.
{
  const { isMailboxToken } = await import("./mail-sync.mjs");
  const assert2 = (await import("node:assert/strict")).default;
  assert2.equal(isMailboxToken("google-admin@shvr.co.json"), "admin@shvr.co");
  assert2.equal(isMailboxToken("google-melissarossiter1@gmail.com.json"), "melissarossiter1@gmail.com");
  for (const f of ["google-melissarossiter1@gmail.com.contacts.json", "google-rross15253@gmail.com.calendar.json", "google-admin@shvr.co.sheets.json", "google-oauth-client.json", "icloud-ryan.env", "google-admin@shvr.co.calendar.env"]) assert2.equal(isMailboxToken(f), null, f);
  console.log("PASS: mail sync token files (only real Gmail sign-ins are mailboxes)");
}
