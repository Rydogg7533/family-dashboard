# StewardOS / Family Dashboard: handoff and state of the build (2026-10-21)

Written at the end of a long build session that ran inside the File Organization project by mistake. Everything below is what the StewardOS project must know to continue. Where this file and an older doc disagree, this file wins for anything built after 2026-10-19. Append-only: add new dated sections below, never rewrite old ones.

## 1. Where everything lives
- Live app: https://family-dashboard-dun-nine.vercel.app (login required; two users, Ryan and Melissa).
- Code: github.com/Rydogg7533/family-dashboard, branch main. Clone on the Mac mini: ~/family-dashboard. Latest commit at handoff: aac5add. Push flow: `git pull --rebase` then `git push origin HEAD:main`. Vercel deploys from main.
- Database: Supabase project `family-dashboard`, ref dkscqkoxctukxpeatqiq, us-west-1, 44 public tables, RLS on all (members read through `is_member()`; owners through `is_owner()`).
- Hosting: Vercel project `family-dashboard`, team id team_BcyGosHQxaCiA1LE9Zc1b14v. vercel.json pins functions to sfo1 (next to the database). The Vercel MCP returned 403 on listing deployments, so deployment state can't be read by the assistant; use More › System health, which shows the server region and the running version.
- Stack: Next.js 16 app router (not the Next you know: read node_modules/next/dist/docs/ before writing code, see AGENTS.md), React 19, Tailwind v4. Every data page exports `dynamic = "force-dynamic"`. "use server" files may export only async functions (shared constants live in src/lib/inbox-answers.ts). Conventions: docs/BUILD-CONVENTIONS.md. Requirements: docs/requirements.md (145 KB, the source of truth for features F1 to F25).
- Mac mini agents (launchd, env file ~/_secrets_local_only/family-dashboard.env holding SUPABASE_URL and SUPABASE_SERVICE_KEY; logs in ~/Organized/_Consolidation Records/mirror-logs/):
  - com.ryan.dashboard-report: hourly health post (mini-report.sh). Belongs to the File Organization project; do not break it.
  - com.ryan.location-agent: Overland points to stops to Places to day records.
  - com.ryan.filing-agent (new, every 10 min): copies documents captured in the app to the Mac mini. Installed and running; last status "nothing waiting".
  - com.ryan.contacts-sync (new, every 30 min): iCloud Contacts to `contact_cards` over CardDAV. Installed 2026-10-20; first full sync 2,111 contacts, then 0 updated / 2,111 unchanged.
- Commits end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and a `Claude-Session:` line.
- Environment variables set on Vercel: Supabase URL and anon key, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY. Not set yet: NEXT_PUBLIC_VAPID_PUBLIC_KEY (push).

## 2. What was built since the 2026-10-19 go-live checklist (all pushed)
Migrations are applied live (0007 to 0013). The repo has duplicate file numbers (two 0007, 0008, 0009 from different sessions); they were applied by name, harmless but untidy; renumber when convenient.

1. Capture storage (0007, 0008). Private storage bucket `captures` (50 MB limit; members read and insert). Photo, Upload file and Bulk drop now upload the real file from the browser, hash it (SHA-256), and create an Inbox row with the stored path. A repeated hash is flagged as a possible duplicate and never merged silently. Before this fix the app saved filenames only.
2. Reading step. `callModelVision` in src/lib/ai.ts sends the image or PDF to Claude (job "extract", currently claude-haiku-5-5) and gets back JSON: kind, vendor, amount, date, item, category, vehicle hint, warranty relevance, reimbursement hint, suggested name, confidence. Code: src/app/inbox/read.ts. Results are stored in `inbox_items.read_result`. A paid invoice counts as a receipt. Unreadable files become a plain "What is it?" question.
3. Single document rule. Photo and Upload file = one document, with "Add another page" for multi-page receipts. Bulk drop = many documents. No typed explanation is required.
4. Filing (src/app/inbox/file.ts, `fileCapture`). One tap files a document everywhere it belongs: FILED = the one real file (path Organized/Personal/Documents/Vehicles/<vehicle>/<year>/ or Finance/<year>/<Groceries|Home|Receipts>); LINK lines = Money › Receipts, vehicle service history, warranty list, claim. Both are shown before the tap. Low-confidence reads ask; proposals for claims, warranties and reminders always need a tap. A server-side delegation in `resolveInboxItem` means a filing answer always runs the filing code, and a tap on a document that is still being read waits for the read.
5. Claims (0010, 0011). New `claims` table, a Claims page (status, check-back date, documents, snooze), and "File it and open a reimbursement claim" which creates the claim plus a 4-week check-back task. A receipt filed later for the same vehicle attaches to the open claim; older warranty receipts attach too.
6. Vehicles (0009). `vehicles.details` jsonb plus an add/edit form with about 80 fields in collapsible sections (src/lib/vehicle-fields.ts, VehicleForm, Fold), warranties and a service log. The two vehicles are Ryan's Tahoe 2016 and Melissa's Sienna 2018. Sienna's battery warranty end date is still blank.
7. Filing agent (scripts/filing-agent.mjs, 0012). Copy-only: copies from the app's storage to the Mac mini, verifies SHA-256, never overwrites (adds " (2)"), never deletes, `--dry` flag. The app keeps every file permanently in Supabase storage by Ryan's decision; the Mac mini copy is a backup. Revisit only if storage cost matters (add a Health warning at about 70% of the plan).
8. Hide-until-read. Fresh uploads stay hidden from the Inbox until read (max 3 minutes, then shown regardless) so a half-read item can't be answered.
9. Speed. vercel.json regions ["sfo1"], an instant loading screen, local token check (`getClaims`) instead of an Auth round trip per request (src/proxy.ts, src/lib/supabase/server.ts `getRequestUser`). Health page shows server region and version. Expect region sfo1; if not, flip the Vercel project setting.
10. Contacts (F25 step 1). scripts/contacts-sync.mjs, one-way iCloud to dashboard, deleted cards are marked deleted_at, never removed. Fixed 2026-10-20: the address-book check missed elements carrying namespace attributes. Ryan's line is ICLOUD_CONTACTS_1 in the env file (an app-specific password; changing the Apple ID password revokes it). Melissa's line is not set up. Write-back to iCloud is the next step and not built.
11. Problem reports with screenshots (0013, today). The Report a problem sheet takes up to 3 images (15 MB each); they upload to `captures` under <user id>/issues/, and System health shows "Screenshot 1/2/3" links through /api/issue-shot/<id>/<n> (signed, 5 minutes).
12. Money per-charge Camera and Upload now store the file (proof points to `captures:<path>`) and fail loudly.

