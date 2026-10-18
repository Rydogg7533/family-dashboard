# Family Dashboard

What needs you today, for the family. Phone first. Next.js + Supabase, deployed on Vercel.

## v1 (this build)
- Today: system banner + the ranked queue (reply / do / decide), "and N more", link to the quiet log.
- Tasks, Health, Sources (source register), Log, Login. Sample data shows when Supabase env is unset.
- `supabase/migrations/0001_init.sql`: profiles, system_status, source_register, tasks, activity_log, RLS (members read; only own-task status updates from the browser).
- `scripts/mini-report.sh`: the Mac mini posts heartbeat, mirror result, free space and Time Machine to `system_status` hourly (service key kept in `~/_secrets_local_only`).

## Setup
1. Supabase project `family-dashboard` (us-west-1). Apply the migration. Create the two users in Authentication, then insert their `profiles` rows.
2. Vercel: import this repo, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Keep the project private; the app itself requires login.
3. On the Mac mini: copy `scripts/mini-report.sh` to `~/Organized/_Consolidation Records/scripts/`, create `~/_secrets_local_only/family-dashboard.env`, load `scripts/com.ryan.dashboard-report.plist` into `~/Library/LaunchAgents`.
4. Verify: anon read of `system_status` must fail; a signed-in read must succeed; the Health page turns red after 26 h without a report.
