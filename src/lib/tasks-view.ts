import type { Task } from "@/lib/data";

// Which tasks belong where for one viewer. "Yours" = assigned to you, shared with both, or unassigned.
export function splitTasks(all: Task[], me: string | null) {
  const mine: Task[] = [], fyi: Task[] = [], others: Task[] = [];
  for (const t of all) {
    if (!me || t.audience === "both" || !t.person || t.person === me) mine.push(t);
    else if ((t.fyi ?? []).includes(me)) fyi.push(t);
    else others.push(t);
  }
  return { mine, fyi, others };
}
