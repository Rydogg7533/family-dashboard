// Offline test: Apple sends carriage returns inside CardDAV address-data as the XML code &#13;. They must become line breaks, not text.
import assert from "node:assert/strict";
import { parseVcard, unesc } from "./contacts-sync.mjs";
const vcard = ["BEGIN:VCARD", "VERSION:3.0", "UID:abc-1", "N:Doe;Jane;;;", "FN:Jane Doe", "ORG:Acme Inc;", "item1.TEL;type=pref:(801) 555-0100", "item1.X-ABLabel:_$!<Mobile>!$_", "TEL;type=WORK;type=VOICE:(801) 555-0199", "TEL;type=VOICE:(801) 555-0123", "EMAIL;type=INTERNET;type=HOME:jane@example.com", "ADR;type=HOME:;;1 Main St;Orem;UT;84057;USA", "NOTE:Line one\\nline two", "END:VCARD"].join("\r\n") + "\r\n";
const wire = vcard.replace(/&/g, "&amp;").replace(/\r/g, "&#13;");           // what the server sends
assert.ok(wire.includes("&#13;"));
const card = parseVcard(unesc(wire));
const dirty = JSON.stringify(card);
assert.ok(!/&#|#13/.test(dirty), "no stray character codes anywhere: " + dirty);
assert.equal(card.full_name, "Jane Doe"); assert.equal(card.org, "Acme Inc");
assert.deepEqual(card.phones.map((p) => [p.label, p.number]), [["mobile", "(801) 555-0100"], ["work", "(801) 555-0199"], ["other", "(801) 555-0123"]]);
assert.equal(card.emails[0].address, "jane@example.com"); assert.equal(card.addresses[0].city, "Orem");
assert.equal(unesc("&#x41;&#66;&amp;&lt;"), "AB&<");
console.log("PASS: contacts parsing (carriage-return codes are decoded)");
