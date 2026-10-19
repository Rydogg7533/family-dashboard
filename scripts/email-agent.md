# Email agent on the Mac mini (design; runs alongside mini-report.sh)

Purpose: F1 "email handled for me" and F2/F22 "every charge has proof", without the dashboard ever
touching a mailbox from the browser. The agent reads mail, decides with `src/lib/email-funnel.ts`
(rules first, Haiku only for survivors), writes tasks, drafts, receipts, records and log lines into
Supabase with the service key, and files attachments into ~/Organized. It never sends.

## Accounts and access
- One Gmail API OAuth client (Desktop app type) in a family Google Cloud project; one refresh token
  per account, stored in `~/_secrets_local_only/email-agent/<account>.json` (never in a cloud-synced
  folder, never in Supabase). Scopes: `gmail.readonly`, `gmail.modify` (labels and archive only),
  `gmail.compose` (create drafts only). No `gmail.send`.
- iCloud mail (Ryan) via IMAP with an app-specific password in the same folder; read, label, move
  to Archive only; drafts written to the Drafts folder.
- Accounts in scope, each a row in the source register: iCloud (Ryan), admin@shvr.co and
  admin@medrepdesk.io (business: tasks route to the Work area, F15 item 5), rross15253@gmail.com,
  Melissa's (after her own first-run consent, F15 item 15).
- Supabase service key in `~/_secrets_local_only/email-agent/supabase.env`. The browser never has it.
- `ANTHROPIC_API_KEY` (family key, separate from Veil Labs) in the same env file. Every call goes
  through the same routing as `src/lib/ai.ts` and lands in `ai_usage`.

## Schedule
- launchd job `com.ryan.email-agent`, every 10 minutes 6 am to 10 pm, hourly overnight (Ryan's open
  question "continuous vs a few times a day": start here, change in Settings › Connections).
- Each run: for each account, list messages since the last `historyId`, fetch headers plus the first
  2 KB of text for inbox mail only, run the funnel, act, write the log, advance the cursor.
- Cold start (before go-live): scan the last 90 days with the free stages only, propose sender rules
  in one batch to `email_rules` (status `proposed`) for one-tap approval. No model calls.

## What each decision does
| decision | action on the mailbox | writes |
|---|---|---|
| skip (provider folder) | nothing | counted in the daily log line |
| archive (marketing, codes, no-reply) | label `Dashboard/Handled`, archive | one `activity_log` row per email |
| unsubscribe (when a rule says so) | uses the List-Unsubscribe URL (GET/POST, never mailto that sends) | log row |
| money (receipt, statement) | label `Dashboard/Money`, archive | `receipts` row (metadata), PDF filed to `Organized/Personal/Documents/Finance/<year>/<category>/` or the entity's `01_Admin/Finance`; statements to `Finance/Statements/<year>/`; then `findProof` matches it to a `transactions` line and adds a `proofs` row (`digital_receipt`) |
| record (confirmation) | label `Dashboard/Records`, archive | `records` row; file to `Organized/Personal/Documents/Records/<year>/<kind>/`; `needed_until` from the retention rule |
| calendar | leaves the invite | `tasks` row of kind `decide` only when no auto-accept rule exists |
| task | label `Dashboard/Task`, stays in inbox | `tasks` row (kind, title, summary, origin_ref = Gmail message URL, person, requested_by), plus a `drafts` row for reply tasks |
| fyi | label, archive | `tasks` row of kind `fyi` (auto-expires in 7 days) |

Attachments on a task email: bills, statements, receipts, tax and legal documents are filed by the
Inbox filing rules; anything uncertain becomes an `inbox_items` row ("What is this?").

## Reply drafts (F15 item 4)
1. Sonnet writes the draft in the person's voice (prompt cached: standing instructions + 20 of the
   person's own sent replies as style, never credentials). `drafts.text` is written; `complete=false`.
2. The agent lists the attachments the reply needs (from the thread: "send me the declarations
   page") and searches `~/Organized`, iCloud Drive and recent attachments by name and type. Found
   ones get `status: attached` with the path; missing ones get `status: missing` and `looked_in`.
3. No mail draft exists until `complete=true` (every attachment attached, or `create_anyway=true`
   after the person's tap, which is logged). The dashboard sets `mail_requested_at`; the next run
   creates the Gmail draft with the files attached and writes `mail_draft_ref`. The person sends
   from the mail app. The agent has no send scope, so "never sends" is enforced by the token, not
   by code.

## Receipts, three layers (F22)
1. On each new `transactions` line from the Tiller sheet: `findProof` searches email (all accounts,
   label `Dashboard/Money` first, then everything in ±3 days), the financial inbox folder
   (`~/_Inbox/Financial`), then `Organized/.../Finance` by amount + merchant + date ±3 days. A clear
   match attaches silently; an ambiguous one (two Costco charges the same day) is one Haiku
   extraction call.
2. In-person charge with no match: one nudge, "Costco $142 — snap the receipt?", sent as a push
   that opens `/money/receipts?for=<tx>&do=camera`. Timing: when Overland reports the store was
   left and the charge has landed; otherwise with the morning summary. One nudge, never repeated.
3. No match and no photo: the statement line is the minimum proof (`proofs.kind=statement_line`,
   amber, "statement only"). The item stays on Money › Needs me until a receipt, photo or
   explanation arrives. Reconciliations cannot close with red items (no proof at all).

## Cost rules (F18)
- Provider folders and anything with List-Unsubscribe or bulk precedence never reach a model.
- Haiku for triage and extraction; Sonnet for drafts and anything written for a person; Opus only
  for replies to the key-people list (logged with the reason).
- Every call is one `ai_usage` row (model, feature, tokens, cost). No caps enforced; cost shown in
  Settings › Assistant and in the weekly review line.

## Trust and audit
- One `activity_log` row per email handled (what was done, which rule or model). Nothing deleted;
  archived and labelled only, so any action can be reversed in the mailbox.
- Daily line in `system_status` key `email_agent`: "Handled 212 emails: 140 skipped, 51 archived,
  9 receipts, 3 records, 2 invites, 7 tasks; 7 Haiku calls, $0.01".
- Failures (token expired, API down) set `email_agent` to `warn` with the account name; the
  dashboard's health line shows it; nothing is retried more than three times per run.

## Not built yet
- Melissa's mailbox (needs her consent flow). Immediate notifications for family or key clients
  (open question). Daily digest (open question). Unsubscribe automation ships off until the rule
  mechanism has been approved in the weekly review a few times.
