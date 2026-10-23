"use server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { callModelVision } from "@/lib/ai";

export type WarrantySuggestion = { item?: string; provider?: string; start?: string; end?: string; terms?: string; endNote?: string };

const SYSTEM = `You read photos or PDFs of a warranty card, certificate, terms page, or product label for a household record. Reply with ONE JSON object only (no prose, no markdown), keeping every text field under 200 characters:
{"item": what is covered|null, "provider": company that gives the warranty|null, "start": "YYYY-MM-DD"|null, "end": "YYYY-MM-DD"|null, "duration_months": number|null, "terms": the most important conditions in one or two short sentences (what voids it, what it excludes, how to claim)|null}
Rules: use ONLY what the document says. Never guess a date or a term. If an end date is printed, use it. If only a start date and a length are printed, give start and duration_months and leave end null. If the document does not say, use null.`;

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", pdf: "application/pdf" };

// Reads warranty-info files already stored by the signed-in member and SUGGESTS values. Nothing is saved until the person taps Save.
export async function readWarrantyInfo(paths: string[]): Promise<{ ok: boolean; message?: string; suggestion?: WarrantySuggestion }> {
  if (!hasSupabaseEnv()) return { ok: false, message: "Not available in preview." };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };
  const files: { mime: string; base64: string }[] = [];
  for (const p of paths.slice(0, 4)) {
    if (!p.startsWith(`${user.id}/`)) continue;
    const mime = MIME[p.split(".").pop()?.toLowerCase() ?? ""];
    if (!mime) continue;
    const { data: blob, error } = await sb.storage.from("captures").download(p);
    if (error || !blob || blob.size > 15 * 1024 * 1024) continue;
    files.push({ mime, base64: Buffer.from(await blob.arrayBuffer()).toString("base64") });
  }
  if (!files.length) return { ok: false, message: "I could not open those files to read them." };
  let out: Record<string, unknown> | null = null;
  try {
    const r = await callModelVision({ job: "extract", system: SYSTEM, prompt: "Read this warranty document and return the JSON.", files, maxTokens: 1500, feature: "warranty-read" });
    const m = r.text.match(/\{[\s\S]*\}/);
    out = m ? JSON.parse(m[0]) : null;
  } catch { return { ok: false, message: "Reading failed. You can fill the form in by hand." }; }
  if (!out) return { ok: false, message: "I could not find warranty details in that file." };
  const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 250) : undefined);
  const sug: WarrantySuggestion = { item: s(out.item), provider: s(out.provider), start: iso(out.start), end: iso(out.end), terms: s(out.terms) };
  const months = typeof out.duration_months === "number" && out.duration_months > 0 && out.duration_months <= 600 ? Math.round(out.duration_months) : null;
  if (!sug.end && sug.start && months) {
    const d = new Date(sug.start + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + months);
    sug.end = d.toISOString().slice(0, 10);
    sug.endNote = `calculated: ${sug.start} plus ${months >= 12 && months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} months`}`;
  }
  if (!sug.item && !sug.provider && !sug.start && !sug.end && !sug.terms) return { ok: false, message: "That file does not show warranty details I can read." };
  return { ok: true, suggestion: sug };
}
