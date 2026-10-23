# StewardOS / Family Dashboard: handoff and state of the build (updated 2026-10-22)

Written at the end of a long build session that ran inside the File Organization project by mistake. Everything below is what the StewardOS project must know to continue. Where this file and an older doc disagree, this file wins for anything built after 2026-10-19. Append-only: add new dated sections below, never rewrite old ones.

## 1. Where everything lives
- Live app: https://family-dashboard-dun-nine.vercel.app (login required; two users, Ryan and Melissa).
- Code: github.com/Rydogg7533/family-dashboard, branch main. Clone on the Mac mini: ~/family-dashboard. Latest commit at this update: 5467575 (check `git log` for newer; other sessions have also added Mail, Email subscriptions, contact edits, and a set-issue-status function). Push flow: `git pull --rebase` then `git push origin HEAD:main`. Vercel deploys from main.
- Database: Supabase project `family-dashboard`, ref dkscqkoxctukxpeatqiq, us-west-1, 52 public tables, RLS on all (members read through `is_member()`; owners through `is_owner()`).
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

## 3. Open problem reports (SUPERSEDED: see section 9; both listed reports are now fixed) (System health › Your reports)
- 8c329da9: slow tab switching. Fixes shipped (region, loading screen, auth round trip). Left open until Ryan confirms it feels fast and the region reads sfo1.
- 2e9e0468: the bottom tab bar floats up when scrolling (seen on /vehicles). NOT yet looked at. Likely the nav needs position fixed with safe-area padding, or the page's scroll container is wrong on iOS. Next fix.

## 4. The AAA invoice (RESOLVED 2026-10-22: see section 9; kept for the history)
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

## 9. Update 2026-10-22 (everything below is built, pushed to main, and was tested by Ryan unless stated)

