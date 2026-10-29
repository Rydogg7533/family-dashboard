// Suggestion engine for Messages (decisions log 2026-10-29d): one short Haiku call per inbound line, at most one chip.
// Pure functions plus one network call; the mirror owns the loop. Nothing here creates, sends or shows anything.
//
//   judge({ line, context, household, today, tz }) → { kind, confidence, title, payload, reason, usage }
//   decide(judgment, bars)                          → "shown" | "hidden"
//
// Rules: suggest rarely, never ask. A chip is only worth showing when the person would plausibly have made the task,
// event, reply or claim themselves; small talk, acknowledgements and the person's own lines are "none".

const API = "https://api.anthropic.com/v1/messages";
export const MODEL = "claude-haiku-5-5";
export const DEFAULT_BAR = 0.8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function systemPrompt({ today, tz, household }) {
  return `You read one new text message in a family group chat and decide whether the app should offer ONE small action chip.
Today is ${today} (${tz}). The reader is ${household.me}. Household members: ${household.members.join(", ")}.
${household.hints ? `Household facts you may use: ${household.hints}\n` : ""}
Reply with JSON only:
{"kind":"task|calendar|reply|receipt|none","confidence":0.0-1.0,"title":"short chip label","payload":{...},"reason":"one short line"}

kind rules:
- task: someone (the reader, usually) must do something concrete and it is not already done. payload {"title","due_at":"ISO or null","for":"name or null"}.
- calendar: a specific time or day for the household to be somewhere; prefer this over task when there is a start time. payload {"title","start":"ISO","end":"ISO or null","where":"text or null"}.
- reply: the line asks a question the household data can answer (a time, a code, whether something was paid, where something is) AND you were given the answer in the facts. payload {"text":"the reply, in the reader's voice, short"}. If the facts do not contain the answer, kind is none.
- receipt: the line reports money spent or owed for the household (amount or a receipt photo). payload {"amount":number or null,"merchant":"text or null","who":"name"}.
- none: chit-chat, logistics already settled, questions the reader must answer from their own head, anything ambiguous.

confidence is how likely the reader would have created exactly this themselves. Be strict: 0.9+ only for explicit asks with a clear what/when; 0.6-0.8 when the intent is clear but a detail is missing; under 0.5 for guesses. "Can you grab milk" from a spouse is a task at ~0.85. "Lol ok" is none at 0.99.
Never invent dates: if no day is said, due_at/start is null. Interpret "tomorrow", "Friday" relative to today in ${tz}.`;
}

export function userText({ line, context }) {
  const ctx = context.map((m) => `${m.sender}: ${m.text || `[${m.attachment?.kind || "attachment"}]`}`).join("\n");
  return `Earlier in this thread (oldest first):\n${ctx || "(nothing)"}\n\nNEW LINE from ${line.sender}:\n${line.text || `[${line.attachment?.kind || "attachment"}]`}`;
}

// One call, with one retry on bad JSON and backoff on 429/5xx. Never throws on a bad answer: returns kind none.
export async function judge({ key, line, context, household, today, tz }) {
  const started = Date.now();
  let retried = false, inTok = 0, outTok = 0;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 300, system: systemPrompt({ today, tz, household }), messages: [{ role: "user", content: userText({ line, context }) }] }) });
    if (res.status === 429 || res.status >= 500) { await sleep(1500 * attempt); continue; }
    const j = await res.json();
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${j?.error?.message || "error"}`);
    inTok += j.usage?.input_tokens || 0; outTok += j.usage?.output_tokens || 0;
    const text = (j.content || []).map((c) => c.text || "").join("");
    let out; try { out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { out = null; }
    if (!out && !retried) { retried = true; continue; }
    return normalize(out, { inTok, outTok, latencyMs: Date.now() - started });
  }
  return normalize(null, { inTok, outTok, latencyMs: Date.now() - started });
}

const KINDS = new Set(["task", "calendar", "reply", "receipt", "none"]);
export function normalize(out, usage) {
  const kind = KINDS.has(out?.kind) ? out.kind : "none";
  const c = Number(out?.confidence); const confidence = Number.isFinite(c) ? Math.min(1, Math.max(0, Math.round(c * 100) / 100)) : 0;
  return { kind, confidence, title: kind === "none" ? null : String(out?.title || "").slice(0, 80) || null,
    payload: kind === "none" ? {} : (out?.payload && typeof out.payload === "object" ? out.payload : {}), reason: String(out?.reason || "").slice(0, 160), usage };
}

// Shown only above the household's bar for that kind. "none" is never shown.
export function decide(j, bars) {
  if (j.kind === "none" || !j.title) return "hidden";
  const bar = Number(bars?.[j.kind] ?? DEFAULT_BAR);
  return j.confidence >= bar ? "shown" : "hidden";
}

// The bar learns: a taken chip lowers it a little, an ignored one raises it, within [0.55, 0.97].
export function nextBar(bar, outcome) {
  const b = Number(bar ?? DEFAULT_BAR);
  const n = outcome === "taken" ? b - 0.03 : outcome === "ignored" ? b + 0.04 : b;
  return Math.min(0.97, Math.max(0.55, Math.round(n * 100) / 100));
}
