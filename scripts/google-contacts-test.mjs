// Offline test for Google Contacts: mapping in, patching out, conflicts write nothing, pulls page correctly.
import assert from "node:assert/strict";
import { personToCard, cardRow, buildUpdate, buildCreate, labelFromType, typeFromLabel } from "./google-contacts-lib.mjs";
import { applyEdit } from "./google-contacts-push.mjs";
import { pullConnections } from "./google-contacts-sync.mjs";

const person = {
  resourceName: "people/c111", etag: "etag-1",
  names: [{ metadata: { primary: true }, displayName: "Dr. Jane Q Doe", givenName: "Jane", familyName: "Doe", middleName: "Q", honorificPrefix: "Dr.", unstructuredName: "Dr. Jane Q Doe" }],
  nicknames: [{ value: "JD" }],
  organizations: [{ metadata: { primary: true }, name: "Acme Inc", title: "CTO" }],
  phoneNumbers: [{ value: "(801) 555-0100", type: "mobile", formattedType: "Mobile", canonicalForm: "+18015550100" }, { value: "(801) 555-0199", type: "workMobile", formattedType: "Work mobile" }, { value: "(801) 555-0123" }],
  emailAddresses: [{ value: "Jane@Example.com", type: "home" }],
  addresses: [{ type: "home", streetAddress: "1 Main St", city: "Orem", region: "UT", postalCode: "84057", country: "USA" }],
  birthdays: [{ date: { year: 1980, month: 2, day: 3 } }], biographies: [{ value: "Line one\nline two" }],
};

// 1. mapping in
const c = personToCard(person);
assert.equal(c.uid, "people/c111"); assert.equal(c.etag, "etag-1"); assert.equal(c.full_name, "Dr. Jane Q Doe");
assert.equal(c.first_name, "Jane"); assert.equal(c.last_name, "Doe"); assert.equal(c.org, "Acme Inc"); assert.equal(c.nickname, "JD");
assert.deepEqual(c.phones.map((p) => [p.label, p.number, p.digits]), [["mobile", "(801) 555-0100", "8015550100"], ["work mobile", "(801) 555-0199", "8015550199"], ["other", "(801) 555-0123", "8015550123"]]);
assert.deepEqual(c.emails, [{ label: "home", address: "jane@example.com" }]);
assert.equal(c.addresses[0].city, "Orem"); assert.equal(c.birthday, "1980-02-03"); assert.equal(c.notes, "Line one\nline two");
assert.equal(personToCard({ resourceName: "people/c2", birthdays: [{ date: { month: 12, day: 25 } }], organizations: [{ name: "Solo LLC" }] }).birthday, "--12-25");
assert.equal(personToCard({ resourceName: "people/c3" }).full_name, "(no name)");
const row = cardRow("p1", c, "2026-01-01T00:00:00Z"); assert.equal(row.provider, "google"); assert.equal(row.deleted_at, null);
assert.deepEqual(Object.keys(row).sort(), Object.keys(cardRow("p2", personToCard({ resourceName: "people/x" }), "t")).sort(), "uniform keys for bulk upsert");

// 2. labels
for (const t of ["mobile", "home", "work", "main", "other"]) assert.equal(typeFromLabel(labelFromType(t)), t);
assert.equal(labelFromType("workMobile"), "work mobile"); assert.equal(typeFromLabel("work mobile"), "workMobile"); assert.equal(typeFromLabel("School"), "school"); assert.equal(typeFromLabel("cell"), "mobile");

// 3. phone edit: only phoneNumbers is sent, existing special types survive, etag carried
const u = buildUpdate(person, { phones: [{ label: "mobile", number: "(801) 555-0111" }, { label: "work mobile", number: "(801) 555-0199" }] });
assert.equal(u.updatePersonFields, "phoneNumbers"); assert.equal(u.body.etag, "etag-1");
assert.deepEqual(Object.keys(u.body).sort(), ["etag", "phoneNumbers"]);
assert.deepEqual(u.body.phoneNumbers, [{ value: "(801) 555-0111", type: "mobile" }, { value: "(801) 555-0199", type: "workMobile" }]);

// 4. rename keeps middle name and prefix, drops output-only fields
const r = buildUpdate(person, { first_name: "Janet" });
assert.equal(r.updatePersonFields, "names");
assert.deepEqual(r.body.names, [{ givenName: "Janet", familyName: "Doe", middleName: "Q", honorificPrefix: "Dr." }]);

// 5. company: change, clear (title kept when changed), and the name rule
assert.deepEqual(buildUpdate(person, { org: "Beta Co" }).body.organizations, [{ name: "Beta Co", title: "CTO" }]);
assert.deepEqual(buildUpdate(person, { org: "" }).body.organizations, []);
assert.throws(() => buildUpdate({ etag: "e", organizations: [{ name: "Acme" }] }, { org: "" }), /name or a company/);
assert.throws(() => buildUpdate(person, { phones: [{ label: "mobile", number: "abc" }] }), /phone number/);

// 6. create
assert.deepEqual(buildCreate({ first_name: "Sam", last_name: "Lee", phones: [{ label: "mobile", number: "801-555-0100" }], emails: [{ label: "work", address: "SAM@x.com" }] }),
  { names: [{ givenName: "Sam", familyName: "Lee" }], phoneNumbers: [{ value: "801-555-0100", type: "mobile" }], emailAddresses: [{ value: "sam@x.com", type: "work" }] });
