// Client-safe: the "Catalog everything you own" guided task. The finish rule lives here so the page, the Today card and the check agree.
export const SUGGESTED_AREAS = ["Kitchen", "Living room", "Primary bedroom", "Kids' rooms", "Bathrooms", "Office", "Closets", "Garage", "Basement or storage", "Yard and shed", "Laundry room", "Dining room"];

export type AreaView = { id: string; name: string; done: boolean; nothingHere: boolean; items: number; withPhoto: number };
export type CatalogView = { started: boolean; completedAt: string | null; outcome: "complete" | "complete_with_gaps" | null; areas: AreaView[]; totalItems: number; unassigned: number };

// The finish rule, in one place:
//  1. Every area is marked done (an area with no items can be done only when the person confirms there is nothing there).
//  2. Every item in those areas has a photo. Items without one are "gaps". The person may finish with gaps; the outcome then says so.
//  3. A person taps Finish. The system never decides on its own that the household is finished.
export function evaluate(v: CatalogView) {
  const open = v.areas.filter((a) => !a.done);
  const gapAreas = v.areas.filter((a) => a.items > a.withPhoto);
  const gaps = v.areas.reduce((n, a) => n + (a.items - a.withPhoto), 0);
  const ready = v.areas.length > 0 && open.length === 0;
  return { open, gapAreas, gaps, ready, outcome: (gaps === 0 ? "complete" : "complete_with_gaps") as "complete" | "complete_with_gaps" };
}
