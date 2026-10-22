// Offline test for two-way contacts: patching keeps everything else, conflicts write nothing, creates are valid.
import assert from "node:assert/strict";
import { patchVcard, buildVcard, validate, logicalLines } from "./contacts-write-lib.mjs";
import { parseVcard } from "./contacts-sync.mjs";
import { applyEdit } from "./contacts-push.mjs";

const orig = ["BEGIN:VCARD", "VERSION:3.0", "UID:abc-1", "N:Doe;Jane;Q;Dr.;", "FN:Dr. Jane Q Doe", "ORG:Acme Inc;", "item1.TEL:(801) 555-0100", "item1.X-ABLabel:_$!<Mobile>!$_", "TEL;type=WORK;type=VOICE:(801) 555-0199",
  "EMAIL;type=INTERNET;type=HOME:jane@example.com", "ADR;type=HOME:;;1 Main St;Orem;UT;84057;USA", "BDAY:1980-02-03", "NOTE:Line one\\nline two", "X-CUSTOM-THING:keep me",
  "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/",
  " 2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/", "END:VCARD"].join("\r\n") + "\r\n";

// 1. edit a phone only: everything else survives byte for byte
const a = patchVcard(orig, { phones: [{ label: "mobile", number: "(801) 555-0111" }, { label: "work", number: "(801) 555-0199" }] });
const pa = parseVcard(a);
assert.deepEqual(pa.phones.map((p) => [p.label, p.number]), [["mobile", "(801) 555-0111"], ["work", "(801) 555-0199"]]);
assert.equal(pa.full_name, "Dr. Jane Q Doe"); assert.equal(pa.org, "Acme Inc"); assert.equal(pa.addresses[0].city, "Orem");
assert.equal(pa.birthday, "1980-02-03"); assert.equal(pa.notes, "Line one\nline two");
for (const keep of ["X-CUSTOM-THING:keep me", "ADR;type=HOME:;;1 Main St;Orem;UT;84057;USA", "BDAY:1980-02-03", "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQ"]) assert.ok(a.includes(keep), "kept: " + keep);
assert.ok(a.includes("2wBDAQMEBAUEBQkFBQkUDQsNFBQU"), "folded photo continuation kept");
assert.ok(!a.includes("X-ABLabel:_$!<Mobile>!$_"), "old label line of the replaced phone is gone, no orphan");
assert.ok(a.includes("EMAIL;type=INTERNET;type=HOME:jane@example.com"), "emails untouched when not edited");
assert.equal((a.match(/BEGIN:VCARD/g) || []).length, 1); assert.ok(a.endsWith("END:VCARD\r\n"));

// 2. rename keeps prefix and middle name
const b = patchVcard(orig, { first_name: "Janet" });
const pb = parseVcard(b); assert.equal(pb.first_name, "Janet"); assert.equal(pb.last_name, "Doe"); assert.equal(pb.full_name, "Dr. Janet Q Doe");
assert.equal((b.match(/^N:/gm) || []).length, 1); assert.equal((b.match(/^FN:/gm) || []).length, 1);

// 3. custom label becomes a grouped X-ABLabel, and round-trips
const c = patchVcard(orig, { emails: [{ label: "school", address: "Jane@School.edu" }] });
const pc = parseVcard(c); assert.deepEqual(pc.emails.map((e) => [e.label, e.address]), [["school", "jane@school.edu"]]);

// 4. removing all emails works; removing the name entirely is refused
assert.equal(parseVcard(patchVcard(orig, { emails: [] })).emails.length, 0);
assert.throws(() => patchVcard(orig, { first_name: "", last_name: "", org: "" }), /name or a company/);

// 5. validation
assert.throws(() => validate({ phones: [{ label: "x", number: "abc" }] }), /phone/);
assert.throws(() => validate({ emails: [{ label: "x", address: "nope" }] }), /email/);
assert.equal(validate({ first_name: "  A\nB  " }).first_name, "A B");

