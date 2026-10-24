#!/usr/bin/env node
// Mac mini → Google Contacts write-back (F25c, write side). Runs every 2 minutes via launchd. Node 20+, no dependencies.
//
// Takes edits the app queued in contact_edits (status 'pending', provider 'google') and applies each to that person's own
// Google Contacts through the People API. Same safety rules as the iCloud version:
//   • Only fields the person edited are sent (updatePersonFields); everything else on the contact is never touched.
//   • If the contact changed in Google since the person opened it (etag differs, or Google refuses the etag), nothing is
//     written: status 'conflict'.
//   • The contact as it was is saved to ~/Organized/_Contacts/backups/<stamp>/ before any change. Never overwritten.
//   • Deletes a contact only when its owner asked in the app (op "delete"): etag checked, full copy saved first; the card is hidden (deleted_at), never erased.
//   • After writing, the contact is read back from Google and the database row is refreshed from what Google now holds.
// Flags: --dry (show what would be sent, change nothing)

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { openPeople, rest, get, SUPABASE_URL, SUPABASE_KEY, secretsDir } from "./google-contacts-sync.mjs";
import { PERSON_FIELDS, personToCard, cardRow, buildUpdate, buildCreate } from "./google-contacts-lib.mjs";

const DRY = process.argv.includes("--dry");
const normEtag = (e) => String(e ?? "").replace(/^W\//, "").replace(/^"|"$/g, "").trim();

// The only place that touches the network for Google. `api` is the openPeople() caller.
export function peopleIo(api) {
  return {
    get: (rn) => api(`/v1/${rn}?personFields=${PERSON_FIELDS}`),
    patch: (rn, body, fields) => api(`/v1/${rn}:updateContact?updatePersonFields=${fields}&personFields=${PERSON_FIELDS}`, { method: "PATCH", body }),
    post: (body) => api(`/v1/people:createContact?personFields=${PERSON_FIELDS}`, { method: "POST", body }),
    del: (rn) => api(`/v1/${rn}:deleteContact`, { method: "DELETE" }),
  };
}
const isPrecondition = (e) => e?.status === 400 && /FAILED_PRECONDITION/i.test(`${e.googleStatus || ""} ${e.message}`);

// One edit; io is injected so this can be tested without Google. Returns { status: 'applied'|'conflict'|'error', note, person? }
export async function applyEdit(edit, card, io, backup) {
  try {
    if (!["create", "update", "delete"].includes(edit.op)) return { status: "error", note: `Unknown edit type "${edit.op}"; nothing was changed.` };   // an old script must never treat a newer edit type as an update
    if (edit.op === "create") {
      const body = buildCreate(edit.fields);
      if (DRY) return { status: "applied", note: "dry run: would create", request: body };
      const made = await io.post(body);
      return { status: "applied", note: "Created in Google Contacts.", person: made };
    }
    if (!card) return { status: "error", note: "That contact no longer exists in the dashboard." };
    if (edit.op === "delete") {
      let cur;
      try { cur = await io.get(card.href); }
      catch (e) { if (e.status === 404) return { status: "applied", note: "Already deleted in Google Contacts.", deleted: true }; throw e; }
      if (edit.base_etag && normEtag(cur.etag) !== normEtag(edit.base_etag)) return { status: "conflict", note: "This contact changed in Google Contacts after you asked to delete it. Nothing was deleted; open it again if you still want it gone." };
      if (DRY) return { status: "applied", note: "dry run: would delete" };
      backup(card.uid, JSON.stringify(cur, null, 2));
      await io.del(card.href);
      return { status: "applied", note: "Deleted from Google Contacts. A full copy was saved on the Mac mini first.", deleted: true };
    }
    let cur;
    try { cur = await io.get(card.href); }
    catch (e) { if (e.status === 404) return { status: "conflict", note: "This contact was deleted in Google Contacts. Nothing was written." }; throw e; }
    if (edit.base_etag && normEtag(cur.etag) !== normEtag(edit.base_etag)) return { status: "conflict", note: "This contact changed in Google Contacts after you opened it. Nothing was written; open it again and redo the edit." };
    const req = buildUpdate(cur, edit.fields);
    if (DRY) return { status: "applied", note: "dry run: would update", request: req };
    backup(card.uid, JSON.stringify(cur, null, 2));
    let done;
    try { done = await io.patch(card.href, req.body, req.updatePersonFields); }
    catch (e) { if (isPrecondition(e)) return { status: "conflict", note: "This contact changed in Google Contacts while saving. Nothing was written." }; throw e; }
    return { status: "applied", note: "Saved to Google Contacts.", person: done };
  } catch (e) {
    return { status: "error", note: String(e.message || e).slice(0, 300) };
  }
}

function backupWriter() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(homedir(), "Organized", "_Contacts", "backups", stamp);
  return (uid, text) => {
    mkdirSync(dir, { recursive: true });
    const f = join(dir, `google-${String(uid).replace(/[^\w.-]/g, "_")}.json`);
    if (existsSync(f)) throw new Error("backup already exists: " + f);
    writeFileSync(f, text, { flag: "wx" });
  };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("SUPABASE_URL / SUPABASE_SERVICE_KEY not set"); process.exit(1); }
  const edits = await get("contact_edits?status=eq.pending&provider=eq.google&order=created_at.asc&limit=50&select=*");
  const log = []; let state = "ok";
  const conns = new Map(); const profiles = new Map(); const backup = backupWriter(); const sessions = new Map();
  for (const edit of edits) {
    let who = "A contact";
    const finish = async (res) => {
      const patch = { status: res.status, note: res.note, applied_at: res.status === "applied" ? new Date().toISOString() : null };
      if (!DRY) await rest("PATCH", `contact_edits?id=eq.${edit.id}&status=eq.pending`, patch, { Prefer: "return=minimal" });
      if (!DRY) await rest("POST", "activity_log", [{ actor: "Contacts sync", action: `contact_${edit.op}_${res.status}`, subject: `${who}: ${edit.summary || edit.op} — ${res.note}`, ref: edit.card_id, undoable: false }], { Prefer: "return=minimal" }).catch(() => {});
      log.push(`${edit.op} ${res.status}${res.status === "applied" ? "" : " (" + res.note + ")"}`);
      if (res.status === "error") state = "error";
    };
    try {
      if (!profiles.has(edit.person)) profiles.set(edit.person, (await get(`profiles?id=eq.${edit.person}&select=id,display_name`))[0]);
      who = profiles.get(edit.person)?.display_name || who;
      if (!conns.has(edit.person)) conns.set(edit.person, (await get(`person_connections?person=eq.${edit.person}&kind=eq.contacts&select=provider,account`))[0]);
      const conn = conns.get(edit.person);
      if (conn?.provider !== "google" || !conn.account) { await finish({ status: "error", note: `${who}'s contacts are not set to Google.` }); continue; }
      if (!existsSync(join(secretsDir, "email-agent", `google-${conn.account}.contacts.json`))) { await finish({ status: "error", note: `No Google contacts sign-in for ${who} on the Mac mini yet.` }); continue; }
      if (!sessions.has(edit.person)) sessions.set(edit.person, openPeople(conn.account).api);
      const io = peopleIo(sessions.get(edit.person));
      const card = edit.card_id ? (await get(`contact_cards?id=eq.${edit.card_id}&person=eq.${edit.person}&provider=eq.google&select=id,uid,href,etag`))[0] : null;
      const res = await applyEdit(edit, card, io, backup);
      if (DRY) { console.log(`--- ${edit.op} ${edit.summary || ""}\n${res.status}: ${res.note}\n${res.request ? JSON.stringify(res.request, null, 2) : ""}`); continue; }
      if (res.status === "applied" && res.deleted && edit.card_id) await rest("PATCH", `contact_cards?id=eq.${edit.card_id}`, { deleted_at: new Date().toISOString() }, { Prefer: "return=minimal" });   // hidden, never erased
      if (res.status === "applied" && res.person?.resourceName) {
        const c = personToCard(res.person);
        await rest("POST", "contact_cards?on_conflict=person,uid", [cardRow(edit.person, c)], { Prefer: "resolution=merge-duplicates,return=minimal" });
      }
      await finish(res);
    } catch (e) { await finish({ status: "error", note: String(e.message || e).slice(0, 300) }); }
  }
  const summary = edits.length ? log.join("; ") : "nothing waiting";
  if (!DRY) await rest("POST", "system_status?on_conflict=key", [{ key: "sync_google_contacts_push", state, summary: `Google contact edits: ${summary}`, value_num: null, updated_at: new Date().toISOString() }], { Prefer: "resolution=merge-duplicates,return=minimal" }).catch(() => {});
  console.log(`${new Date().toISOString()}${DRY ? " [dry]" : ""} ${summary}`);
  if (state === "error") process.exit(1);
}
if (process.argv[1] && process.argv[1].endsWith("google-contacts-push.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
