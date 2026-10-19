# Household screen kiosk — old MacBook Air on the family room TV (F19.6)

Decision (Ryan, 2026-10-18): the household view runs on an old MacBook Air plugged into the TV by HDMI in clamshell
mode (a second Air open in the kitchen). Only Airs whose contents are already on the 8TB and verified (the 2015–16
snapshots) are repurposed: wipe, set up fresh, no personal account. A Fire TV Stick with a kiosk browser is the fallback.

The page: `https://<dashboard>/tv?token=<device token>` — 1920×1080, dark, large type, read-only, no money / health /
tasks / messages, refreshes itself every 5 minutes, dims 10 pm–6 am. Wallpaper options: `&wallpaper=plain|clock|photos`.

## 0. Check the Air can run a current browser
- Apple menu › About This Mac. macOS 12 Monterey or newer runs current Chrome and Safari; macOS 10.15 Catalina can
  still run a Chrome build but is out of security updates (fine on the home network, kiosk only).
- If it is older than the Air can take, try OpenCore Legacy Patcher or use the Fire TV Stick fallback.

## 1. Wipe and set up fresh
1. Confirm the Air's snapshot is on the 8TB and verified (source register row), then: System Settings › General ›
   Transfer or Reset › **Erase All Content and Settings** (or Internet Recovery on older models).
2. Create one local user **tv** (standard, no iCloud sign-in; no Apple ID needed). Skip Siri, analytics, Screen Time.
3. Join the home Wi-Fi. Install Chrome (or use Safari). Set a hostname like `familyroom-tv`.
4. In the dashboard: Settings › Family room TV › **Issue token** (`device_tokens`, `kind='tv'`, home network only,
   revocable). Copy the full URL once.

## 2. Auto-login and never sleep
- System Settings › Users & Groups › **Automatic login**: tv. (FileVault must be off for this; it is a kiosk with no data.)
- Lock Screen: "Start Screen Saver when inactive" → Never; "Turn display off on power adapter" → Never; require
  password after sleep → Never.
- Energy / Battery (on power adapter): Prevent automatic sleeping → on; Wake for network access → on.
- Clamshell mode (TV only): the Air must be on power **and** have the HDMI (USB-C/Thunderbolt adapter) connected to
  the TV; a plugged keyboard/mouse is only needed for setup. With the lid closed the TV is the only display.
- Wake/sleep schedule from Terminal (display off at night, back on before the morning summary):
  ```sh
  sudo pmset repeat wakeorpoweron MTWRFSU 06:15:00 sleep MTWRFSU 22:30:00
  ```
  The page itself dims 10 pm–6 am, so leaving the display on is also fine; TV power follows HDMI-CEC if the TV supports it.

## 3. Kiosk browser as a login item
Create `~/tv-kiosk.sh`:
```sh
#!/bin/zsh
# Family room TV kiosk: full-screen Chrome on the household page, kept awake, relaunched if it quits.
URL="https://<dashboard>/tv?token=<device token>&wallpaper=clock"
caffeinate -dimsu &          # no display sleep, no idle sleep while this runs
while true; do
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
    --disable-features=TranslateUI --no-first-run --autoplay-policy=no-user-gesture-required \
    --user-data-dir="$HOME/tv-chrome-profile" --window-position=0,0 --window-size=1920,1080 "$URL"
  sleep 5                    # Chrome quit or crashed: relaunch
done
```
`chmod +x ~/tv-kiosk.sh`. Then a LaunchAgent `~/Library/LaunchAgents/com.family.tv-kiosk.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.family.tv-kiosk</string>
  <key>ProgramArguments</key><array><string>/Users/tv/tv-kiosk.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/tv/Library/Logs/tv-kiosk.log</string>
  <key>StandardErrorPath</key><string>/Users/tv/Library/Logs/tv-kiosk.log</string>
</dict></plist>
```
`launchctl load -w ~/Library/LaunchAgents/com.family.tv-kiosk.plist`. Reboot to confirm it comes up on its own.

Safari alternative (no Chrome): open the URL, View › Enter Full Screen, and in Safari › Settings › General set the
homepage to the URL; add Safari as a Login Item (System Settings › General › Login Items). Safari has no true kiosk
flag, so Chrome is preferred for the TV.

## 4. Behaviour and safety
- Read-only page: nothing on it changes data; no login beyond the device token; the token works only from the home
  network and can be revoked in Settings (the page then shows "This screen needs its device token").
- The token sits in a shell script on a machine with no personal data; if the Air is ever moved or given away,
  revoke the token first.
- Refresh: the page re-fetches every 5 minutes on its own; `router.refresh()` keeps the clock live between fetches.
- Updates: once a month, open the lid, let macOS and Chrome update, close it. `sudo softwareupdate -ia` works too.
- Kitchen Air: same steps, lid open, `--window-size` matching its screen (1440×900 on a 13" Air); the page scales.

## 5. Fallback: Fire TV Stick
Fully Kiosk Browser (or "Kiosk Browser" from the Amazon app store), set the start URL to the same `/tv?token=…` link,
enable "Launch on boot" and "Keep screen on". Same token rules apply.
