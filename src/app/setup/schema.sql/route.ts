import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getSetupState } from "@/lib/setup-state";

export const dynamic = "force-dynamic";

// The whole schema as one file, for the Supabase SQL editor on a brand-new project. Only served while the household is not set up.
// Files are concatenated in file-name order. UNVERIFIED on a fresh project: the live project applied some of these in a different order.
export async function GET() {
  const state = await getSetupState().catch(() => "done" as const);
  if (state === "done" || state === "no-service") return new Response("Not available: this household is already set up.", { status: 404 });
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const body = [`-- StewardOS schema · ${files.length} migrations · generated ${new Date().toISOString()}\n-- Paste the whole file into the Supabase SQL editor and run it once.\n`, ...files.map((f) => `\n-- ===== ${f} =====\n${readFileSync(join(dir, f), "utf8")}`)].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="stewardos-schema.sql"' } });
}
