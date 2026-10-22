// Pure helpers for writing a contact back to iCloud (vCard 3.0). No network, no dependencies.
// Rule: change only what the person edited. Every other line of an existing card (photo, address, birthday, notes,
// custom fields, Apple's X- lines) is kept byte for byte.

export const STANDARD_LABELS = ["mobile", "home", "work", "main", "other"];
const TYPE_FOR = { mobile: "CELL", home: "HOME", work: "WORK", main: "MAIN", other: "OTHER" };

export function normalizeLabel(l) {
  const s = String(l || "other").toLowerCase().trim();
  if (s === "cell" || s === "iphone") return s === "iphone" ? "iphone" : "mobile";
  return s || "other";
}

const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const clean = (s) => String(s ?? "").replace(/[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/\s+/g, " ").trim();

// Group lines into logical lines (a folded line stays with its parent, so untouched lines are preserved exactly).
export function logicalLines(text) {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (const l of raw) {
    if (/^[ \t]/.test(l) && out.length) out[out.length - 1] += "\n" + l;
    else if (l !== "") out.push(l);
  }
  return out;
}
const unfoldLine = (l) => l.replace(/\n[ \t]/g, "");
const propOf = (l) => { const u = unfoldLine(l); const i = u.indexOf(":"); if (i < 0) return { group: null, prop: "", rest: u }; let left = u.slice(0, i); let group = null; const g = left.match(/^([^.;]+)\.(.+)$/); if (g) { group = g[1]; left = g[2]; } return { group, prop: left.split(";")[0].toUpperCase(), rest: u }; };

// vCard lines are limited to 75 octets; fold longer ones with CRLF + space.
export function fold(line) {
  const bytes = Buffer.from(line, "utf8"); if (bytes.length <= 75) return line;
  const parts = []; let cur = ""; let n = 0;
  for (const ch of line) { const b = Buffer.byteLength(ch, "utf8"); if (n + b > (parts.length ? 74 : 75)) { parts.push(cur); cur = ""; n = 0; } cur += ch; n += b; }
  if (cur) parts.push(cur);
  return parts.join("\r\n ");
}

export function validate(f) {
  const out = {};
  if ("first_name" in f) out.first_name = clean(f.first_name).slice(0, 80);
  if ("last_name" in f) out.last_name = clean(f.last_name).slice(0, 80);
  if ("org" in f) out.org = clean(f.org).slice(0, 120);
  if ("phones" in f) {
    if (!Array.isArray(f.phones) || f.phones.length > 12) throw new Error("Too many phone numbers.");
    out.phones = f.phones.map((p) => ({ label: clean(p.label).toLowerCase().slice(0, 30) || "other", number: clean(p.number).slice(0, 40) })).filter((p) => p.number);
    for (const p of out.phones) if (!/^[+(\d][\d\s().\-+x#*]*$/i.test(p.number) || p.number.replace(/\D/g, "").length < 3) throw new Error(`"${p.number}" doesn't look like a phone number.`);
  }
  if ("emails" in f) {
    if (!Array.isArray(f.emails) || f.emails.length > 12) throw new Error("Too many email addresses.");
    out.emails = f.emails.map((e) => ({ label: clean(e.label).toLowerCase().slice(0, 30) || "other", address: clean(e.address).toLowerCase().slice(0, 200) })).filter((e) => e.address);
    for (const e of out.emails) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.address)) throw new Error(`"${e.address}" doesn't look like an email address.`);
  }
  return out;
}

let itemCounter = 0;
function typedLines(prop, value, label, nextGroup, extra = "") {
  const lab = normalizeLabel(label);
  if (STANDARD_LABELS.includes(lab)) return [`${prop};type=${TYPE_FOR[lab]}${extra}:${value}`];
  const g = `item${nextGroup()}`;
  return [`${g}.${prop}${extra}:${value}`, `${g}.X-ABLabel:${esc(lab)}`];
}
const telLines = (p, ng) => typedLines("TEL", clean(p.number), p.label, ng, p.label === "mobile" || normalizeLabel(p.label) === "mobile" ? ";type=VOICE" : ";type=VOICE");
const mailLines = (e, ng) => typedLines("EMAIL", e.address, e.label, ng, ";type=INTERNET");

function nameLines(first, last, org, mid = { prefix: "", middle: "", suffix: "" }) {
  const fn = [mid.prefix, first, mid.middle, last, mid.suffix].filter(Boolean).join(" ") || org || "";
  return { n: `N:${esc(last)};${esc(first)};${esc(mid.middle)};${esc(mid.prefix)};${esc(mid.suffix)}`, fn: `FN:${esc(fn)}`, fnText: fn };
}

// Apply validated changes to an existing vCard text. Returns the new vCard (CRLF).
export function patchVcard(vcard, fields) {
  const f = validate(fields);
  let lines = logicalLines(vcard);
  const used = new Set(); for (const l of lines) { const m = unfoldLine(l).match(/^item(\d+)\./i); if (m) used.add(+m[1]); }
  let next = 0; const ng = () => { do next++; while (used.has(next)); used.add(next); return next; };

  // current N pieces
  const nLine = lines.find((l) => propOf(l).prop === "N"); let nParts = ["", "", "", "", ""];
  if (nLine) { const v = unfoldLine(nLine).slice(unfoldLine(nLine).indexOf(":") + 1); nParts = v.split(";").concat(["", "", "", "", ""]).slice(0, 5).map((x) => x.replace(/\\(.)/g, "$1")); }
  const hasName = "first_name" in f || "last_name" in f;
  const dropProps = new Set();
  const dropGroupsFor = new Set();
  if (hasName) { dropProps.add("N"); dropProps.add("FN"); }
  if ("org" in f) dropProps.add("ORG");
  if ("phones" in f) dropProps.add("TEL");
  if ("emails" in f) dropProps.add("EMAIL");
  // lines to remove: the properties, plus the X-ABLabel line of any removed grouped property
  for (const l of lines) { const p = propOf(l); if (dropProps.has(p.prop) && p.group) dropGroupsFor.add(p.group.toLowerCase()); }
  lines = lines.filter((l) => {
    const p = propOf(l);
    if (dropProps.has(p.prop)) return false;
    if (p.group && dropGroupsFor.has(p.group.toLowerCase()) && /^X-AB(LABEL|ADR)$/i.test(p.prop)) return false;
    return true;
  });
  const add = [];
  if (hasName) {
    const first = "first_name" in f ? f.first_name : (nParts[1] || ""); const last = "last_name" in f ? f.last_name : (nParts[0] || "");
    const org = "org" in f ? f.org : ((lines.find((l) => propOf(l).prop === "ORG") || "").split(":")[1] || "");
    if (!first && !last && !org) throw new Error("A contact needs a name or a company.");
    const nl = nameLines(first, last, org, { prefix: nParts[3] || "", middle: nParts[2] || "", suffix: nParts[4] || "" });
    add.push(nl.n, nl.fn);
  }
  if ("org" in f && f.org) add.push(`ORG:${esc(f.org)};`);
  if ("phones" in f) for (const p of f.phones) add.push(...telLines(p, ng));
  if ("emails" in f) for (const e of f.emails) add.push(...mailLines(e, ng));
  // insert before END:VCARD
  const endIdx = lines.findIndex((l) => /^END:VCARD/i.test(l));
  if (endIdx < 0) throw new Error("Not a complete vCard.");
  lines.splice(endIdx, 0, ...add);
  // refresh REV
  const rev = `REV:${new Date().toISOString().replace(/[-:]|\.\d+/g, "")}`;
  const ri = lines.findIndex((l) => propOf(l).prop === "REV"); if (ri >= 0) lines[ri] = rev; else lines.splice(lines.findIndex((l) => /^END:VCARD/i.test(l)), 0, rev);
  return lines.map((l) => l.includes("\n") ? l.replace(/\n/g, "\r\n") : fold(l)).join("\r\n") + "\r\n";
}

// A brand-new card.
export function buildVcard(uid, fields) {
  const f = validate({ first_name: "", last_name: "", org: "", phones: [], emails: [], ...fields });
  if (!f.first_name && !f.last_name && !f.org) throw new Error("A contact needs a name or a company.");
  let next = 0; const ng = () => ++next;
  const nl = nameLines(f.first_name, f.last_name, f.org);
  const lines = ["BEGIN:VCARD", "VERSION:3.0", "PRODID:-//StewardOS//Contacts//EN", `UID:${uid}`, nl.n, nl.fn];
  if (f.org) lines.push(`ORG:${esc(f.org)};`);
  for (const p of f.phones) lines.push(...telLines(p, ng));
  for (const e of f.emails) lines.push(...mailLines(e, ng));
  lines.push(`REV:${new Date().toISOString().replace(/[-:]|\.\d+/g, "")}`, "END:VCARD");
  return lines.map(fold).join("\r\n") + "\r\n";
}
