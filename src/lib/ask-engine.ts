// The Ask window's brain (F4, F18). Order of work, cheapest first:
// 1) structured input recognised locally (no model); 2) intent classified by Haiku; 3) the answer or the
// confirmation card written by Sonnet with only the relevant records; 4) off-scope questions get the
// one "is this related?" check before deflection. Without an API key the same shape is produced by
// keyword matching so the page feels real in preview.
import { callModel, callModelTools, formatCost, isStructuredInput, hasAiKey, SCOPE_SYSTEM_PROMPT, type Block, type Message, type ToolTurn } from "@/lib/ai";
import { TOOLS } from "@/lib/tools/registry";
import { toolSpec } from "@/lib/tools/types";
import { runTool, toolByName, toolCtx } from "@/lib/tools/run";
import { getOpenTasks } from "@/lib/data";
import { eventTurn } from "@/lib/ask-calendar";
import { sampleTransactions, money, shortDate } from "@/lib/data-money";   // preview only: the no-key path

export type Tier = 1 | 2 | 3;
export type EventDraft = { title: string | null; date: string | null; endDate: string | null; allDay: boolean; start: string | null; end: string | null; location: string | null; reminders: number[] | null; guests: string[] };
export type AskReply = {
  kind: "answer" | "instruction" | "clarify" | "scope_check" | "deflect" | "inbox" | "structured" | "event_clarify" | "event_confirm" | "event_conflict" | "event_move" | "tool_confirm";
  feedId?: string | null;                               // this proposal's row in the Assistant feed
  draft?: EventDraft;
  move?: { calendarId: string; id: string; title: string; date: string; oldStart: string; oldEnd: string; newStart: string; newEnd: string };   // an existing event to move first                                   // an event waiting for the person's Add tap
  text: string;
  source?: { label: string; href: string };            // "Open in …"
  items?: AskItem[];                                    // things a read tool found, each with somewhere to go
  trace?: { name: string; args: Record<string, unknown>; ok: boolean; summary: string }[];   // every read the loop made, for the eval runner and for a thumbs-down report
  confirm?: { summary: string; target: string; tier: Tier; missing?: string };
  tool?: { name: string; title: string; args: Record<string, unknown>; tier: Tier };   // a write the person has not agreed to yet
  chips?: string[];                                     // suggested next taps
  scopeRule?: string;                                   // learned when the person connects an off-scope question
  cost: number; costText: string; model: string; sample: boolean;
};
export type Turn = { role: "user" | "assistant"; text: string; kind?: AskReply["kind"] };
// A row the person can act on. open delivers the thing itself (a file); href goes to its page in the app.
export type AskItem = { name: string; detail: string | null; href: string; open: string | null };

