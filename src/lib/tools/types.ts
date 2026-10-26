import "server-only";
import type { createClient } from "@/lib/supabase/server";

// Every action the app can take is declared once, here, as a tool (D80). The Ask box reads this registry,
// and so do the buttons: there is no second way to write. That is the point — a feature added as a tool is
// in Ask the same day, and a feature added any other way is a bug, because the two would drift.

export type Tier = 1 | 2 | 3;   // 1 saves with Undo · 2 one-line confirm · 3 explicit confirm (F2)

export type ToolField = {
  type: "string" | "number" | "boolean" | "date" | "enum";
  describe: string;             // what the model is told this argument means
  options?: string[];           // enum only
  required?: boolean;
};

export type ToolCtx = {
  sb: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string;
  isOwner: boolean;
  today: string;                // the household's day, never the server's
  tz: string;
};

export type ToolResult =
  | { ok: true; summary: string; data?: unknown; href?: string }
  | { ok: false; error: string };

export type Tool = {
  name: string;                 // domain.verb — "device.add", "task.find"
  title: string;                // shown to a person on the confirm card
  kind: "read" | "write";       // a read runs inside the loop; a write stops and asks first
  tier: Tier;                   // writes only; what the confirm card looks like
  ownerOnly?: boolean;
  description: string;          // what the model reads to decide
  input: Record<string, ToolField>;
  run: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<ToolResult>;
};

// The registry's own shape, as the Messages API wants it.
export function toolSpec(t: Tool) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [k, f] of Object.entries(t.input)) {
    properties[k] = f.type === "enum" ? { type: "string", enum: f.options ?? [], description: f.describe }
      : f.type === "date" ? { type: "string", description: `${f.describe} (YYYY-MM-DD)` }
      : { type: f.type, description: f.describe };
    if (f.required) required.push(k);
  }
  return { name: t.name.replace(".", "_"), description: `${t.description}${t.kind === "write" ? " This changes something." : ""}`, input_schema: { type: "object", properties, required } };
}

export const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export const num = (v: unknown) => (typeof v === "number" ? v : Number(str(v)));