## 3. Open problem reports (System health › Your reports)
- 8c329da9: slow tab switching. Fixes shipped (region, loading screen, auth round trip). Left open until Ryan confirms it feels fast and the region reads sfo1.
- 2e9e0468: the bottom tab bar floats up when scrolling (seen on /vehicles). NOT yet looked at. Likely the nav needs position fixed with safe-area padding, or the page's scroll container is wrong on iOS. Next fix.

## 4. Current blocker: the AAA invoice still hasn't been filed
Document: IMG_1499.jpeg, inbox item e483f9d1-bedf-4bf5-b4af-504e2c031b11. AAA California Roadside Service, car battery replacement, $242.88, 2026-10-20, hint Sienna 2018. It is meant to open a reimbursement claim against the old 2025 battery receipt (already filed: Sienna service log and warranty list).
Timeline of failures: first tap resolved through the old plain path (no claim); then the reader returned nothing because max_tokens was 700 and the reply was cut off (fixed in 7fbb3a3: limit 2500, JSON-only prompt). The item was reopened at about 17:00 UTC-7 on 2026-10-20 and may have been answered again since; check its state first.
Verify when Ryan taps "File it and open a reimbursement claim": a row in `claims`; a `tasks` row with check-back about 28 days out; a Sienna service-log entry and warranty note in `vehicles.details`; a `receipts` row (amount 242.88); `inbox_items.filed` populated, `claim_id` set; activity_log `capture_filed`; later `copied_path` filled by the filing agent for both documents. Then attach the 2025 receipt to the claim if it wasn't.
Known race: resetting `read_result` while old `missing`/`options` remain lets an old "Yes, file it" button be tapped; reopen with options cleared.

## 5. Decisions on record (this session)
- Keep every uploaded file permanently in Supabase storage; the Mac mini holds a copy. Change later if Ryan wants to save money.
- High-confidence reads are handled; low confidence asks. Claims, warranties and reminders always need a tap.
- Pending from Ryan: the dollar threshold that always asks first (suggested $100); when to turn on auto-filing for low-stakes receipts (suggested after about a week of watching).
- Photos or screenshots in a problem report are welcome for cosmetic and "blocks me" issues.

## 6. Not built yet / next
Fix 2e9e0468 (tab bar); finish the AAA filing and verify; contacts write-back and Melissa's line; auto-filing rules learning; naming beyond the Inbox title; photos sent through the assistant thread aren't checked; Health storage-usage warning; push notifications (VAPID keys); Gmail and Calendar OAuth on the mini; Overland on Melissa's phone; Tiller; messages mirror; assistant Apple ID; renumber duplicate migrations; leaked-password protection in Supabase Auth; both parents change temporary passwords.

## 7. Seams with the File Organization project
mini-report.sh and com.ryan.dashboard-report (keep working). The filing agent writes into ~/Organized/Personal/Documents/..., which the file project organizes; the file project's "never delete, never overwrite" rules apply to the agents too. Credentials stay in ~/_secrets_local_only. Never run git from the home folder: use `cd ~/family-dashboard`.

## 8. Fixes-log rows to append (stewardos-fixes-log.md, newest last)
| Date | Problem | Cause | Fix | Version |
|---|---|---|---|---|
| 2026-10-20 | Upload saved only file names | No storage bucket, no upload step | Private `captures` bucket, browser upload, hash, row | ebdc9fd |
| 2026-10-20 | Vehicles page broke on real rows | Raw snake_case, null mileage | Mapper in getVehicles, null-safe UI | 458c19b |
| 2026-10-20 | Tapped Yes, nothing filed | Stale client state bypassed filing | Filing delegated on the server for any read document | 7965643 |
| 2026-10-20 | Tap lost while document was being read | Read not finished | Tap waits for the read, then files | b749c24 |
| 2026-10-20 | Re-filed items reappeared after deploy | Unread items shown | Hidden until read (max 3 min) | 83adc54 |
| 2026-10-20 | Slow tab switching | Function region mismatch, no loading screen, extra auth call | sfo1, loading screen, local token check | f0fde0e |
| 2026-10-20 | Contacts sync "no addressbooks found" | Namespaced element not matched | Regex fix, error shows Apple's reply | 116b4de |
| 2026-10-20 | Invoice "nothing readable" | Reader reply cut off at 700 tokens | Limit 2500, JSON-only | 7fbb3a3 |
