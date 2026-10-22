#!/bin/bash
# Once an evening: if the bookmark catalog has changes waiting for Safari, ask Ryan (macOS dialog) whether to close the browsers and update.
# Dismissing, ignoring (gives up after 2 minutes) or "Not tonight" = nothing happens and it does not ask again that night. Never force-quits.
set -u
REPO="$HOME/family-dashboard"; B="$HOME/Organized/_Bookmarks"; STATE="$B/evening-asked.txt"; TODAY=$(date +%F)
log() { echo "$(date '+%F %T') $*"; }
[ "$(cat "$STATE" 2>/dev/null)" = "$TODAY" ] && exit 0
cd "$REPO" || exit 0
ST=$(python3 scripts/safari_sync.py --status 2>/dev/null) || { log "status failed"; exit 0; }
[ "$ST" = "current" ] && { log "nothing waiting"; exit 0; }
echo "$TODAY" > "$STATE"
if [ "$ST" = "test" ]; then ARGS="--only Pinned --apply"; MSG="Safari needs to close for a small first test: 5 bookmarks go into a new StewardOS folder. Your tabs come back when Safari reopens. Close Safari and run the test now?"
else ARGS="--apply"; MSG="Your bookmark changes are ready for Safari. Safari must close for a moment (tabs come back when it reopens). Close it and update now?"; fi
ANS=$(osascript -e "button returned of (display dialog \"$MSG\" with title \"StewardOS bookmarks\" buttons {\"Not tonight\", \"Close and update\"} default button \"Not tonight\" giving up after 120)" 2>/dev/null)
[ "$ANS" = "Close and update" ] || { log "not tonight (answer: '${ANS:-none}')"; exit 0; }
WAS=""; for app in Safari; do [ "$(osascript -e "application \"$app\" is running" 2>/dev/null)" = "true" ] && WAS="$WAS $app"; done
for app in $WAS; do osascript -e "tell application \"$app\" to quit" >/dev/null 2>&1; done
for i in $(seq 1 40); do pgrep -x Safari >/dev/null || break; sleep 1; done
if pgrep -x Safari >/dev/null; then log "Safari did not close; nothing written"; osascript -e 'display notification "Safari did not close (it may be asking to save something). Nothing was changed." with title "StewardOS bookmarks"' >/dev/null 2>&1; exit 0; fi
OUT=$(python3 scripts/safari_sync.py $ARGS 2>&1); RC=$?; log "$OUT"
for app in $WAS; do open -a "$app"; done
if [ $RC -eq 0 ]; then osascript -e 'display notification "Safari bookmarks updated and checked." with title "StewardOS bookmarks"' >/dev/null 2>&1
else osascript -e 'display notification "Update did not finish; nothing else was changed. See the log." with title "StewardOS bookmarks"' >/dev/null 2>&1; fi
