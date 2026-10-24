// Client-safe mirror of public.child_can() (migration 0036). The DATABASE enforces access for a child's login; this only decides what the
// screens show and explain. Age is the youngest the child could be (birth year only), so nothing is shown as available early.
export type ChildFeature = { key: string; label: string; description: string; tier: number; default_min_age: number; sensitive: boolean; built: boolean; sort: number };
export type FeatureMode = "auto" | "on" | "off";
export type ChildAccess = Record<string, "on" | "off" | undefined>;
export type FeatureState = {
  on: boolean;
  mode: FeatureMode;
  minAge: number;
  // why it is on or off, in the order the database checks: paused, parent off, parent on, too young, waiting for a parent's OK, automatic
  why: "paused" | "parent_off" | "parent_on" | "too_young" | "needs_ok" | "auto";
};

export const TIER_LABEL: Record<number, string> = { 1: "First login", 2: "Growing", 3: "Teen", 4: "Near adult" };

export function ageFloorOf(birthYear: number, now = new Date()) { return Math.max(0, now.getFullYear() - birthYear - 1); }

export function featureState(f: ChildFeature, child: { birth_year: number; access: ChildAccess; paused_at: string | null }, ages: Record<string, number>, now = new Date()): FeatureState {
  const minAge = ages[f.key] ?? f.default_min_age;
  const mode: FeatureMode = child.access?.[f.key] === "on" ? "on" : child.access?.[f.key] === "off" ? "off" : "auto";
  if (child.paused_at) return { on: false, mode, minAge, why: "paused" };
  if (mode === "off") return { on: false, mode, minAge, why: "parent_off" };
  if (mode === "on") return { on: true, mode, minAge, why: "parent_on" };
  const oldEnough = ageFloorOf(child.birth_year, now) >= minAge;
  if (!oldEnough) return { on: false, mode, minAge, why: "too_young" };
  if (f.sensitive) return { on: false, mode, minAge, why: "needs_ok" };
  return { on: true, mode, minAge, why: "auto" };
}

export const WHY_TEXT: Record<FeatureState["why"], (s: FeatureState) => string> = {
  paused: () => "Paused",
  parent_off: () => "Off (you turned it off)",
  parent_on: () => "On (you allowed it)",
  too_young: (s) => `Unlocks at age ${s.minAge}`,
  needs_ok: () => "Old enough. Waiting for your OK",
  auto: () => "On automatically",
};
