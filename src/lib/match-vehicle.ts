export type VRow = { id: string; name: string; short: string; make: string | null; model: string | null; year: number | null; details: Record<string, unknown> | null };

// A hint like "2018 Toyota Sienna" matches only when exactly one registered vehicle fits; otherwise the person is asked.
export function matchVehicle(hint: string | null | undefined, vs: VRow[]): VRow | null {
  const h = (hint ?? "").toLowerCase();
  if (!h) return null;
  const hits = vs.filter((v) => [v.short, v.model, v.name].some((t) => t && h.includes(t.toLowerCase())));
  return hits.length === 1 ? hits[0] : null;
}

// The vehicle for a receipt: what the paper says, else what the person answered (a tapped name or words). Null when neither fits exactly one.
export function vehicleFor(hint: string | null | undefined, answer: string | null | undefined, vs: VRow[]): VRow | null {
  return matchVehicle(hint, vs) ?? matchVehicle(answer, vs);
}