const FAMILY_WORDS = /\b(confirmation|reservation|hotel|flight|ticket|claim|warranty|return|record|today|tomorrow|week|schedule|calendar|appointment|dentist|doctor|school|practice|kid|child|son|daughter|ryan|melissa|tahoe|sienna|car|oil|registration|insurance|title|document|file|where|receipt|charge|paid|pay|cost|spent|spend|money|amex|visa|card|bill|subscription|statement|budget|medication|meds|melatonin|dose|device|laptop|serial|filter|furnace|home|house|yard|contact|grandma|birthday|task|email|reply|draft|inbox|setting|notification|rain|weather|trip|pack|checklist|shop|order|buy|need)\b/i;


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
  if (isStructuredInput(q)) return structured(q, thread);

  if (!hasAiKey()) return sampleRoute(thread, q);

  // 2) Haiku decides what kind of input this is (one small call).
  const cls = await callModel({ job: "classify", feature: "ask-intent", maxTokens: 60, messages: [{ role: "user", content: `Classify this input to a family-management assistant. Reply with one word: question, instruction, clarify_reply, offscope, or event. Use event only when the person wants something on the calendar AND names a day or time (an appointment, meeting, trip, "remind me at 3", "schedule for Friday", "put X on the 14th"). "Remind me to X" or "add X" with no day or time is an instruction (it becomes a task), not an event. Input: """${q}"""` }], system: SCOPE_SYSTEM_PROMPT });
  const intent = cls.text.trim().toLowerCase();
  if (intent.startsWith("event")) return eventTurn(thread);
  if (intent.startsWith("offscope")) return { kind: "scope_check", text: "Is this related to the family management system? If so, how?", chips: ["No, never mind"], ...costOf(cls) };

  // 3) Sonnet, with the registry attached (D80). It reads with the read tools as often as it needs, and the
  // first tool that would CHANGE something stops the loop and comes back as a card for the person to agree
  // to. Nothing is written here. An instruction with no tool behind it is answered honestly rather than
  // confirmed and dropped, which is what the old regex route did.
  const ctx = await toolCtx();
  const specs = TOOLS.map(toolSpec);
  const system = SCOPE_SYSTEM_PROMPT + `

You have tools for the things this household's app can do. Today is ${ctx?.today ?? "unknown"} in ${ctx?.tz ?? "the household's time zone"}.
- Look things up with the read tools before answering. Never guess a number, a date or a name you have not read.
- Before adding anything, search for it first: say so if something close already exists, rather than making a second one.
- A tool that changes something is not run by you; the person sees what you chose and agrees to it. Say in one line what you are about to do.
- Once you have what a write needs, call the write tool: the confirm card is the question. Do not describe the change and ask "shall I?" in prose; that makes the person agree twice.
- If what they asked for has no tool, say plainly that you cannot do it from here and use app.findPage to name the page where they can. Never say you have saved or changed something.
- Features are added by the maintainer only. When someone asks for a new feature or for the system to work differently, offer to file it with issue.report as an idea; never promise or describe a change as done.
- People's access, children's settings, money accounts and household configuration are changed on their Settings pages by the head of household, not from here.
- Short answers. Names, dates and links, never the contents of documents.
- Give the person exactly what they asked for, not everything that matched. "The latest", "the most recent", "the" one thing means one: narrow the search (limit 1, a date range, more words) until one comes back. If several could be meant and the words do not settle it (which vehicle, which year, which of two vendors), ask one short question instead of listing them all; a list is for "what do we have".
- The person sees the rows from your LAST search only, so finish with the search that returns just what they meant.`;

  const turns: ToolTurn[] = toMessages(thread) as ToolTurn[];
  let spend = cls.cost;
  let saidLast = "";
  // Anything a read tool found that has somewhere to go is carried to the person as a row, not as prose:
  // the model's text says what was found, the rows are how they get to it. Without this the find was
  // honest but useless -- "AAA, Oct 11, $242.88" with no way to open it.
  let items: AskItem[] = [];
  const trace: NonNullable<AskReply["trace"]> = [];
  const keep = (out: unknown) => {
    const data = (out as { ok?: boolean; data?: unknown })?.data;
    if (!Array.isArray(data)) return;
    for (const d of data as Record<string, unknown>[]) {
      if (typeof d?.href !== "string" || typeof d?.name !== "string") continue;
      if (items.some((x) => x.href === d.href && x.name === d.name)) continue;
      const detail = [d.date, typeof d.amount === "number" ? `$${d.amount.toFixed(2)}` : null, typeof d.where === "string" ? d.where : null].filter((x): x is string => typeof x === "string" && !!x).join(" · ");
      items.push({ name: d.name, detail: detail || null, href: d.href, open: typeof d.open === "string" ? d.open : null });
    }
  };
  for (let round = 0; round < 4; round++) {
    const r = await callModelTools({ job: "chat", feature: "ask", messages: turns, system, tools: specs, maxTokens: 1200 });
    spend += r.cost;
    saidLast = r.text || saidLast;
    const base2 = { cost: spend, costText: `this answer ~${formatCost(spend)}`, model: r.model, sample: r.sample };
    if (!r.calls.length) return { kind: "answer", text: r.text.trim() || "I could not work that one out.", items: items.length ? items.slice(0, 12) : undefined, trace, ...base2 };

    const write = r.calls.find((cl) => toolByName(cl.name)?.kind === "write");
    if (write) {
      const t = toolByName(write.name)!;
      return { kind: "tool_confirm", text: r.text.trim() || `${t.title}. Confirm?`, tool: { name: t.name, title: t.title, args: write.input, tier: t.tier }, items: items.length ? items.slice(0, 12) : undefined, trace, ...base2 };
    }

    turns.push({ role: "assistant", content: r.blocks });
    // Each round replaces the rows: when the model searches wide, then narrows to the one thing the person
    // meant, only the narrow result reaches them. Otherwise "the latest AAA receipt" showed all four.
    items = [];
    const results: Block[] = [];
    for (const cl of r.calls) {
      const out = ctx ? await runTool(cl.name, cl.input, ctx) : { ok: false as const, error: "Not signed in." };
      keep(out);
      trace.push({ name: cl.name, args: cl.input, ok: (out as { ok: boolean }).ok, summary: ((out as { summary?: string; error?: string }).summary ?? (out as { error?: string }).error ?? "").slice(0, 200) });
      results.push({ type: "tool_result", tool_use_id: cl.id, content: JSON.stringify(out).slice(0, 6000) });
    }
    turns.push({ role: "user", content: results });
  }
  // Out of rounds. One last call with no tools, so the person gets what was found ("no task about X is
  // open") rather than a shrug. Before this, six searches that found nothing ended in "that took more
  // looking up than I can do", which told them nothing.
  turns.push({ role: "user", content: "Stop looking. Answer now, in two or three sentences, from what you have found so far. If you found nothing, say what you looked for and that it is not there." });
  // The tools stay attached (the API requires them once tool blocks are in the thread); the instruction is what stops the looking.
  const wrap = await callModelTools({ job: "chat", feature: "ask", messages: turns, system, tools: specs, maxTokens: 400 });
  spend += wrap.cost;
  const base3 = { cost: spend, costText: `this answer ~${formatCost(spend)}`, model: wrap.model, sample: wrap.sample };
  return { kind: "answer", text: (wrap.text || saidLast).trim() || "I could not find that.", items: items.length ? items.slice(0, 12) : undefined, trace, ...base3 };
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
function structured(q: string, thread: Turn[]): AskReply {
  const l = q.toLowerCase().trim();
  const prev = [...thread].reverse().find((t) => t.role === "assistant");
  const waiting = prev?.kind === "tool_confirm" || prev?.kind === "clarify" || prev?.kind === "instruction";
  const base = { cost: 0, costText: "no model used (recognised locally)", model: "none", sample: false };

  // Nothing here writes. The confirm card is what writes, through runTool, so a "yes" points at the
  // card rather than claiming the change is done. Before D91 this said "Confirmed and saved." while
  // saving nothing, and did the same for done / snooze / undo.
  if (/^(y|yes|ok)$/.test(l))
    return { ...base, kind: "answer", text: waiting
      ? "It is waiting on you \u2014 tap Do it on the card above and I will make the change."
      : "Nothing is waiting on an answer right now." };

  if (/^(n|no)$/.test(l))
    return { ...base, kind: "answer", text: waiting ? "Okay, nothing changed." : "Nothing is waiting on an answer right now." };

  // later / snooze / done / undo have to name something. There is no tool behind them yet, so say so.
  return { ...base, kind: "answer",
    text: `Which one? "${q.trim()}" on its own does not say what to change. Name it \u2014 "mark the Sienna oil change done" \u2014 or do it on Tasks.`,
    chips: ["What needs me today?"] };
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