### Resolved from the earlier list
- AAA $242.88 invoice: filed (receipt, Sienna service history and warranty list). The first filing tap used "Yes, file it", not the claim button, so no claim existed. A claim was created by hand: claim 12c70e7d-df1e-438c-a007-71215e5704b8 (open, expected $242.88, check-back 2026-11-20) with two documents (the 2025-03-25 warranty battery receipt as "original purchase", today's invoice as "current receipt"), and a reminder task. Both inbox items link to the claim. The app's own "File it and open a reimbursement claim" path (claim plus reminder from one tap) has NOT been confirmed end to end in production; verify on the next battery or warranty receipt.
- Reader truncation: the Inbox reader's reply was cut off at 700 tokens, so large invoices showed "nothing readable". Limit raised to 2500 and the prompt asks for JSON only (commit 7fbb3a3).
- Problem reports 8c329da9 (slow tab switching), 2e9e0468 (bottom bar floating on scroll) and two Contacts scrubber reports were marked Fixed by another session. One report is still open: "In System Health, the fixed expandable window is slightly covered at the bottom". Reports can now carry up to 3 screenshots (migration 0013).
- Contacts: launchd job com.ryan.contacts-sync installed and running every 30 minutes (2,111 contacts). Fix 116b4de matched the address book element when it carries namespace attributes. Melissa's iCloud line is not set up; write-back to iCloud is not built.

### Filing folders (src/app/inbox/read.ts, src/lib/filing-folders.ts)
- The structure has NO Groceries folder (the first version invented one; a restaurant receipt was proposed under Groceries). Rules now: vehicle documents go to Personal/Documents/Vehicles/<short>/<year>/; home category to Personal/Documents/Home/<year>/; restaurants and takeout (new category "dining") to Personal/Documents/Finance/<year>/Dining/; everything else to Finance/<year>/Receipts/.
- Allowed folders list (filingFolders): Finance/<year>/{Receipts,Dining,Statements,Bills}, Home/<year>, Legal, Investments/Et Al, Family, Health/<year>, each vehicle, and each business's 01_Admin/<year>. Anything outside it is refused.
- Inbox card control "Wrong folder? Ask or change it": (a) "Check this folder for me" (one tap: the model compares the document with the list, answers or moves it), (b) ask in words ("is this right?", "put it under Home"), (c) a dropdown of allowed folders. Nothing is filed until the Yes tap; each change is logged (filing_folder_changed). Code: changeFiling, getFolderChoices in src/app/inbox/actions.ts.
- Filing rules (migration 0014, table filing_rules): after a correction a button "Always file this vendor here" saves vendor_key to folder_template with {year}. Vendor keys strip store numbers ("Panda Express #0539" = "panda express"). Applied when a document is read; the card says "(your rule for X)". Vehicle documents never get vendor rules. Review and remove under Settings › Filing rules. A rule decides the folder only; a tap is still required. Zero rules exist so far.
- Not built: "Report this" button inside the folder panel (prefilled report with item id, proposed and chosen folder, category, version, no vendor or amount); a daily scheduled check of open reports.

### Warranties (migrations 0015, 0016; page /warranties, More › Reference)
- One list gathering vehicles.details.warranties, devices (warranty_end and plan_end) and the new table `warranties` (item, provider, for_who, dates, terms, proof, attachments). Groups: Ending soon (45 days), Needs an end date, Active, Expired. Home systems are NOT included (no warranty field yet).
- Add warranty and Edit (standalone ones only; vehicle and device ones are edited in their own pages). Files: "Add receipt" and "Add warranty info" (photos or PDFs, up to 8, 25 MB), viewable through /api/warranty-file/<id>/<n> signed links. Reading: warranty-info files are read by the model and SUGGEST item, provider, dates and terms in a box; "Use these" fills only empty boxes; nothing saves until Save (src/app/warranties/read.ts). End dates are calculated only when a start date and a length are printed, and labeled "calculated".
- Tasks: ONE reminder 30 days before an end date ("extend or let it lapse", origin_kind warranty, ref key@end) and ONE "Add the end date" task per warranty with no end date (ref key@needs_end). The end-date task completes itself when the date is added and is never recreated once done or dismissed. syncWarrantyTasks runs on the Warranties page, on filing, on saving a vehicle, and on saving a warranty. It does NOT run daily on its own; a daily check would need a Vercel cron and a CRON_SECRET.
- Sienna's two battery warranties still have no end date (tasks exist, assigned to Melissa).

### Tasks and Inbox sharing (migrations 0017a/0017b, 0018, 0019)
- Parents: Ryan (158bb4d5-75ab-42be-92bc-7abb728839b8) and Melissa (8baccfad-b499-4c06-92a4-259229a94f74), both role owner. Vehicles have a driver (Tahoe: Ryan, Sienna: Melissa).
- tasks gained audience ('one' | 'both'), fyi (uuid[] of heads-up recipients) and done_by. A SECOND update policy "members update shared tasks" lets either parent change a task whose audience is both or who is in fyi; the original "owner updates own task" policy was kept. A tap on a task the person may not change now reports failure (before, it silently did nothing). Closing records done_by and logs "<Name> handled: <task>".
- Defaults (src/lib/task-defaults.ts): a vehicle task goes to that vehicle's driver with the other parent as heads-up; anything else goes to both. The claim task and both Sienna end-date tasks were set to Melissa with Ryan as heads-up.
- Tasks page: tabs per person plus Both, each with a count, opening on the viewer's own tab; heads-up copies appear on the other person's tab with a label; "Take it" turns a heads-up into the viewer's own task; "Change who" offers Just me, the other person, Both of us, and a heads-up checkbox. Today shows the viewer's tasks plus shared ones.
- Inbox: any item can be handed to the other parent ("Hand to Melissa"; "Take it" and "Hand back to anyone"). Columns on inbox_items: assigned_to, assigned_by, created_by (default auth.uid()). Filter row: All, From <each person>, Handed to me (n) (only shown when n > 0, so only the recipient sees it). Handed items sort first. Either parent can still answer any item. A red count on the More tab (via /api/badges) and a line at the top of Today ("Ryan handed you 2 items in the Inbox") show hand-overs; they refresh on navigation, not live.
- Not built: push notification on hand-over or reassignment (needs the VAPID key, see section 6); a badge on the Tasks tab for newly assigned tasks; hiding a handed item from the giver's default view (Ryan chose the shared view for now).

### Pending decisions from Ryan
- The dollar amount above which the app always asks before filing (suggested $100).
- When to enable auto-filing for low-stakes receipts (suggested after about a week).
- Whether to hand-roll push now (generate VAPID keys, set NEXT_PUBLIC_VAPID_PUBLIC_KEY in Vercel, both parents add the app to the home screen and allow notifications).

### Process notes for the next session
- The Supabase migration tool cancelled a migration that dropped a policy; splitting it into additive parts worked. Prefer additive changes (new columns, new policies) and ask before dropping or loosening a rule.
- Migration file numbers collide across sessions (0015 to 0018 each exist twice); they were applied by name. Renumbering is still outstanding.
- Panda Express receipt (inbox 6b8d4a44-ffcf-4193-92b2-cf398a8f962f, $24.78, folder Finance/2026/Dining) was handed to Melissa and is still open at this update.
- The Vercel MCP returns 403 for this project, so deployments can't be read; More › System health shows the version and server region (expected sfo1).
