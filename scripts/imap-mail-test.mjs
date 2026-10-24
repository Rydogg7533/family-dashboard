// Offline test for the IMAP mail path: provider table, env-file discovery, the "one mailbox, one sync" rule.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const home = mkdtempSync(join(tmpdir(), "imap-test-"));
process.env.HOME = home;
const dir = join(home, "_secrets_local_only", "email-agent"); mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "imap-melissa@gmail.com.env"), "MAIL_PROVIDER=gmail\nMAIL_USER=melissa@gmail.com\nMAIL_APP_PASSWORD=x\nMAIL_PERSON=Melissa\n");
writeFileSync(join(dir, "imap-bad.env"), "");                         // not an address: ignored
writeFileSync(join(dir, "google-ryan@gmail.com.json"), "{}");         // a Gmail API sign-in
writeFileSync(join(dir, "icloud-ryan.env"), "ICLOUD_MAIL_USER=a\n");   // old-style iCloud: not an imap-*.env

const m = await import("./imap-mail-sync.mjs");
assert.equal(m.PROVIDERS.gmail.host, "imap.gmail.com"); assert.equal(m.PROVIDERS.icloud.host, "imap.mail.me.com"); assert.equal(m.PROVIDERS.other.host, null);
assert.deepEqual(m.imapEnvFiles(), ["imap-melissa@gmail.com.env"]);
assert.equal(m.apiTokenExists("ryan@gmail.com"), true); assert.equal(m.apiTokenExists("melissa@gmail.com"), false);
const e = m.readEnv(join(dir, "imap-melissa@gmail.com.env"));
assert.equal(e.MAIL_PROVIDER, "gmail"); assert.equal(e.MAIL_PERSON, "Melissa");
console.log("PASS: imap mail (providers, env discovery, API-token conflict check)");
