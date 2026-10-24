// Pure helpers for Google Contacts (People API). No network, no dependencies.
// Read side: a People API "person" becomes the same card shape iCloud cards use (contact_cards).
// Write side: change only what the person edited. updatePersonFields lists exactly the edited groups, so every other
// field on the contact (addresses, birthday, notes, photo, custom fields, other labels) is never sent and never touched.

import { validate } from "./contacts-write-lib.mjs";

export const PERSON_FIELDS = "names,nicknames,organizations,phoneNumbers,emailAddresses,addresses,birthdays,biographies,metadata";
export const STANDARD_LABELS = ["mobile", "home", "work", "main", "other"];

const WORDS_TO_TYPE = { "work mobile": "workMobile", "home fax": "homeFax", "work fax": "workFax", "other fax": "otherFax", "work pager": "workPager", "google voice": "googleVoice", pager: "pager" };

// Google's phone types are camelCase words ("workMobile"); the app shows them as lowercase words.
export function labelFromType(type, formatted) {
  const t = String(type || "").trim();
  if (t) return t.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const f = String(formatted || "").trim().toLowerCase();
  return f || "other";
}
export function typeFromLabel(label) {
  const l = String(label || "other").toLowerCase().trim() || "other";
  if (l === "cell") return "mobile";
  if (STANDARD_LABELS.includes(l)) return l;
  return WORDS_TO_TYPE[l] || l;       // anything else is saved as Google's custom label
}

const list = (a) => (Array.isArray(a) ? a : []);
const primary = (a) => list(a).find((x) => x?.metadata?.primary) || list(a)[0] || null;
const OUTPUT_ONLY = ["metadata", "displayName", "displayNameLastFirst", "unstructuredName", "formattedType", "canonicalForm", "formattedValue", "formattedName"];
const strip = (o) => { const c = { ...o }; for (const k of OUTPUT_ONLY) delete c[k]; return c; };

function birthdayOf(p) {
  const b = list(p.birthdays).find((x) => x?.date?.month && x?.date?.day)?.date;
  if (!b) return null;
  const mm = String(b.month).padStart(2, "0"), dd = String(b.day).padStart(2, "0");
  return b.year ? `${b.year}-${mm}-${dd}` : `--${mm}-${dd}`;
}

// A People API person → the card fields. uid and href are the resourceName ("people/c123"); etag is the person's etag.
export function personToCard(p) {
  const name = primary(p.names) || {};
  const first = name.givenName || null, last = name.familyName || null;
  const org = primary(p.organizations)?.name || null;
  const phones = list(p.phoneNumbers).filter((x) => String(x?.value || "").trim()).map((x) => {
    const number = String(x.value).trim();
    return { label: labelFromType(x.type, x.formattedType), number, digits: number.replace(/\D/g, "") };
  });
  const emails = list(p.emailAddresses).filter((x) => String(x?.value || "").trim()).map((x) => ({ label: labelFromType(x.type, x.formattedType), address: String(x.value).trim().toLowerCase() }));
  const addresses = list(p.addresses).map((x) => ({ label: labelFromType(x.type, x.formattedType), street: x.streetAddress || "", city: x.city || "", state: x.region || "", zip: x.postalCode || "", country: x.country || "" }));
  const full = name.displayName || [first, last].filter(Boolean).join(" ") || org || "(no name)";
  return {
    uid: p.resourceName, href: p.resourceName, etag: p.etag || null,
    full_name: full, first_name: first, last_name: last,
    nickname: list(p.nicknames)[0]?.value || null, org, phones, emails, addresses,
    birthday: birthdayOf(p), notes: list(p.biographies)[0]?.value || null,
  };
}

// The row written to contact_cards. Every key is always present (PostgREST bulk upserts need uniform keys).
export function cardRow(personId, c, now = new Date().toISOString()) {
  return { person: personId, provider: "google", uid: c.uid, href: c.href, etag: c.etag, full_name: c.full_name, first_name: c.first_name, last_name: c.last_name, nickname: c.nickname, org: c.org, phones: c.phones, emails: c.emails, addresses: c.addresses, birthday: c.birthday, notes: c.notes, synced_at: now, deleted_at: null };
}

// Existing entries are matched by label and value so a type Google already holds ("workMobile") is kept as it was.
function typedList(existing, wanted, isPhone) {
  const have = new Map();
  for (const e of list(existing)) have.set(`${labelFromType(e.type, e.formattedType)}|${String(e.value || "").trim().toLowerCase()}`, e);
  return wanted.map((w) => {
    const value = isPhone ? w.number : w.address;
    const hit = have.get(`${String(w.label || "other").toLowerCase()}|${String(value).trim().toLowerCase()}`);
    return { value, type: hit?.type || typeFromLabel(w.label) };
  });
}

// Apply validated edits to a person. Returns the request: { updatePersonFields, body } (body carries the etag Google checks).
export function buildUpdate(person, fields) {
  const f = validate(fields);
  const groups = []; const body = { etag: person.etag };
  const hasName = "first_name" in f || "last_name" in f;
  const exName = primary(person.names) || {};
  const exOrg = primary(person.organizations) || {};
  if (hasName || "org" in f) {
    const first = "first_name" in f ? f.first_name : exName.givenName || "";
    const last = "last_name" in f ? f.last_name : exName.familyName || "";
    const org = "org" in f ? f.org : exOrg.name || "";
    if (!first && !last && !org) throw new Error("A contact needs a name or a company.");
  }
  if (hasName) {
    groups.push("names");
    const keep = strip(exName); delete keep.givenName; delete keep.familyName;
    const others = list(person.names).filter((n) => n !== primary(person.names)).map(strip);
    body.names = [{ ...keep, givenName: "first_name" in f ? f.first_name : exName.givenName || "", familyName: "last_name" in f ? f.last_name : exName.familyName || "" }, ...others];
  }
  if ("org" in f) {
    groups.push("organizations");
    const others = list(person.organizations).filter((o) => o !== primary(person.organizations)).map(strip);
    const mine = f.org ? [{ ...strip(exOrg), name: f.org }] : [];
    body.organizations = [...mine, ...others];
  }
  if ("phones" in f) { groups.push("phoneNumbers"); body.phoneNumbers = typedList(person.phoneNumbers, f.phones, true); }
  if ("emails" in f) { groups.push("emailAddresses"); body.emailAddresses = typedList(person.emailAddresses, f.emails, false); }
  return { updatePersonFields: groups.join(","), body };
}

// A brand-new contact.
export function buildCreate(fields) {
  const f = validate({ first_name: "", last_name: "", org: "", phones: [], emails: [], ...fields });
  if (!f.first_name && !f.last_name && !f.org) throw new Error("A contact needs a name or a company.");
  const body = {};
  if (f.first_name || f.last_name) body.names = [{ givenName: f.first_name, familyName: f.last_name }];
  if (f.org) body.organizations = [{ name: f.org }];
  if (f.phones.length) body.phoneNumbers = f.phones.map((p) => ({ value: p.number, type: typeFromLabel(p.label) }));
  if (f.emails.length) body.emailAddresses = f.emails.map((e) => ({ value: e.address, type: typeFromLabel(e.label) }));
  return body;
}
