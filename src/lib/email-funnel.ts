// The email funnel (F1, cost-aware) and the receipt search (F2, F22), in code.
// Rules first, free. A model (Haiku) is used only for mail that survives every free stage, and never for
// junk or marketing. Receipts are matched by amount, merchant and date ±3 days before any AI.
// This module is pure: it decides; the Mac mini agent (scripts/email-agent.md) acts on the decisions.
import { callModel } from "@/lib/ai";

export type EmailMeta = {
  id: string;
  account: string;               // mailbox it came from
  from: string;                  // display name only
  fromAddress: string;
  domain: string;
  subject: string;
  folder: "inbox" | "spam" | "junk" | "promotions" | "social" | "updates";
  listUnsubscribe: boolean;
  precedenceBulk: boolean;
  autoSubmitted: boolean;
  hasAttachments: boolean;
  bodyPreview: string;           // first part of the body only; never sent for junk
  receivedAt: string;
};

export type SenderRule = { id: string; match: "sender" | "domain"; value: string; action: "archive" | "file" | "money" | "task" | "ignore" | "record"; target?: string; origin: string };

export type FunnelStage = "provider" | "headers" | "rules" | "calendar" | "money" | "record" | "ai";
export type Decision = {
  emailId: string;
  stage: FunnelStage;
  action: "skip" | "archive" | "file" | "money" | "calendar" | "record" | "task" | "fyi" | "unsubscribe";
  reason: string;
  usedAI: boolean;
  taskKind?: "reply" | "do" | "decide" | "fyi";
  who: string;                   // "Always say who": "System · from email (<account>)"
};

