// Client-safe helpers for children and the login age rule. Only a birth YEAR is stored, so the real age is one of two numbers; the rule
// uses the youngest it could be, so a child is never allowed a login early.
import type { ChildAccess } from "@/lib/child-access";
export type ChildRow = { id: string; display_name: string; birth_year: number; login_min_age: number | null; profile_id: string | null; access: ChildAccess; paused_at: string | null };

export const ageFloor = (birthYear: number, now = new Date()) => Math.max(0, now.getFullYear() - birthYear - 1);
export const ageText = (birthYear: number, now = new Date()) => { const f = ageFloor(birthYear, now); return `${f} or ${f + 1}`; };
export const minAgeFor = (c: Pick<ChildRow, "login_min_age">, householdMin: number) => c.login_min_age ?? householdMin;
export const loginAllowed = (c: Pick<ChildRow, "birth_year" | "login_min_age">, householdMin: number, now = new Date()) => ageFloor(c.birth_year, now) >= minAgeFor(c, householdMin);
