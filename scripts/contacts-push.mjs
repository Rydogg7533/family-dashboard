#!/usr/bin/env node
// Mac mini → Apple Contacts write-back (F25b). Runs every 2 minutes via launchd. Node 20+, no dependencies.
//
// Takes edits the app queued in contact_edits (status 'pending') and applies each to that person's own iCloud address
// book over CardDAV. Safety rules:
//   • Only fields the person edited are changed; every other line of the card is kept as it was.
//   • If the card changed in iCloud since the person opened it (etag differs), nothing is written: status 'conflict'.
//   • The card as it was is copied to ~/Organized/_Contacts/backups/<stamp>/ before any change. Never overwritten.
//   • Never deletes a card. Creates use If-None-Match so an existing card can't be replaced.
//   • After writing, the card is read back from iCloud and the database row is refreshed from what iCloud now holds.
// Flags: --dry (show what would be written, change nothing)

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { davHeaders, findAddressbooks, parseVcard, rest, get, env, SUPABASE_URL, SUPABASE_KEY } from "./contacts-sync.mjs";
import { patchVcard, buildVcard } from "./contacts-write-lib.mjs";

const DRY = process.argv.includes("--dry");
const normEtag = (e) => String(e ?? "").replace(/^W\//, "").replace(/^"|"$/g, "").trim();

// ---------- the only place that touches the network for iCloud ----------
async function davRaw(method, url, user, pass, { headers = {}, body } = {}) {
  for (let hop = 0; hop < 5; hop++) {
    const r = await fetch(url, { method, headers: davHeaders(user, pass, { ...headers }), body, redirect: "manual" });
    if ([301, 302, 307, 308].includes(r.status)) { url = new globalThis.URL(r.headers.get("location"), url).toString(); continue; }
    return { status: r.status, etag: r.headers.get("etag"), text: await r.text(), url };
  }
  throw new Error("too many redirects");
}
export function icloudIo(user, pass) {
  return {
    get: (url) => davRaw("GET", url, user, pass, { headers: { "Content-Type": "text/vcard", Accept: "text/vcard" } }),
    put: (url, body, ifMatch, ifNoneMatch) => davRaw("PUT", url, user, pass, { headers: { "Content-Type": "text/vcard; charset=utf-8", ...(ifMatch ? { "If-Match": ifMatch } : {}), ...(ifNoneMatch ? { "If-None-Match": "*" } : {}) }, body }),
  };
}

// ---------- one edit; io is injected so this can be tested without iCloud ----------
// Returns { status: 'applied'|'conflict'|'error', note, vcard?, etag?, href? }
export async function applyEdit(edit, card, bookUrl, io, backup) {
  try {
    if (edit.op === "create") {
      const uid = randomUUID().toUpperCase();
      const body = buildVcard(uid, edit.fields);
      const url = new globalThis.URL(`${uid}.vcf`, bookUrl.endsWith("/") ? bookUrl : bookUrl + "/").toString();
      if (DRY) return { status: "applied", note: "dry run: would create", vcard: body };
      const put = await io.put(url, body, null, true);
      if (put.status === 412) return { status: "error", note: "iCloud refused: a card with that ID already exists." };
      if (put.status < 200 || put.status >= 300) return { status: "error", note: `iCloud answered ${put.status} to the new contact.` };
      const back = await io.get(url);
      if (back.status !== 200) return { status: "error", note: `Saved, but could not read it back (${back.status}). It will appear at the next 30-minute sync.` };
      return { status: "applied", note: "Created in iCloud.", vcard: back.text, etag: back.etag || put.etag, href: new globalThis.URL(url).pathname };
    }
    // update
    if (!card) return { status: "error", note: "That contact no longer exists in the dashboard." };
    const url = new globalThis.URL(card.href, bookUrl).toString();
    const cur = await io.get(url);
    if (cur.status === 404) return { status: "conflict", note: "This contact was deleted in iCloud. Nothing was written." };
    if (cur.status !== 200) return { status: "error", note: `Could not read the card from iCloud (${cur.status}).` };
    if (edit.base_etag && normEtag(cur.etag) !== normEtag(edit.base_etag)) return { status: "conflict", note: "This contact changed in iCloud after you opened it. Nothing was written; open it again and redo the edit." };
    const next = patchVcard(cur.text, edit.fields);
    if (DRY) return { status: "applied", note: "dry run: would update", vcard: next };
    backup(card.uid, cur.text);
    const put = await io.put(url, next, cur.etag, false);
    if (put.status === 412) return { status: "conflict", note: "This contact changed in iCloud while saving. Nothing was written." };
    if (put.status < 200 || put.status >= 300) return { status: "error", note: `iCloud answered ${put.status}. Nothing was changed.` };
    const back = await io.get(url);
    if (back.status !== 200) return { status: "applied", note: "Saved to iCloud; will refresh at the next 30-minute sync." };
    return { status: "applied", note: "Saved to iCloud.", vcard: back.text, etag: back.etag || put.etag, href: card.href };
  } catch (e) {
    return { status: "error", note: String(e.message || e).slice(0, 300) };
  }
}

// ---------- main ----------
function backupWriter() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(homedir(), "Organized", "_Contacts", "backups", stamp);
  return (uid, text) => {
    mkdirSync(dir, { recursive: true });
    const f = join(dir, `${String(uid).replace(/[^\w.-]/g, "_")}.vcf`);
    if (existsSync(f)) throw new Error("backup already exists: " + f);
    writeFileSync(f, text, { flag: "wx" });
  };
}
const cardRow = (personId, c, href, etag) => ({ person: personId, uid: c.uid, href, etag, full_name: c.full_name, first_name: c.first_name, last_name: c.last_name, nickname: c.nickname, org: c.org, phones: c.phones, emails: c.emails, addresses: c.addresses, birthday: c.birthday, notes: c.notes, synced_at: new Date().toISOString(), deleted_at: null });

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_KEY not set"); process.exit(1); }
  const edits = await get("contact_edits?status=eq.pending&order=created_at.asc&limit=50&select=*");
  const log = []; let state = "ok";
  const configs = Object.entries(env).filter(([k]) => /^ICLOUD_CONTACTS_\d+$/.test(k)).map(([, v]) => { const [name, user, pass] = v.split("|").map((s) => s.trim()); return { name, user, pass }; });
  const books = new Map(); const profiles = new Map(); const backup = backupWriter();
  for (const edit of edits) {
    const finish = async (res, personName) => {
      const patch = { status: res.status, note: res.note, applied_at: res.status === "applied" ? new Date().toISOString() : null };
      if (!DRY) await rest("PATCH", `contact_edits?id=eq.${edit.id}&status=eq.pending`, patch, { Prefer: "return=minimal" });
      if (!DRY) await rest("POST", "activity_log", [{ actor: "Contacts sync", action: `contact_${edit.op}_${res.status}`, subject: `${personName || "A contact"}: ${edit.summary || edit.op} — ${res.note}`, ref: edit.card_id, undoable: false }], { Prefer: "return=minimal" }).catch(() => {});
      log.push(`${edit.op} ${res.status}${res.status === "applied" ? "" : " (" + res.note + ")"}`);
      if (res.status === "error") state = "error";
    };
    try {
      if (!profiles.has(edit.person)) profiles.set(edit.person, (await get(`profiles?id=eq.${edit.person}&select=id,display_name`))[0]);
      const prof = profiles.get(edit.person);
      const cfg = configs.find((c) => c.name.toLowerCase() === String(prof?.display_name || "").toLowerCase());
      if (!cfg) { await finish({ status: "error", note: `No iCloud link set up for ${prof?.display_name || "this person"} on the Mac mini.` }, prof?.display_name); continue; }
      if (!books.has(cfg.name)) books.set(cfg.name, (await findAddressbooks(cfg.user, cfg.pass))[0]);
      const book = books.get(cfg.name);
      const card = edit.card_id ? (await get(`contact_cards?id=eq.${edit.card_id}&person=eq.${edit.person}&select=id,uid,href,etag`))[0] : null;
      const res = await applyEdit(edit, card, book.url, icloudIo(cfg.user, cfg.pass), backup);
      if (DRY) { console.log(`--- ${edit.op} ${edit.summary || ""}\n${res.status}: ${res.note}\n${res.vcard || ""}`); continue; }
      if (res.status === "applied" && res.vcard) {
        const c = parseVcard(res.vcard); if (!c.uid) c.uid = card?.uid;
        if (edit.op === "update") await rest("PATCH", `contact_cards?id=eq.${edit.card_id}`, { ...cardRow(edit.person, c, res.href, res.etag ? res.etag : null), uid: undefined }, { Prefer: "return=minimal" });
        else await rest("POST", "contact_cards?on_conflict=person,uid", [cardRow(edit.person, c, res.href, res.etag || null)], { Prefer: "resolution=merge-duplicates,return=minimal" });
      }
      await finish(res, prof?.display_name);
    } catch (e) { await finish({ status: "error", note: String(e.message || e).slice(0, 300) }); }
  }
  const summary = edits.length ? log.join("; ") : "nothing waiting";
  if (!DRY) await rest("POST", "system_status?on_conflict=key", [{ key: "sync_contacts_push", state, summary: `Contact edits: ${summary}`, value_num: null, updated_at: new Date().toISOString() }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
  console.log(`${new Date().toISOString()} ${summary}`);
  if (state === "error") process.exit(1);
}
if (process.argv[1] && process.argv[1].endsWith("contacts-push.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
