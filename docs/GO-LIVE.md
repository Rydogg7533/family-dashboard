# Family Dashboard — go-live checklist (2026-10-18)

Live: https://family-dashboard-dun-nine.vercel.app (login required). Code: github.com/Rydogg7533/family-dashboard. Data: Supabase `family-dashboard` (Veil Labs org), 41 tables, row-level security on all. Mac mini posts health hourly. All seven slices are built; every page exists. Pages show real data where a source is connected and empty states elsewhere (sample content appears only in local preview without Supabase keys).

## What is live now
Today, Tasks (+ draft editor), Ask (sample replies until the API key is set), Inbox, Money (needs me, accounts, reconciliations, receipts, recurring, subscriptions, spending monitor, reports links), Records, Day, Calendar, Recurring, Messages, Shop (+ orders, cases), Family pages, Vehicles, Devices, Medications, Home & property, Contacts, Emergency, Places, Sources, Settings (Appearance, Modules, Notifications), System health, Source register, Log, TV screen, Kid page, Voice.

## Inputs that light features up (do in any order, at your pace)
| # | Item | Lights up | Where |
|---|---|---|---|
| 1 | Install to home screen (Safari → Share → Add to Home Screen), then Settings › Notifications › Allow | push notifications | iPhone, both parents |
| 2 | Anthropic API key → Vercel env `ANTHROPIC_API_KEY` | Ask with real answers, email classification, receipt extraction; cost shown per answer | Vercel project settings |
| 3 | VAPID key pair → Vercel env `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; private key in ~/_secrets_local_only | push sending (scripts/push-sender.md) | I generate; you paste |
| 4 | Gmail authorization per account (OAuth, read + modify labels, no send) | email funnel, tasks from mail, receipts found for you, confirmations → Records | Mac mini (scripts/email-agent.md) |
| 5 | Google Calendar (and Apple Calendar via the mini) | Day blocks, Calendar page, weather per event | Mac mini agent |
| 6 | Overland on each parent's iPhone, endpoint + token from Settings | gap filling, Questions for you, Places learning | scripts/location-agent.md |
| 7 | Tiller sheet share (or bank/card exports) | Money: accounts, transactions, reconciliations, spending monitor | Mac mini agent |
| 8 | Messages mirror on the mini (and Melissa's Air later) | Messages page, task proposals from texts | scripts/messages-mirror.md |
| 9 | Assistant Apple ID + second macOS user on the mini | the assistant's own thread (Y/N by text) | one-time setup |
| 10 | Registers: vehicles (dates, mileage), devices, medications, contacts, home systems, key people, portals/banks for Sources | the registers and their reminders | via Ask ("add …") or Settings |
| 11 | Store accounts to start with (Smith's, Costco?), regular items | Shop carts, "add the usual" | Ask |
| 12 | Old MacBook Air as TV kiosk | household screen | scripts/tv-kiosk.md |
| 13 | ElevenLabs (yes/no) | voice agent | later |
| 14 | Supabase Auth → enable leaked-password protection; both parents change their temporary passwords | account hygiene | Supabase dashboard; Settings › People |

## Known gaps to close in the first tuning pass
- Change-password screen (Settings › People) — not yet built; temporary passwords stand until then.
- Cart is per-device until the shared cart is switched on (tables exist).
- TV page needs its device token check in production (tokens issued from Settings).
- Reordering Today's sections by drag (F13) deferred.
- Pricing table in src/lib/ai.ts to be checked against current API prices at key time.
