// The Ask window's brain (F4, F18). Order of work, cheapest first:
// 1) structured input recognised locally (no model); 2) intent classified by Haiku; 3) the answer or the
// confirmation card written by Sonnet with only the relevant records; 4) off-scope questions get the
// one "is this related?" check before deflection. Without an API key the same shape is produced by
// keyword matching so the page feels real in preview.
import { callModel, formatCost, isStructuredInput, hasAiKey, SCOPE_SYSTEM_PROMPT, type Message } from "@/lib/ai";
import { getOpenTasks } from "@/lib/data";
import { eventTurn } from "@/lib/ask-calendar";
import { getCalendarEvents } from "@/lib/data-day";
import { sampleTransactions, sampleRecurring, sampleReconciliations, money, shortDate } from "@/lib/data-money";

export type Tier = 1 | 2 | 3;
export type EventDraft = { title: string | null; date: string | null; endDate: string | null; allDay: boolean; start: string | null; end: string | null; location: string | null; reminders: number[] | null; guests: string[] };
export type AskReply = {
  kind: "answer" | "instruction" | "clarify" | "scope_check" | "deflect" | "inbox" | "structured" | "event_clarify" | "event_confirm" | "event_conflict" | "event_move";
  draft?: EventDraft;
  move?: { calendarId: string; id: string; title: string; date: string; oldStart: string; oldEnd: string; newStart: string; newEnd: string };   // an existing event to move first                                   // an event waiting for the person's Add tap
  text: string;
  source?: { label: string; href: string };            // "Open in …"
  confirm?: { summary: string; target: string; tier: Tier; missing?: string };
  chips?: string[];                                     // suggested next taps
  scopeRule?: string;                                   // learned when the person connects an off-scope question
  cost: number; costText: string; model: string; sample: boolean;
};
export type Turn = { role: "user" | "assistant"; text: string; kind?: AskReply["kind"] };

const FAMILY_WORDS = /\b(confirmation|reservation|hotel|flight|ticket|claim|warranty|return|record|today|tomorrow|week|schedule|calendar|appointment|dentist|doctor|school|practice|kid|child|son|daughter|ryan|melissa|tahoe|sienna|car|oil|registration|insurance|title|document|file|where|receipt|charge|paid|pay|cost|spent|spend|money|amex|visa|card|bill|subscription|statement|budget|medication|meds|melatonin|dose|device|laptop|serial|filter|furnace|home|house|yard|contact|grandma|birthday|task|email|reply|draft|inbox|setting|notification|rain|weather|trip|pack|checklist|shop|order|buy|need)\b/i;

const CHILD = /\[child \d\]|\bchild\b|\bson\b|\bdaughter\b|\bkid\b/i;

export const SUGGESTED = ["What needs me today?", "Where is the Sienna registration?", "Add melatonin for [Child 1] at 8 pm", "Find a 16x25x1 MERV 11 filter", "Save confirmation 8X4K2 for the Moab hotel Nov 3"];

