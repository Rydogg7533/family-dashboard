# Location agent — Overland on the phone, the day record on the Mac mini (F3)

Decision (Ryan, 2026-10-18): the location source is **Overland** (iOS, open source, background GPS logger). It posts
batches of GeoJSON points to a URL with a token. The dashboard receives them at
`POST /api/location/overland` (`src/app/api/location/overland/route.ts`), stores them as person-private rows, and a
job on the Mac mini turns points into stops, Places and day blocks. Nothing leaves the person's own Day page.

## Install (per person who opts in)
1. App Store → **Overland** (by Aaron Parecki). Allow Location **Always** and Precise Location on the prompt (Settings ›
   Privacy › Location Services › Overland › Always; "Allow Precise" on).
2. In the dashboard: Settings › Connections › **Location (Overland)** › *Issue token* for this phone. It creates a row
   in `device_tokens` (`kind='overland'`, `person` = you, label "Ryan's iPhone") and shows the endpoint once.
3. In Overland › Settings:
   - **Receiver Endpoint**: `https://<dashboard>/api/location/overland`
   - **Access Token**: the token from step 2 (sent as `Authorization: Bearer …`; also accepted as `?token=` if needed)
   - **Device ID**: your first name (informational)
   - **Tracking enabled**: on; **Logging mode**: All Data is fine (batches are small)
   - **Desired accuracy**: *100 m* (default). Use *10 m* only if Places are being confused; it costs battery.
   - **Significant-location mode**: off (continuous), **Stationary sleeping**: on
   - **Send interval**: every *5 minutes* (or "when a batch of 50 points is ready"); **Send on WiFi only**: off
   - **Visit tracking** (Visits API): on — iOS's own arrive/leave events make stops sharper.
4. Tap **Send Now** once; the dashboard's Sync line shows "Location: synced just now" and `sync_location` goes green.

### How Overland behaves
- When you are **stationary**, Overland sleeps (one point every few minutes, "stationary" in `motion`), then wakes on
  movement. Expect roughly **2–5 % battery per day** at 100 m accuracy; more in a car, less at a desk.
- Points buffer on the phone when there is no network and post later; the server accepts batches of any size and
  must answer `{"result":"ok"}` or Overland retries the batch.
- Each point carries `timestamp`, `horizontal_accuracy`, `speed`, `motion` (stationary / walking / running /
  automotive / cycling), `battery_level`, `altitude`, `wifi`. Only timestamp, coordinates, accuracy, speed, motion and
  battery are stored (see migration 0004 `locations`).

## The server side
- `route.ts` authenticates the bearer token against `device_tokens` (not revoked), inserts the points with that
  token's `person`, updates `last_seen_at` and `system_status.sync_location`, replies `{"result":"ok"}`.
- Sample mode (no Supabase env): any token is accepted, the batch is logged to the server console, nothing is stored.
- RLS: `locations` is readable only where `person = auth.uid()`; the browser never sees another person's points.

## The Mac mini job (`location-agent`, every 10 minutes, service key, no model)
1. Read new `status='raw'` points for each person.
2. **Stops**: cluster consecutive points within ~75 m for ≥ 8 minutes (or an iOS Visit) → one stop with start, end,
   centre. Movement between stops → travel (mode from `motion`: automotive / walking / cycling).
3. **Match**: a stop within 150 m of a known Place → that Place. A calendar event at that time and place names the
   Place if new. Receipts/charges at that merchant and time (F2) strengthen the match.
4. **Fill or ask** (confidence rules from F3): fill the day block automatically only when the Place is known **and**
   the usual activity fits (time of day, duration, day of week) → `day_blocks.kind='inferred'` with `confidence`;
   the Day page shows "FILLED FROM OVERLAND · 92% sure" with a one-tap "Not this?". Anything else → `status='question'`
   with a reverse-geocoded `address` and 2–3 `suggestions` (nearest Place, recent similar visits) → "Questions for you".
5. **Learn**: every answer updates the Place (name, meaning, usual activity/duration/days, indoor/outdoor for F5) and
   becomes a rule; the same Place-and-pattern is never asked twice. Unanswered questions wait a few days, then fold into
   the weekly review; they are never deleted.
6. **Retention**: `delete from locations where recorded_at < now() - interval '30 days'` every night. The day record
   keeps only Places and times, never the raw track.

## Rules (privacy and control)
- **Own Day page only.** A person's location shows on their own Day page and nowhere else — not on Family pages, the
  household TV, or anyone else's view — unless that person turns sharing on in Settings (default off).
- **Pause**: the "private time" switch (Settings, or "private time until 5" by text to the assistant) leaves a gap on
  purpose, marked private, and no question is asked about it. Any day's record can be deleted by its owner.
- **30-day raw retention**, then learned Places only (above).
- **Children opt in with a parent**: a child's token is issued only from a parent's Settings, on the child's phone with
  the child present, with its own on/off switch; it is a parents-only decision and parents see it only on the child's
  Family page, never on the TV.
- Both parents: Melissa's Overland posts to the same endpoint with her own token; her points are hers.
- No model sees raw coordinates; place naming uses map lookups and the person's answers.

## Optional manual backfill: Google Timeline export
For days before Overland, or a phone that had Timeline on: Google Maps › your photo › Your Timeline › ⋯ › **Export
Timeline data** (iOS/Android exports a `Timeline.json` on the device; Takeout for older accounts). Drop the file on the
dashboard with the **"+" button › Upload file** (Inbox). The Inbox recognizes `Timeline.json` / `Semantic Location
History` and hands it to the same stop → Place → question pipeline, tagged `source='timeline'`, for the owner's Day
record only. The file is filed to `Organized/Personal/Archive/Location exports/` and the raw points follow the same
30-day retention after import.

## Checks
- Settings › Connections shows each token's `last_seen_at`; the Day page Sync line turns amber after 2 hours without a
  batch while the phone is known to be moving, red after 24 hours.
- `curl -X POST https://<dashboard>/api/location/overland -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"locations":[{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.6946,40.2969]},"properties":{"timestamp":"2026-10-18T14:02:11Z","speed":0,"motion":["stationary"],"battery_level":0.8,"horizontal_accuracy":10}}]}'`
  → `{"result":"ok","received":1}`.