// 6. new card
const n = buildVcard("11111111-2222-3333-4444-555555555555", { first_name: "Sam", last_name: "Lee", phones: [{ label: "mobile", number: "801-555-0142" }], emails: [{ label: "home", address: "sam@x.com" }] });
const pn = parseVcard(n); assert.equal(pn.uid, "11111111-2222-3333-4444-555555555555"); assert.equal(pn.full_name, "Sam Lee");
assert.deepEqual(pn.phones.map((p) => [p.label, p.number]), [["mobile", "801-555-0142"]]); assert.ok(n.includes("VERSION:3.0") && n.endsWith("END:VCARD\r\n"));
assert.throws(() => buildVcard("u", {}), /name or a company/);

// 7. apply flow against a fake iCloud
function fakeIcloud(store) {
  let rev = 1;
  return {
    puts: [],
    get: async (url) => store.has(url) ? { status: 200, etag: `"E${store.get(url).rev}"`, text: store.get(url).text } : { status: 404, text: "" },
    put: async function (url, body, ifMatch, ifNone) {
      this.puts.push({ url, ifMatch, ifNone });
      const cur = store.get(url);
      if (ifNone && cur) return { status: 412 };
      if (ifMatch && (!cur || `"E${cur.rev}"` !== ifMatch)) return { status: 412 };
      store.set(url, { text: body, rev: ++rev }); return { status: 201, etag: `"E${rev}"` };
    },
  };
}
const book = "https://p01-contacts.icloud.com/123/carddavhome/card/";
const url = book + "abc-1.vcf";
const store = new Map([[url, { text: orig, rev: 1 }]]);
const io = fakeIcloud(store); const backups = []; const bk = (uid, t) => backups.push([uid, t]);
const card = { uid: "abc-1", href: "/123/carddavhome/card/abc-1.vcf" };
const ok = await applyEdit({ op: "update", base_etag: '"E1"', fields: { phones: [{ label: "home", number: "801-555-0000" }] } }, card, book, io, bk);
assert.equal(ok.status, "applied"); assert.equal(backups.length, 1); assert.equal(backups[0][1], orig, "backup is the untouched original");
assert.equal(io.puts[0].ifMatch, '"E1"'); assert.deepEqual(parseVcard(ok.vcard).phones.map((p) => p.number), ["801-555-0000"]);
// iCloud changed since the person opened the form (their base etag is now stale) → nothing written
const before = io.puts.length;
const stale = await applyEdit({ op: "update", base_etag: '"E1"', fields: { org: "New Co" } }, card, book, io, bk);
assert.equal(stale.status, "conflict"); assert.equal(io.puts.length, before, "no write on conflict"); assert.equal(backups.length, 1);
// deleted in iCloud
assert.equal((await applyEdit({ op: "update", base_etag: '"E1"', fields: { org: "x" } }, { uid: "z", href: "/123/carddavhome/card/zzz.vcf" }, book, io, bk)).status, "conflict");
// race: etag matches at read but changes before put → 412 → conflict, not overwrite
const racy = { get: async () => ({ status: 200, etag: '"E9"', text: orig }), put: async () => ({ status: 412 }) };
assert.equal((await applyEdit({ op: "update", base_etag: '"E9"', fields: { org: "Q" } }, card, book, racy, bk)).status, "conflict");
// create
const made = await applyEdit({ op: "create", fields: { first_name: "Sam", last_name: "Lee", phones: [{ label: "mobile", number: "801-555-0142" }] } }, null, book, io, bk);
assert.equal(made.status, "applied"); assert.ok(io.puts.at(-1).ifNone && !io.puts.at(-1).ifMatch, "create can never replace an existing card");
assert.equal(parseVcard(made.vcard).full_name, "Sam Lee");
// bad input never reaches iCloud
const bad = await applyEdit({ op: "update", base_etag: '"E1"', fields: { phones: [{ label: "x", number: "no" }] } }, card, book, fakeIcloud(new Map([[url, { text: orig, rev: 1 }]])), bk);
assert.equal(bad.status, "error");
console.log("PASS: two-way contacts (patch keeps everything else, conflicts write nothing, creates cannot overwrite, backups are exact)");