// Known automated senders handled by fixed signals (stage 2). Extend from the family's own rules.
const RECEIPT_RE = /\b(receipt|your order|order confirmation|invoice|payment received|e-?receipt|statement is (ready|available)|your statement)\b/i;
const SHIPPING_RE = /\b(shipped|out for delivery|delivered|tracking)\b/i;
const CODE_RE = /\b(verification code|one-time|security code|sign-in code|2fa)\b/i;
const CALENDAR_RE = /\b(invitation|invite|accepted|declined|tentative):|\.ics\b|calendar invitation/i;
const CONFIRMATION_RE = /\b(confirmation (number|#|code)|reservation (number|#)|booking (reference|number)|rma|return authori[sz]ation|claim (number|#)|case (number|#)|registration confirmed|appointment (confirmed|reminder))\b/i;
const NOREPLY_RE = /^(no-?reply|do-?not-?reply|noreply|notifications?|mailer-daemon|alerts?)@/i;

export function runFunnel(email: EmailMeta, rules: SenderRule[]): Decision | null {
  const who = `System · from email (${email.account})`;
  const d = (stage: FunnelStage, action: Decision["action"], reason: string, extra: Partial<Decision> = {}): Decision => ({ emailId: email.id, stage, action, reason, usedAI: false, who, ...extra });

  // Stage 1: provider filters. Skipped and only counted; never read, never sent to a model.
  if (["spam", "junk", "promotions", "social"].includes(email.folder)) return d("provider", "skip", `in ${email.folder}`);

  // Stage 2: fixed header signals.
  if (email.listUnsubscribe || email.precedenceBulk) return d("headers", "archive", email.listUnsubscribe ? "List-Unsubscribe header (marketing)" : "bulk precedence");
  if (CODE_RE.test(email.subject)) return d("headers", "archive", "one-time code");
  if (CALENDAR_RE.test(email.subject)) return d("calendar", "calendar", "calendar invite → Calendar");
  if (RECEIPT_RE.test(email.subject)) return d("money", "money", "receipt or statement → Money pipeline (matched by amount, merchant, date)");
  if (CONFIRMATION_RE.test(email.subject) || CONFIRMATION_RE.test(email.bodyPreview)) return d("record", "record", "confirmation with a stable shape (number, date, name) → Records");
  if (SHIPPING_RE.test(email.subject)) return d("headers", "fyi", "shipping update → just so you know (auto-expires)", { taskKind: "fyi" });
  if (NOREPLY_RE.test(email.fromAddress) && email.autoSubmitted) return d("headers", "archive", "automated no-reply");

  // Stage 3: the family's own rules, by sender then domain.
  const rule = rules.find((r) => r.match === "sender" && r.value.toLowerCase() === email.fromAddress.toLowerCase()) ?? rules.find((r) => r.match === "domain" && r.value.toLowerCase() === email.domain.toLowerCase());
  if (rule) {
    const map: Record<SenderRule["action"], Decision["action"]> = { archive: "archive", file: "file", money: "money", task: "task", ignore: "skip", record: "record" };
    return d("rules", map[rule.action], `rule: ${rule.match} ${rule.value} → ${rule.action}${rule.target ? ` (${rule.target})` : ""} (${rule.origin})`, rule.action === "task" ? { taskKind: "do" } : {});
  }

  // Nothing decided: a new human or company. Only now does a model see subject, sender, preview (never attachments).
  return null;
}

// Stage 4: Haiku triage, only for survivors. Returns a task-or-not decision with type, who, due date.
export async function classifyWithHaiku(email: EmailMeta): Promise<Decision> {
  const who = `System · from email (${email.account})`;
  const r = await callModel({
    job: "classify", feature: "email-triage", maxTokens: 80,
    system: "You triage one email for a family dashboard. Reply with one line: TYPE|SUMMARY|DUE. TYPE is reply, do, decide, fyi or none. SUMMARY is under 12 words. DUE is a date or none. Never include account numbers or codes.",
    messages: [{ role: "user", content: `From: ${email.from} <${email.fromAddress}>\nSubject: ${email.subject}\nPreview: ${email.bodyPreview.slice(0, 600)}` }],
  });
  const [type = "none", summary = "", due = "none"] = r.sample ? ["reply", `Sample: ${email.subject.slice(0, 40)}`, "none"] : r.text.split("|").map((s) => s.trim().toLowerCase());
  if (type === "none") return { emailId: email.id, stage: "ai", action: "archive", reason: "haiku: nothing needed", usedAI: true, who };
  return { emailId: email.id, stage: "ai", action: type === "fyi" ? "fyi" : "task", reason: `haiku: ${summary}${due !== "none" ? ` (due ${due})` : ""}`, usedAI: true, taskKind: (["reply", "do", "decide", "fyi"].includes(type) ? type : "do") as Decision["taskKind"], who };
}

export async function runPipeline(emails: EmailMeta[], rules: SenderRule[]) {
  const decisions: Decision[] = [];
  for (const e of emails) decisions.push(runFunnel(e, rules) ?? (await classifyWithHaiku(e)));
  return { decisions, counts: summarize(decisions) };
}

// The "handled quietly" counts for the Log and the weekly review.
export function summarize(decisions: Decision[]) {
  const by = (f: (d: Decision) => boolean) => decisions.filter(f).length;
  return {
    total: decisions.length,
    skipped_provider: by((d) => d.stage === "provider"),
    archived_marketing: by((d) => d.stage === "headers" && d.action === "archive"),
    receipts_to_money: by((d) => d.action === "money"),
    records_created: by((d) => d.action === "record"),
    calendar: by((d) => d.action === "calendar"),
    by_rule: by((d) => d.stage === "rules"),
    ai_calls: by((d) => d.usedAI),
    tasks: by((d) => d.action === "task"),
    fyi: by((d) => d.action === "fyi"),
    handled_quietly: by((d) => d.action !== "task"),
  };
}

// ---- Receipts: three layers, in order (F22) ----
export type ChargeLine = { id: string; amount: number; merchant: string; date: string; account: string; inPerson: boolean; locationLeftStore?: boolean };
export type Candidate = { id: string; where: "email" | "inbox" | "files"; amount: number; merchant: string; date: string; href: string; clear: boolean };
export type ProofDecision = { chargeId: string; layer: 1 | 2 | 3; proof: "digital_receipt" | "photo_nudge" | "statement_line"; detail: string; usedAI: boolean; ask: string | null };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dayDiff = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

export async function findProof(charge: ChargeLine, candidates: Candidate[], photoAlreadyTaken = false): Promise<ProofDecision> {
  // Layer 1: found for you. Email, then the Inbox, then Organized, by amount + merchant + date ±3 days. Rules first.
  const order: Candidate["where"][] = ["email", "inbox", "files"];
  for (const where of order) {
    const hits = candidates.filter((c) => c.where === where && Math.abs(c.amount - charge.amount) < 0.005 && dayDiff(c.date, charge.date) <= 3);
    const exact = hits.find((c) => norm(c.merchant).includes(norm(charge.merchant).split(" ")[0]) || norm(charge.merchant).includes(norm(c.merchant).split(" ")[0]));
    if (exact && exact.clear) return { chargeId: charge.id, layer: 1, proof: "digital_receipt", detail: `found in ${where}: ${exact.merchant} ${exact.amount} ${exact.date}`, usedAI: false, ask: photoAlreadyTaken || !charge.inPerson ? null : "Was there a paper receipt? Snap it for the second proof." };
    if (hits.length) {
      // Amount and date match but the merchant is unclear: one Haiku extraction picks among candidates.
      const r = await callModel({ job: "extract", feature: "receipt-match", maxTokens: 20, messages: [{ role: "user", content: `Charge: ${charge.merchant} ${charge.amount} ${charge.date}. Candidates: ${hits.map((h) => `${h.id}: ${h.merchant} ${h.amount} ${h.date}`).join("; ")}. Reply with the matching id or none.` }] });
      const pick = r.sample ? hits[0] : hits.find((h) => r.text.includes(h.id));
      if (pick) return { chargeId: charge.id, layer: 1, proof: "digital_receipt", detail: `matched by model among ${hits.length} candidates in ${where}`, usedAI: true, ask: charge.inPerson && !photoAlreadyTaken ? "Snap the paper receipt too?" : null };
    }
  }
  // Layer 2: photo at purchase, one nudge at the right moment (store left + charge landed).
  if (charge.inPerson && !photoAlreadyTaken) return { chargeId: charge.id, layer: 2, proof: "photo_nudge", detail: charge.locationLeftStore ? "store left and charge landed: nudge now" : "in-person charge: nudge with the morning summary", usedAI: false, ask: `${charge.merchant} $${charge.amount.toFixed(0)} — snap the receipt?` };
  // Layer 3: statement line is the minimum proof; stays amber and on the list.
  return { chargeId: charge.id, layer: 3, proof: "statement_line", detail: "no digital receipt within ±3 days; statement line kept, marked statement only", usedAI: false, ask: "Find in email later, or explain." };
}

// ---- Sample runs (used by tests and the Log preview) ----
export const sampleRules: SenderRule[] = [
  { id: "sr1", match: "domain", value: "school.example", action: "task", target: "school forms", origin: "Ryan approved, cold start batch" },
  { id: "sr2", match: "sender", value: "statements@amex.example", action: "money", target: "Finance/Statements", origin: "Ryan approved" },
  { id: "sr3", match: "domain", value: "deals.example", action: "ignore", origin: "Ryan: ignore this sender" },
];

export function sampleEmails(): EmailMeta[] {
  const base = { account: "rross15253@gmail.com", folder: "inbox" as const, listUnsubscribe: false, precedenceBulk: false, autoSubmitted: false, hasAttachments: false, receivedAt: new Date().toISOString() };
  const mk = (id: string, from: string, fromAddress: string, subject: string, extra: Partial<EmailMeta> = {}): EmailMeta => ({ id, from, fromAddress, domain: fromAddress.split("@")[1], subject, bodyPreview: "", ...base, ...extra });
  return [
    mk("e1", "[Retailer]", "promo@deals.example", "This weekend only: 40% off", { folder: "promotions" }),
    mk("e2", "[Newsletter]", "news@letters.example", "Weekly digest", { listUnsubscribe: true }),
    mk("e3", "[Store]", "receipts@store.example", "Your receipt from [Store]", {}),
    mk("e4", "Amex", "statements@amex.example", "Your statement is ready", {}),
    mk("e5", "[Coach]", "coach@team.example", "Invitation: Practice @ Thu 4pm", {}),
    mk("e6", "[Hotel]", "reservations@hotel.example", "Reservation confirmed: confirmation number 8X4K2", {}),
    mk("e7", "[Carrier]", "noreply@carrier.example", "Your package was delivered", { autoSubmitted: true }),
    mk("e8", "[School office]", "office@school.example", "Field trip permission form due Friday", { hasAttachments: true }),
    mk("e9", "[Insurance agent]", "agent@insure.example", "Renewal: deductible and declarations page", { bodyPreview: "Hi Ryan, before the renewal I need to confirm the deductible and get the current declarations page back." }),
    mk("e10", "[Bank]", "alerts@bank.example", "Your verification code is 123456", { autoSubmitted: true }),
    mk("e11", "[Orthodontist]", "frontdesk@ortho.example", "Appointment confirmed for [Child 1]", {}),
    mk("e12", "[Friend]", "friend@mail.example", "Saturday?", { bodyPreview: "Are you guys free Saturday afternoon? Thinking park then pizza." }),
  ];
}

export async function sampleRun() {
  const { decisions, counts } = await runPipeline(sampleEmails(), sampleRules);
  const charges: ChargeLine[] = [
    { id: "c1", amount: 86.4, merchant: "Smith's", date: "2026-10-17", account: "amex-1004", inPerson: true, locationLeftStore: true },
    { id: "c2", amount: 148.32, merchant: "Costco", date: "2026-10-15", account: "amex-1004", inPerson: true, locationLeftStore: true },
    { id: "c3", amount: 15.99, merchant: "[Streaming service]", date: "2026-10-17", account: "amex-1004", inPerson: false },
    { id: "c4", amount: 54.2, merchant: "Target", date: "2026-10-17", account: "visa-3310", inPerson: true },
  ];
  const candidates: Candidate[] = [
    { id: "k1", where: "email", amount: 86.4, merchant: "Smith's Food", date: "2026-10-17", href: "#", clear: true },
    { id: "k2", where: "email", amount: 54.2, merchant: "TGT*", date: "2026-10-18", href: "#", clear: false },
    { id: "k3", where: "files", amount: 54.2, merchant: "Target", date: "2026-10-17", href: "#", clear: true },
  ];
  const proofs = await Promise.all(charges.map((c) => findProof(c, candidates, c.id === "c1")));
  return { decisions, counts, proofs };
}
