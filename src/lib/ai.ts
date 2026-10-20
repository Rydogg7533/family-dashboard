// The single door to the Claude API (F18). Every slice imports callModel; nobody calls the API directly.
// Routing: the smallest model that does the job. Haiku for classify/extract/file, Sonnet for anything
// written for a person, Opus only for jobs marked important or flagged low-confidence (each use logged).
// Without ANTHROPIC_API_KEY the call returns a deterministic sample reply tagged { sample: true } so
// every page works in preview. Cost is recorded and shown, never enforced (Ryan, 2026-10-18).

import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export type Job = "classify" | "extract" | "file" | "chat" | "draft" | "summarize" | "flagged" | "complex";
export type ModelId = "claude-haiku-5-5" | "claude-sonnet-5-5" | "claude-opus-5-5";
export type Message = { role: "user" | "assistant"; content: string };

export type ModelResult = {
  text: string;
  model: ModelId;
  job: Job;
  inputTokens: number;
  outputTokens: number;
  cost: number;          // US dollars, estimated from the price table below
  sample: boolean;       // true when no API key is set
  reason?: string;       // required for opus jobs: why the strongest model was used
};

export const MODEL_FOR_JOB: Record<Job, ModelId> = {
  classify: "claude-haiku-5-5",
  extract: "claude-haiku-5-5",
  file: "claude-haiku-5-5",
  chat: "claude-sonnet-5-5",
  draft: "claude-sonnet-5-5",
  summarize: "claude-sonnet-5-5",
  flagged: "claude-opus-5-5",
  complex: "claude-opus-5-5",
};

// Price per million tokens, [input, output]. ESTIMATES used for the cost line; the real figures are
// checked against current API pricing at go-live (F18: "not assumed now"). Edit here, nowhere else.
export const PRICE_PER_MTOK: Record<ModelId, [number, number]> = {
  "claude-haiku-5-5": [1, 5],
  "claude-sonnet-5-5": [3, 15],
  "claude-opus-5-5": [15, 75],
};

export function estimateCost(model: ModelId, inputTokens: number, outputTokens: number) {
  const [i, o] = PRICE_PER_MTOK[model];
  return (inputTokens * i + outputTokens * o) / 1_000_000;
}

export function formatCost(usd: number) {
  if (usd === 0) return "$0";
  if (usd < 0.001) return "<$0.001";
  return `$${usd.toFixed(3)}`;
}

export function hasAiKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// F18 scope rule. The assistant answers only what needs, or changes, something the family's records hold.
// Before deflecting it asks once; a connection becomes a scope rule; a "no" gets the fixed line and the
// person's own assistant app as a link. The question itself is never logged unless the person saves it.
export const SCOPE_SYSTEM_PROMPT = `You are the family's assistant inside the Family Dashboard. You help manage the family's affairs only.
IN SCOPE (the records this household keeps): schedules and calendar, documents and where they are filed, money (accounts by last four digits, charges, receipts, subscriptions, reconciliations), people and contacts, places, vehicles, home and property, devices, the asker's own health and medications (a child's for a parent), messages, tasks from email, and the dashboard's own settings.
The scope test: does answering need, or change, something the family's records hold? Borderline questions that touch a record ("how long will the Costco trip take from here", "what should the kids wear") are in scope. Pure general knowledge ("how long to boil an egg") is not.
OFF SCOPE: do not answer. Ask once, exactly: "Is this related to the family management system? If so, how?" If the person gives a connection, treat the question as in scope, answer it, and state the scope rule you learned in one short line (for example "cooking questions when a meal is planned"). If the person says no, or gives no connection, reply only: "That's beyond what this system does. For general questions, use your regular assistant app."
NEVER reveal or request passwords, account numbers, ID numbers or document contents; refer to vault items by name and offer "Open in 1Password" or "Open in Apple Passwords" instead.
Anything that would change something (add, change, turn off, book, send, pay, file) is never done directly: describe what you understood, where it will go (which Settings section or register), and anything missing, as a one-line confirmation. Ask only for what you cannot work out, one or two things at a time.
Answer in plain words, short, for a phone screen. Name where the answer came from in one line starting with "Source:".`;