assert.throws(() => buildCreate({ phones: [] }), /name or a company/);

// 7. applyEdit with a fake Google
const card = { id: "card-1", uid: "people/c111", href: "people/c111", etag: "etag-1" };
const fake = (over = {}) => { const calls = []; return { calls, io: { get: async (rn) => { calls.push(["get", rn]); if (over.get) return over.get(); return structuredClone(person); }, patch: async (rn, body, f) => { calls.push(["patch", rn, f]); if (over.patch) return over.patch(); return { ...person, etag: "etag-2", phoneNumbers: body.phoneNumbers }; }, del: async (rn) => { calls.push(["del", rn]); if (over.del) return over.del(); return {}; }, post: async (body) => { calls.push(["post"]); return { resourceName: "people/c999", etag: "e9", names: body.names }; } } }; };
const backups = []; const backup = (uid, text) => backups.push([uid, JSON.parse(text).resourceName]);
const edit = { op: "update", base_etag: "etag-1", fields: { phones: [{ label: "mobile", number: "(801) 555-0111" }] } };
let f = fake(); let res = await applyEdit(edit, card, f.io, backup);
assert.equal(res.status, "applied"); assert.equal(res.person.etag, "etag-2"); assert.deepEqual(backups, [["people/c111", "people/c111"]], "backed up before the change");
assert.deepEqual(f.calls.map((x) => x[0]), ["get", "patch"]);
f = fake(); res = await applyEdit({ ...edit, base_etag: "old" }, card, f.io, backup);
assert.equal(res.status, "conflict"); assert.deepEqual(f.calls.map((x) => x[0]), ["get"], "stale etag: nothing written"); assert.equal(backups.length, 1, "no backup when nothing is written");
f = fake({ get: async () => { throw Object.assign(new Error("gone"), { status: 404 }); } }); res = await applyEdit(edit, card, f.io, backup);
assert.equal(res.status, "conflict"); assert.match(res.note, /deleted/);
f = fake({ patch: async () => { throw Object.assign(new Error("etag"), { status: 400, googleStatus: "FAILED_PRECONDITION" }); } }); res = await applyEdit(edit, card, f.io, backup);
assert.equal(res.status, "conflict"); assert.match(res.note, /while saving/);
f = fake({ patch: async () => { throw Object.assign(new Error("boom"), { status: 500 }); } }); res = await applyEdit(edit, card, f.io, backup);
assert.equal(res.status, "error");
res = await applyEdit(edit, null, fake().io, backup); assert.equal(res.status, "error");
const before = backups.length;
f = fake(); res = await applyEdit({ op: "create", fields: { first_name: "Sam", last_name: "Lee" } }, null, f.io, backup);
assert.equal(res.status, "applied"); assert.equal(res.person.resourceName, "people/c999"); assert.equal(backups.length, before, "creates need no backup");

// 7b. delete: etag checked, backed up before the delete, already-gone is fine, stale etag deletes nothing
const delEdit = { op: "delete", base_etag: "etag-1", fields: {} };
let nb = backups.length; f = fake(); res = await applyEdit(delEdit, card, f.io, backup);
assert.equal(res.status, "applied"); assert.equal(res.deleted, true); assert.deepEqual(f.calls.map((x) => x[0]), ["get", "del"]); assert.equal(f.calls[1][1], "people/c111");
assert.equal(backups.length, nb + 1, "backed up before the delete");
nb = backups.length; f = fake(); res = await applyEdit({ ...delEdit, base_etag: "old" }, card, f.io, backup);
assert.equal(res.status, "conflict"); assert.deepEqual(f.calls.map((x) => x[0]), ["get"], "stale etag: nothing deleted"); assert.equal(backups.length, nb);
f = fake({ get: async () => { throw Object.assign(new Error("gone"), { status: 404 }); } }); res = await applyEdit(delEdit, card, f.io, backup);
assert.equal(res.status, "applied"); assert.match(res.note, /Already/); assert.deepEqual(f.calls.map((x) => x[0]), ["get"]);
f = fake({ del: async () => { throw Object.assign(new Error("boom"), { status: 500 }); } }); res = await applyEdit(delEdit, card, f.io, backup);
assert.equal(res.status, "error");
res = await applyEdit(delEdit, null, fake().io, backup); assert.equal(res.status, "error");

res = await applyEdit({ op: "merge", fields: {} }, card, fake().io, backup); assert.equal(res.status, "error"); assert.match(res.note, /Unknown edit type/);

// 8. pulls: pages are joined, the sync token comes from the last page, a token is passed on the next call
const urls = [];
const api = async (path) => { urls.push(path); const q = new URL("http://x" + path).searchParams; if (!q.get("pageToken")) return { connections: [{ resourceName: "people/a" }], nextPageToken: "t2" }; return { connections: [{ resourceName: "people/b" }], nextSyncToken: "SYNC1" }; };
const pulled = await pullConnections(api, "OLD");
assert.deepEqual(pulled.people.map((p) => p.resourceName), ["people/a", "people/b"]); assert.equal(pulled.nextSyncToken, "SYNC1");
assert.ok(urls.every((u) => u.includes("syncToken=OLD") && u.includes("READ_SOURCE_TYPE_CONTACT") && u.includes("requestSyncToken=true")));
assert.ok(urls[1].includes("pageToken=t2"));
console.log("PASS: google contacts (mapping, minimal patches, conflicts write nothing, paging)");
