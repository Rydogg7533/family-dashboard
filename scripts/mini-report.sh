#!/bin/bash
# Mac mini → dashboard health report. Runs hourly via launchd.
# Reads the service key from ~/_secrets_local_only/family-dashboard.env (never cloud-synced):
#   SUPABASE_URL=https://xxxx.supabase.co
#   SUPABASE_SERVICE_KEY=...
set -euo pipefail
ENV="$HOME/_secrets_local_only/family-dashboard.env"
[ -f "$ENV" ] || { echo "missing $ENV"; exit 1; }
# shellcheck disable=SC1090
source "$ENV"
STATUS_FILE="$HOME/Organized/_Consolidation Records/mirror-status.txt"
DEST_VOL="/Volumes/Rossiter 8TB"
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

json_escape() { local t; t=$(cat); t=${t//\\/\\\\}; t=${t//\"/\\\"}; t=${t//$'\n'/ }; t=${t//$'\t'/ }; printf '"%s"' "$t"; }
pct_free() { df -k "$1" 2>/dev/null | awk 'NR==2{printf "%.1f", $4/$2*100}'; }
human_free() { df -h "$1" 2>/dev/null | awk 'NR==2{print $4" free of "$2}'; }

rows=()
rows+=("{\"key\":\"heartbeat\",\"state\":\"ok\",\"summary\":\"Mac mini reported $(date '+%-I:%M %p')\",\"updated_at\":\"$now\"}")

if [ -f "$STATUS_FILE" ]; then
  line=$(tail -n 1 "$STATUS_FILE")
  state="ok"; echo "$line" | grep -qi "MISMATCH\|FAIL\|ERROR\|exit 1" && state="error"
  rows+=("{\"key\":\"mirror\",\"state\":\"$state\",\"summary\":$(echo "$line" | json_escape),\"updated_at\":\"$now\"}")
else
  rows+=("{\"key\":\"mirror\",\"state\":\"unknown\",\"summary\":\"No mirror status file\",\"updated_at\":\"$now\"}")
fi

mp=$(pct_free /); ms="ok"; [ "${mp%.*}" -lt 15 ] && ms="warn"; [ "${mp%.*}" -lt 8 ] && ms="error"
rows+=("{\"key\":\"free_space_mini\",\"state\":\"$ms\",\"summary\":\"$(human_free /)\",\"value_num\":$mp,\"updated_at\":\"$now\"}")

if [ -d "$DEST_VOL" ]; then
  ep=$(pct_free "$DEST_VOL"); es="ok"; [ "${ep%.*}" -lt 10 ] && es="warn"
  rows+=("{\"key\":\"free_space_8tb\",\"state\":\"$es\",\"summary\":\"$(human_free "$DEST_VOL")\",\"value_num\":$ep,\"updated_at\":\"$now\"}")
else
  rows+=("{\"key\":\"free_space_8tb\",\"state\":\"error\",\"summary\":\"Rossiter 8TB not mounted\",\"updated_at\":\"$now\"}")
fi

tm=$(tmutil latestbackup 2>/dev/null | tail -n1 || true)
if [ -n "$tm" ]; then
  rows+=("{\"key\":\"time_machine\",\"state\":\"ok\",\"summary\":$(echo "Latest Time Machine backup: $(basename "$tm")" | json_escape),\"updated_at\":\"$now\"}")
else
  rows+=("{\"key\":\"time_machine\",\"state\":\"warn\",\"summary\":\"Time Machine: no backup found (set to Manual)\",\"updated_at\":\"$now\"}")
fi

body="[$(IFS=,; echo "${rows[*]}")]"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SUPABASE_URL/rest/v1/system_status?on_conflict=key" \
  -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates,return=minimal" \
  --data "$body")
echo "$(date '+%F %T') report http=$code"
[ "$code" = "201" ] || [ "$code" = "200" ] || [ "$code" = "204" ] || { echo "body was: $body"; }
[ "$code" = "201" ] || [ "$code" = "200" ] || [ "$code" = "204" ]