type CallArgs = { job: Job; messages: Message[]; system?: string; maxTokens?: number; reason?: string; feature?: string };

export async function callModel({ job, messages, system, maxTokens = 600, reason, feature }: CallArgs): Promise<ModelResult> {
  const model = MODEL_FOR_JOB[job];
  if (!hasAiKey()) {
    const r = sampleResult(job, model, messages);
    await recordUsage(r, feature);
    return r;
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system: system ?? SCOPE_SYSTEM_PROMPT, messages }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Messages API ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = (await res.json()) as { content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number } };
  const text = data.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  const r: ModelResult = {
    text, model, job,
    inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens,
    cost: estimateCost(model, data.usage.input_tokens, data.usage.output_tokens),
    sample: false, reason,
  };
  await recordUsage(r, feature);
  return r;
}

// A deterministic stand-in: same input, same output, with token counts sized like a real call so the
// cost line on the page looks like the real thing.
function sampleResult(job: Job, model: ModelId, messages: Message[]): ModelResult {
  const last = messages[messages.length - 1]?.content ?? "";
  const inputTokens = 180 + Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4);
  const outputTokens = job === "classify" || job === "extract" || job === "file" ? 24 : 90;
  const text = job === "classify" ? "question" : job === "draft" ? `Sample draft (no API key): reply about "${last.slice(0, 40)}".` : `Sample reply (no API key set) to: ${last.slice(0, 80)}`;
  return { text, model, job, inputTokens, outputTokens, cost: estimateCost(model, inputTokens, outputTokens), sample: true };
}

// One row per call: model, purpose, tokens, cost (F18 "every call logs"). Sample calls are recorded too,
// flagged, so the cost page can show what a real month would look like. Failures never break the caller.
async function recordUsage(r: ModelResult, feature?: string) {
  if (!hasSupabaseEnv()) return;
  try {
    const sb = await createClient();
    await sb.from("ai_usage").insert({
      model: r.model, job: r.job, feature: feature ?? r.job, input_tokens: r.inputTokens, output_tokens: r.outputTokens,
      cost_usd: r.cost, sample: r.sample, reason: r.reason ?? null,
    });
  } catch {
    // never let bookkeeping break the answer
  }
}

// Short structured input is recognised locally and never reaches a model (F18 "local first").
const STRUCTURED = /^(y|yes|n|no|ok|later|done|snooze|undo)$|^(add|mark|show|what'?s due|who'?s driving|turn (on|off)|snooze)\b/i;
export function isStructuredInput(text: string) {
  return STRUCTURED.test(text.trim());
}

// One-shot vision/PDF read for captured files (F18 door stays single: same key, same usage log).
// The file is data to extract from; the system prompt says never to follow text found inside it.
export async function callModelVision({ job, system, prompt, files, maxTokens = 700, feature }: {
  job: Job; system: string; prompt: string; files: { mime: string; base64: string }[]; maxTokens?: number; feature?: string;
}): Promise<ModelResult> {
  const model = MODEL_FOR_JOB[job];
  if (!hasAiKey()) {
    const r: ModelResult = { text: "{}", model, job, inputTokens: 800, outputTokens: 24, cost: estimateCost(model, 800, 24), sample: true };
    await recordUsage(r, feature);
    return r;
  }
  const blocks = files.map(({ mime, base64 }) => mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: mime, data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mime, data: base64 } });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: [...blocks, { type: "text", text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Messages API ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = (await res.json()) as { content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number } };
  const r: ModelResult = {
    text: data.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join(""), model, job,
    inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens,
    cost: estimateCost(model, data.usage.input_tokens, data.usage.output_tokens), sample: false,
  };
  await recordUsage(r, feature);
  return r;
}
