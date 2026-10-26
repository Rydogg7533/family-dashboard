// Client-safe helpers for children and the login age rule. A birth DATE gives the real age; a row saved before
// dates were kept has only the year, and then the rule uses the youngest the child could be, so no one is
// allowed a login early. `today` is passed in on the household's clock rather than read from a server's.
import type { ChildAccess } from "@/lib/child-access";
export type ChildRow = { id: string; display_name: string; birth_year: number; birth_date?: string | null; login_min_age: number | null; profile_id: string | null; access: ChildAccess; paused_at: string | null; pin_login?: boolean };

export const ageFloor = (birthYear: number, now = new Date()) => Math.max(0, now.getFullYear() - birthYear - 1);
export const ageText = (birthYear: number, now = new Date()) => { const f = ageFloor(birthYear, now); return `${f} or ${f + 1}`; };
// Exact, from a YYYY-MM-DD birth date against a YYYY-MM-DD today.
export const ageExact = (birth: string, today: string) => {
  let a = Number(today.slice(0, 4)) - Number(birth.slice(0, 4));
  if (today.slice(5, 10) < birth.slice(5, 10)) a--;
  return Math.max(0, a);
};
// The age to show: a number when the date is known, "7 or 8" when only the year is.
export const ageOf = (c: Pick<ChildRow, "birth_year" | "birth_date">, today: string) =>
  c.birth_date ? String(ageExact(c.birth_date, today)) : ageText(c.birth_year, new Date(`${today}T12:00:00Z`));
// The age the rules use: never older than the person could be.
export const ageForRules = (c: Pick<ChildRow, "birth_year" | "birth_date">, today: string) =>
  c.birth_date ? ageExact(c.birth_date, today) : ageFloor(c.birth_year, new Date(`${today}T12:00:00Z`));
// Month and day, for "whose birthday is next".
export const birthdayMd = (c: Pick<ChildRow, "birth_date">) => (c.birth_date ? c.birth_date.slice(5, 10) : null);

export const minAgeFor = (c: Pick<ChildRow, "login_min_age">, householdMin: number) => c.login_min_age ?? householdMin;
export const loginAllowed = (c: Pick<ChildRow, "birth_year" | "birth_date" | "login_min_age">, householdMin: number, today: string) => ageForRules(c, today) >= minAgeFor(c, householdMin);
