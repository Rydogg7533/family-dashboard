# Filing agent: copies filed documents from the app to Organized on the Mac mini

Decision (Ryan, 2026-10-20): the app keeps every uploaded file in its private `captures` storage (so documents open on
the phone anywhere, whether or not the Mac mini is awake). The Mac mini gets a **copy**; the 8TB nightly mirror carries
it from there. Nothing is moved and nothing is deleted. If storage ever needs saving, that is a later, explicit choice.

## What it does (`scripts/filing-agent.mjs`, every 10 minutes, service key, no model)
For each Inbox item that has been filed (`status='resolved'`, `filed` set) and not yet copied:
1. Download the stored file (every page, for a multi-page document).
2. Write it under `~/Organized/<home folder the plan showed>/` as `<proposed name>.<ext>` (`<name> p1`, `p2` for pages).
   The home folder is chosen when the document is read: `Personal/Documents/Vehicles/<vehicle>/<year>/` for a vehicle
   item, otherwise `Personal/Documents/Finance/<year>/<Groceries|Home|Receipts>/`.
3. Never overwrite: identical bytes already there = done; a different file with that name becomes `name (2)`.
4. Read the copy back; size and SHA-256 must equal the fingerprint recorded at upload, or it is reported as an error.
5. Record `copied_path` / `copied_at` on the item (or `copy_error`, retried next run). `system_status.sync_filing`
   gets a one-line summary (green = fine, error = something to look at).

Refuses a destination that would leave `~/Organized`. `--dry` prints what it would do and changes nothing.

## Install (once)
```
cd ~/family-dashboard && git pull
mkdir -p ~/Organized/"_Consolidation Records"/mirror-logs
node scripts/filing-agent.mjs --dry              # prints "nothing waiting" until something has been filed
cp scripts/com.ryan.filing-agent.plist ~/Library/LaunchAgents/
launchctl bootout gui/$(id -u)/com.ryan.filing-agent 2>/dev/null; launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ryan.filing-agent.plist
tail -n 3 ~/Organized/"_Consolidation Records"/mirror-logs/filing-agent.log
```
Secrets come from `~/_secrets_local_only/family-dashboard.env` (same file as the other agents).

## Tested
Helper functions (safe names, destination stays inside Organized, no-overwrite naming, SHA-256) and the full loop
against a local mock of the database and storage: dry run writes nothing; a real run writes one file, verifies it,
records it; a second run creates no duplicate.
