import "server-only";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { householdTz, todayIso } from "@/lib/google-calendar";
import { TOOLS } from "@/lib/tools/registry";
import type { Tool, ToolCtx, ToolResult } from "@/lib/tools/types";

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name || t.name.replace(".", "_") === name);

// Who is asking, on the household's clock. Built once per request and handed to every tool, so no tool
// reads a clock or works out a permission for itself.
export async function toolCtx(): Promise<ToolCtx | null> {
  if (!hasSupabaseEnv()) return null;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const [today, tz] = await Promise.all([todayIso(), householdTz()]);
  return { sb, userId: user.id, email: user.email ?? "member", isOwner: prof?.role === "owner", today, tz };
}

// The only way a tool runs. Checks permission, fills in what is missing, runs it, and records who asked —
// so a change made by asking is as inspectable as one made by tapping.
export async function runTool(name: string, args: Record<string, unknown>, ctx?: ToolCtx | null): Promise<ToolResult> {
  const tool: Tool | undefined = toolByName(name);
  if (!tool) return { ok: false, error: `There is no tool called ${name}.` };
  const c = ctx ?? (await toolCtx());
  if (!c) return { ok: false, error: "Not signed in." };
  if (tool.ownerOnly && !c.isOwner) return { ok: false, error: `${tool.title} is for a parent to do.` };

  for (const [k, f] of Object.entries(tool.input)) {
    if (f.required && (args[k] === undefined || args[k] === null || args[k] === "")) return { ok: false, error: `${tool.title} needs ${k}.` };
  }

  let r: ToolResult;
  try { r = await tool.run(args, c); } catch (e) { r = { ok: false, error: e instanceof Error ? e.message : "That did not work." }; }

  if (r.ok && tool.kind === "write") {
    await c.sb.from("activity_log").insert({
      actor: c.email, action: `tool:${tool.name}`, subject: r.summary, undoable: tool.tier === 1,
    }).then(() => {}, () => {});
  }
  return r;
}
