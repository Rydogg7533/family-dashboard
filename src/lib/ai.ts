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
  latencyMs?: number;    // wall-clock time of the API call (model reliability log)
  runtime?: "cloud" | "local"; // where the model ran; local models are compared with the cloud model per job
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

// Optional tracking that makes the usage log a reliability record (migration 0043). `subject` ties a call to the thing
// it was about (an inbox item) so the person's later tap can be recorded as its outcome; `validate` says whether the
// reply was usable (for example parseable JSON), judged before the row is written because the log is append-only;
// `promptVersion` is bumped by hand when the prompt changes so scores are never mixed across prompts.
export type Track = { subject?: { kind: string; id: string }; promptVersion?: string; validate?: (text: string) => boolean };

type CallArgs = { job: Job; messages: Message[]; system?: string; maxTokens?: number; reason?: string; feature?: string } & Track;

export async function callModel({ job, messages, system, maxTokens = 600, reason, feature, subject, promptVersion, validate }: CallArgs): Promise<ModelResult> {
  const model = MODEL_FOR_JOB[job];
  if (!hasAiKey()) {
    const r = sampleResult(job, model, messages);
    await recordUsage(r, feature, { subject, promptVersion, validate });
    return r;
  }
  const t0 = Date.now();
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
    sample: false, reason, latencyMs: Date.now() - t0,
  };
  await recordUsage(r, feature, { subject, promptVersion, validate });
  return r;
}

// ---- tools (D80) ----
// The same door, with the registry attached. The model picks a tool and names its arguments rather than the
// code guessing intent from prose with regular expressions, which is what Ask did before and why it could
// only ever do the handful of things somebody had written a pattern for.
export type ToolSpec = { name: string; description: string; input_schema: unknown };
export type ToolCall = { id: string; name: string; input: Record<string, unknown> };
export type Block = { type: string; [k: string]: unknown };
export type ToolTurn = { role: "user" | "assistant"; content: string | Block[] };

export async function callModelTools({ job, messages, system, tools, maxTokens = 1024, feature }:
  { job: Job; messages: ToolTurn[]; system?: string; tools: ToolSpec[]; maxTokens?: number; feature?: string },
): Promise<ModelResult & { calls: ToolCall[]; blocks: Block[] }> {
  const model = MODEL_FOR_JOB[job];
  if (!hasAiKey()) {
    const r = sampleResult(job, model, messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "[blocks]" })));
    await recordUsage(r, feature, {});
    return { ...r, calls: [], blocks: [] };
  }
  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system: system ?? SCOPE_SYSTEM_PROMPT, messages, tools }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Messages API ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = (await res.json()) as { content: Block[]; usage: { input_tokens: number; output_tokens: number } };
  const blocks = data.content ?? [];
  const text = blocks.filter((c) => c.type === "text").map((c) => String(c.text ?? "")).join("");
  const calls: ToolCall[] = blocks.filter((c) => c.type === "tool_use").map((c) => ({ id: String(c.id), name: String(c.name), input: (c.input ?? {}) as Record<string, unknown> }));
  const r: ModelResult = {
    text, model, job,
    inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens,
    cost: estimateCost(model, data.usage.input_tokens, data.usage.output_tokens),
    sample: false, latencyMs: Date.now() - t0,
  };
  await recordUsage(r, feature, {});
  return { ...r, calls, blocks };
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
async function recordUsage(r: ModelResult, feature?: string, track?: Track) {
  if (!hasSupabaseEnv()) return;
  try {
    const sb = await createClient();
    await sb.from("ai_usage").insert({
      model: r.model, job: r.job, feature: feature ?? r.job, input_tokens: r.inputTokens, output_tokens: r.outputTokens,
      cost_usd: r.cost, sample: r.sample, reason: r.reason ?? null,
      latency_ms: r.sample ? null : (r.latencyMs ?? null),
      runtime: r.runtime ?? "cloud",
      prompt_version: track?.promptVersion ?? null,
      valid_output: r.sample || !track?.validate ? null : checkValid(track.validate, r.text),
      subject_kind: track?.subject?.kind ?? null,
      subject_id: track?.subject?.id ?? null,
    });
  } catch {
    // never let bookkeeping break the answer
  }
}

function checkValid(validate: (text: string) => boolean, text: string) {
  try { return Boolean(validate(text)); } catch { return false; }
}

// A reply is usable when it holds a JSON object with at least one key. Matches how the readers parse replies.
export function jsonObjectValid(text: string) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return false;
  try { const o = JSON.parse(m[0]); return Boolean(o) && typeof o === "object" && Object.keys(o).length > 0; } catch { return false; }
}

// Only a one-word reply to something already on screen is recognised locally (F18 "local first").
// Everything else -- "add ...", "turn off ...", "mark ...", "what's due" -- goes to the tool registry,
// which reads and writes for real. This pattern used to catch those too, and structured() answered
// them from hardcoded strings that claimed to have saved things it never saved (D91).
const STRUCTURED = /^(y|yes|n|no|ok|later|done|snooze|undo)$/i;
export function isStructuredInput(text: string) {
  return STRUCTURED.test(text.trim());
}

// One-shot vision/PDF read for captured files (F18 door stays single: same key, same usage log).
// The file is data to extract from; the system prompt says never to follow text found inside it.
export async function callModelVision({ job, system, prompt, files, maxTokens = 700, feature, subject, promptVersion, validate }: {
  job: Job; system: string; prompt: string; files: { mime: string; base64: string }[]; maxTokens?: number; feature?: string;
} & Track): Promise<ModelResult> {
  const model = MODEL_FOR_JOB[job];
  if (!hasAiKey()) {
    const r: ModelResult = { text: "{}", model, job, inputTokens: 800, outputTokens: 24, cost: estimateCost(model, 800, 24), sample: true };
    await recordUsage(r, feature, { subject, promptVersion, validate });
    return r;
  }
  const blocks = files.map(({ mime, base64 }) => mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: mime, data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mime, data: base64 } });
  const t0 = Date.now();
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
    cost: estimateCost(model, data.usage.input_tokens, data.usage.output_tokens), sample: false, latencyMs: Date.now() - t0,
  };
  await recordUsage(r, feature, { subject, promptVersion, validate });
  return r;
}