export async function answerAsk(thread: Turn[], assistantApp = "Claude"): Promise<AskReply> {
  const last = thread[thread.length - 1];
  const q = (last?.text ?? "").trim();
  const prev = [...thread].reverse().find((t) => t.role === "assistant");

  // A reply to the one scope question: a connection makes it in scope and becomes a rule; a no deflects.
  if (prev?.kind === "scope_check") {
    if (/^(no|nope|not really|n)\b/i.test(q) || q.length < 3) return deflect(assistantApp);
    const original = [...thread].reverse().find((t) => t.role === "user" && t !== last)?.text ?? "";
    const rule = `${topic(original)} questions when ${q.replace(/^(yes|yeah|yep|it'?s|its|because)\s*/i, "").slice(0, 60)}`;
    const r = await callModel({ job: "chat", feature: "ask", messages: toMessages(thread), system: SCOPE_SYSTEM_PROMPT + `\nThe person connected the question to the family: "${q}". Answer the original question now, briefly.` });
    return { kind: "answer", text: r.sample ? `Got it, treating this as part of ${q.replace(/^(yes|it'?s)\s*/i, "")}. ${sampleGeneral(original)}` : r.text, scopeRule: rule, source: { label: "Settings › Assistant › Scope rules", href: "/settings" }, chips: ["Thanks", "Remove that rule"], ...costOf(r) };
  }

  // An event is being put together: every reply in the thread (an answer, a chip, "change the time") goes back to it.
  if (hasAiKey() && (prev?.kind === "event_clarify" || prev?.kind === "event_confirm" || prev?.kind === "event_conflict" || prev?.kind === "event_move") && !/^(no|n|nope|never ?mind|cancel|forget it)$/i.test(q)) return eventTurn(thread);
  if (hasAiKey() && (prev?.kind === "event_clarify" || prev?.kind === "event_confirm" || prev?.kind === "event_conflict" || prev?.kind === "event_move")) return { kind: "answer", text: "Okay, I won't add it.", cost: 0, costText: "no model used", model: "none", sample: false };

  // 1) Local, no model: short structured input.
  if (isStructuredInput(q) && !/\badd\b.*\b(medication|meds|melatonin|dentist|contact|birthday)\b/i.test(q)) {
    return structured(q);
  }

  if (!hasAiKey()) return sampleRoute(thread, q);

  // 2) Haiku decides what kind of input this is (one small call).
  const cls = await callModel({ job: "classify", feature: "ask-intent", maxTokens: 60, messages: [{ role: "user", content: `Classify this input to a family-management assistant. Reply with one word: question, instruction, clarify_reply, offscope, or event. Use event when the person wants something put on the calendar (an appointment, meeting, trip, reminder at a time, "remind me", "schedule", "put X on Friday"). Input: """${q}"""` }], system: SCOPE_SYSTEM_PROMPT });
  const intent = cls.text.trim().toLowerCase();
  if (intent.startsWith("event")) return eventTurn(thread);
  if (intent.startsWith("offscope")) return { kind: "scope_check", text: "Is this related to the family management system? If so, how?", chips: ["No, never mind"], ...costOf(cls) };

  // 3) Sonnet writes the answer or the confirmation line with only the relevant records.
  const context = await relevantRecords(q);
  const r = await callModel({ job: "chat", feature: "ask", messages: toMessages(thread), system: SCOPE_SYSTEM_PROMPT + `\n\nRelevant records (names, dates, links; never contents):\n${context}\n\nIf the input is an instruction, reply in exactly this form on one line: CONFIRM | <what you understood> | <Settings section or register> | <tier 1, 2 or 3> | <one missing fact, or none>. Tier 1: a note, a checklist item, a shop list item. Tier 2: a medication, a vehicle date, a contact, a rule, a notification, a record (a confirmation number for a reservation, ticket, claim, return, appointment; target "Records › <kind>"). Tier 3: money set-up, access, another person's settings.` });
  const total = cls.cost + r.cost;
  const base = { cost: total, costText: `this answer ~${formatCost(total)}`, model: r.model, sample: false };
  const m = r.text.match(/^CONFIRM\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(?:tier\s*)?([123])\s*\|\s*(.*)$/im);
  if (m) {
    const missing = m[4].trim().toLowerCase() === "none" ? undefined : m[4].trim();
    if (missing) return { kind: "clarify", text: missing, chips: CHILD.test(q) ? ["[Child 1]", "[Child 2]"] : undefined, ...base };
    return { kind: "instruction", text: `${m[1]} → ${m[2]}. Confirm?`, confirm: { summary: m[1], target: m[2], tier: Number(m[3]) as Tier }, ...base };
  }
  const src = r.text.match(/^Source:\s*(.+)$/im);
  const text = r.text.replace(/^Source:.*$/im, "").trim();
  if (/i (don'?t|do not) (know|have)|couldn'?t find|not sure/i.test(text) && text.length < 220) return { kind: "inbox", text: `${text}\n\nSaved to Inbox with your words; I'll ask the one thing I'm missing there.`, source: { label: "Inbox", href: "/inbox" }, ...base };
  return { kind: "answer", text, source: src ? { label: src[1].trim(), href: "#" } : undefined, ...base };
}

// ---- helpers ----
function toMessages(thread: Turn[]): Message[] {
  return thread.map((t) => ({ role: t.role, content: t.text }));
}
function costOf(r: { cost: number; model: string; sample: boolean }) {
  return { cost: r.cost, costText: `this answer ~${formatCost(r.cost)}`, model: r.model, sample: r.sample };
}
function topic(q: string) {
  if (/cook|recipe|boil|bake/i.test(q)) return "Cooking";
  if (/math|history|science|essay|homework/i.test(q)) return "School-subject";
  if (/weather|rain|snow/i.test(q)) return "Weather";
  return "General";
}
function deflect(app: string): AskReply {
  return { kind: "deflect", text: "That's beyond what this system does. For general questions, use your regular assistant app.", source: { label: `Open in ${app}`, href: app === "ChatGPT" ? "https://chatgpt.com" : "https://claude.ai" }, cost: 0, costText: "no model used", model: "none", sample: !hasAiKey() };
}
function structured(q: string): AskReply {
  const l = q.toLowerCase();
  let text = "Done.";
  let source: AskReply["source"] | undefined;
  if (/^(y|yes|ok)$/.test(l)) text = "Confirmed and saved.";
  else if (/^(n|no)$/.test(l)) text = "Okay, nothing changed.";
  else if (/^later|^snooze/.test(l)) text = "Snoozed until tomorrow morning.";
  else if (/^done/.test(l)) text = "Marked done.";
  else if (/^undo/.test(l)) text = "Undone.";
  else if (/what'?s due/.test(l)) { text = "Due this week: Internet $79.99 (Tue), Amex close (Thu), field-trip form (Fri)."; source = { label: "Open in Tasks", href: "/tasks" }; }
  else if (/who'?s driving/.test(l)) { text = "Thursday: Melissa has the Sienna (practice at 4). Ryan has the Tahoe."; source = { label: "Open in Calendar", href: "#" }; }
  else if (/^show /.test(l)) { text = `Here it is: "${q.replace(/^show /i, "")}" is a 1Password item. Opens behind your own unlock.`; source = { label: "Open in 1Password", href: "#" }; }
  else if (/^turn (on|off)/.test(l)) { text = `${q} → Settings › Notifications. Confirm?`; return { kind: "instruction", text, confirm: { summary: q, target: "Settings › Notifications", tier: 2 }, cost: 0, costText: "no model used", model: "none", sample: !hasAiKey() }; }
  else if (/^mark /.test(l)) { text = `${q.replace(/^mark /i, "")} marked done.`; source = { label: "Open in Vehicles", href: "#" }; }
  else if (/^add /.test(l)) { const item = q.replace(/^add /i, ""); return { kind: "instruction", text: `Add "${item}" → Shop list. Saved.`, confirm: { summary: `Add ${item}`, target: "Shop list", tier: 1 }, source: { label: "Open in Shop", href: "#" }, cost: 0, costText: "no model used", model: "none", sample: !hasAiKey() }; }
  return { kind: "structured", text, source, cost: 0, costText: "no model used (recognised locally)", model: "none", sample: !hasAiKey() };
}

async function relevantRecords(q: string): Promise<string> {
  const lines: string[] = [];
  if (/task|today|need|due|email|reply/i.test(q)) {
    const tasks = await getOpenTasks();
    lines.push("Open tasks: " + tasks.map((t) => `${t.kind}: ${t.title}${t.due_at ? ` (due ${shortDate(t.due_at.slice(0, 10))})` : ""}`).join("; "));
  }
  if (/calendar|schedule|appointment|meeting|today|tomorrow|week|weekend|free|busy|when|what'?s on|coming up|saturday|sunday|monday|tuesday|wednesday|thursday|friday/i.test(q)) {
    try {
      const evs = await getCalendarEvents(undefined, 14);   // real events, live from Google (D72)
      lines.push("Calendar, next 14 days (live from Google): " + (evs.length ? evs.map((e) => `${e.date}${e.allDay ? " all day" : e.start ? ` ${e.start}${e.end ? `–${e.end}` : ""}` : ""} ${e.title}${e.place ? ` @ ${e.place}` : ""} [${e.person}]`).join("; ") : "nothing scheduled"));
    } catch { /* the answer just won't have calendar facts */ }
  }
  if (/pay|paid|cost|spent|spend|charge|receipt|money|card|amex|visa|bill|subscription/i.test(q)) {
    lines.push("Recent charges: " + sampleTransactions.slice(0, 6).map((t) => `${t.merchant} ${money(t.amount)} ${shortDate(t.date)} (${t.status})`).join("; "));
    lines.push("Recurring: " + sampleRecurring.map((r) => `${r.name} ${money(r.amount)}/${r.cycle} next ${shortDate(r.next_charge)}`).join("; "));
    lines.push("Reconciliations: " + sampleReconciliations.map((r) => `${r.period} ${r.account_id} ${r.status}, ${r.to_explain} to explain`).join("; "));
  }
  if (/registration|title|insurance|card|passport|document|where/i.test(q)) lines.push("Vault item names (1Password): Sienna registration 2026; Tahoe registration 2026; Auto insurance cards; [Child 1] insurance card. Organized: Personal/Documents/Vehicles/{Sienna,Tahoe}.");
  if (/filter|furnace|home|house/i.test(q)) lines.push("Home register: furnace filter 16x25x1 MERV 11, last replaced [DATE], usual source [Store], usual price $[PRICE].");
  return lines.join("\n") || "(no records matched the question)";
}

// ---- sample mode: keyword routing so preview feels like the real thing ----
async function sampleRoute(thread: Turn[], q: string): Promise<AskReply> {
  const l = q.toLowerCase();
  const prev = [...thread].reverse().find((t) => t.role === "assistant");
  const classify = await callModel({ job: "classify", feature: "ask-intent", messages: [{ role: "user", content: q }] });

  // Answering a clarify question ("Which child?") finishes the instruction with a confirm card.
  if (prev?.kind === "clarify") {
    const original = [...thread].reverse().find((t) => t.role === "user" && t.text !== q)?.text ?? "";
    const chat = await callModel({ job: "chat", feature: "ask", messages: toMessages(thread) });
    const summary = `${original.replace(/^add /i, "Add ")} for ${q}`;
    return { kind: "instruction", text: `${summary} → Settings › Health › ${q}. Confirm?`, confirm: { summary, target: `Settings › Health › ${q}`, tier: 2 }, ...costOf({ cost: classify.cost + chat.cost, model: chat.model, sample: true }) };
  }

  const answer = async (reply: Omit<AskReply, "cost" | "costText" | "model" | "sample">): Promise<AskReply> => {
    const chat = await callModel({ job: "chat", feature: "ask", messages: toMessages(thread) });
    return { ...reply, ...costOf({ cost: classify.cost + chat.cost, model: chat.model, sample: true }) };
  };

  if (/needs? me|what.*today|today\?/.test(l)) {
    const tasks = (await getOpenTasks()).filter((t) => t.kind !== "fyi");
    return answer({ kind: "answer", text: `${tasks.length} things need you today:\n` + tasks.map((t, i) => `${i + 1}. ${t.title}${t.due_at ? ` (due ${shortDate(t.due_at.slice(0, 10))})` : ""}`).join("\n") + "\n\nMoney: 2 receipts missing, Amex close due Thursday.", source: { label: "Open in Tasks", href: "/tasks" }, chips: ["Open the first one", "Snooze the laptop one"] });
  }
  if (/\b(save|keep|record)\b.*\b(confirmation|conf|booking|reservation|rma|claim)\b/.test(l)) {
    const num = q.match(/\b(?:confirmation|conf|number|#)\s*#?\s*([A-Z0-9-]{4,})\b/i)?.[1] ?? q.match(/\b[A-Z0-9]{5,}\b/)?.[0] ?? "[NUMBER]";
    const forWhat = q.match(/\bfor ((?:the )?.+?)(?:\s+(?:on|at|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct)\b.*)?$/i)?.[1] ?? "[what]";
    const when = q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i)?.[0] ?? "";
    const kind = /hotel|flight|camp|rental|restaurant|beach/.test(l) ? "reservation" : /rma|return/.test(l) ? "warranty_return" : /claim/.test(l) ? "insurance_claim" : /tax|dmv|permit/.test(l) ? "government" : "reservation";
    const summary = `Save confirmation ${num} for ${forWhat}${when ? `, ${when}` : ""}`;
    return answer({ kind: "instruction", text: `${summary} → Records › ${kind.replace("_", " ")} (kept until ${/reservation/.test(kind) ? "stay end + 30 days" : "needed-until"}; shows on the calendar event as a chip). Confirm?`, confirm: { summary, target: `Records › ${kind.replace("_", " ")}`, tier: 2 }, source: { label: "Open in Records", href: "/records" } });
  }
  if (/\b(medication|meds|melatonin|dose|ml|mg)\b/.test(l) && /\badd\b/.test(l)) {
    const child = q.match(/\[child \d\]/i)?.[0];
    const when = q.match(/\b(at|every)\s+[\w: ]+?(am|pm|day|night|morning)\b/i)?.[0] ?? "";
    if (!child) return answer({ kind: "clarify", text: "Which child?", chips: ["[Child 1]", "[Child 2]"] });
    const summary = `Add melatonin${when ? ` ${when}` : ""} for ${child}`;
    return answer({ kind: "instruction", text: `${summary} → Settings › Health › ${child}. Confirm?`, confirm: { summary, target: `Settings › Health › ${child}`, tier: 2 } });
  }
  if (/\b(registration|title|insurance card|passport)\b/.test(l) && /\b(where|find|show|send|deliver)\b/.test(l)) {
    const v = /tahoe/.test(l) ? "Tahoe" : "Sienna";
    const what = /title/.test(l) ? "title" : /insurance/.test(l) ? "insurance card" : /passport/.test(l) ? "passport" : "registration";
    return answer({ kind: "answer", text: `The ${v} ${what} is a 1Password item ("${v} ${what} 2026"), with a paper copy in the glove box. Tap to open it behind your own unlock, or I can send it to your phone.`, source: { label: "Open in 1Password", href: "#" }, chips: ["Send to my phone", "Attach it to the insurance reply"] });
  }
  if (/\bfilter\b|merv/.test(l)) {
    return answer({ kind: "instruction", text: "Found it in the Home register: furnace filter 16x25x1 MERV 11, last replaced [DATE], usually from [Store] at $[PRICE]. Add a reorder to the Shop list → Shop. Confirm?", confirm: { summary: "Reorder furnace filter 16x25x1 MERV 11 (×1)", target: "Shop list", tier: 1 }, source: { label: "Open in Home register", href: "#" } });
  }
  if (/\b(turn off|stop telling|stop reminding|mute)\b/.test(l)) {
    return answer({ kind: "instruction", text: `${q} → Settings › Notifications (your own). Confirm?`, confirm: { summary: q, target: "Settings › Notifications", tier: 2 } });
  }
  if (/\b(share|access|let .* see|melissa'?s|password|account number)\b/.test(l) && /\b(add|change|give|turn|show)\b/.test(l)) {
    return answer({ kind: "instruction", text: `${q} → Settings › People and access. This changes someone else's access, so it needs an explicit confirm (and Melissa's, where the Change Log says so).`, confirm: { summary: q, target: "Settings › People and access", tier: 3 } });
  }
  if (/\b(add|new)\b.*\b(contact|dentist|doctor|birthday|grandma|coach)\b/.test(l)) {
    const target = /birthday/.test(l) ? "People and dates" : "Contacts";
    return answer({ kind: "instruction", text: `${q} → Settings › ${target}. Confirm?`, confirm: { summary: q, target: `Settings › ${target}`, tier: 2 } });
  }
  if (/\b(paid|pay|cost|spent|spend|charge|roofer|how much)\b/.test(l)) {
    const t = sampleTransactions[0];
    return answer({ kind: "answer", text: `Last matching record: ${t.merchant} ${money(t.amount)} on ${shortDate(t.date)} (Amex ••1004), receipt still missing. Month to date you've spent $1,318 against a typical $1,546. Nothing is paid from here; I can prepare a task if something needs paying.`, source: { label: "Open in Money", href: "/money" }, chips: ["Show this month", "What's unmatched?"] });
  }
  if (/\b(free|busy|appointment|dentist|when is|schedule|practice|saturday|sunday|weekend)\b/.test(l)) {
    return answer({ kind: "answer", text: "Saturday afternoon: Ryan free from 1 pm; Melissa has [Activity] with [Child 2] until 3 pm; [Child 1] free. Next dentist visit on record: [Child 1], [DATE] 3:30 pm at [Dentist].", source: { label: "Open in Calendar", href: "#" }, chips: ["Add something Saturday 1 pm", "Who's driving?"] });
  }
  if (/\b(weather|rain|snow|cold|hot)\b/.test(l)) {
    return answer({ kind: "answer", text: "Tomorrow: 54° and rain from 2 pm. [Child 1]'s practice at 4 pm is outdoors, so the checklist adds a rain jacket. Nothing else on the schedule is affected.", source: { label: "Open in Today", href: "/" }, chips: ["Stop telling me about rain"] });
  }
  if (/\b(subscription|recurring|cancel|streaming)\b/.test(l)) {
    return answer({ kind: "answer", text: `7 recurring items on the register, $399 a month. Up for review: [Streaming service] (price went to $15.99) and [Fitness app] (not on the register yet). Cancelling is a prepared task; it happens outside the dashboard.`, source: { label: "Open in Money › Subscriptions", href: "/money/subscriptions" }, chips: ["Prepare the cancel for [Design tool seat]"] });
  }
  if (!FAMILY_WORDS.test(q)) {
    return { kind: "scope_check", text: "Is this related to the family management system? If so, how?", chips: ["It's for a planned trip", "It's for a school assignment", "No, never mind"], ...costOf(classify) };
  }
  // In scope but nothing matched: never guess; park it with the person's own words.
  return answer({ kind: "inbox", text: "I couldn't place this with confidence, so I won't guess. Saved to Inbox with your exact words; it will ask one question there and finish from where we left off.", source: { label: "Open in Inbox", href: "/inbox" }, chips: ["File a document", "Add an appointment", "Add a bill"] });
}

function sampleGeneral(original: string) {
  return `Here's the short version for "${original.slice(0, 50)}": [answer written by the model when the API key is set]. I've noted it on the trip's checklist.`;
}
