// The sitter sheet compiler, pure part (no database): household card, then the general template, then each child who is
// home, then tonight's lines. Health lines are carried but start OFF; the parent ticks them on the review screen for one visit.
// The output is the sheet the review screen edits and the tablet shows. A confirmed night keeps its own copy (a snapshot).
import { CHILD_SECTIONS, GENERAL_SECTIONS, HOUSEHOLD_SECTIONS, startsOn, type SheetItem, type TemplateLine } from "@/lib/sitter-shared";

export type CompileInput = {
  household: { id: string; section: string; text: string; photo: string | null; defaultOn: boolean }[];
  general: { name: string; lines: TemplateLine[] } | null;
  children: { id: string; name: string; template: { name: string; lines: TemplateLine[] } | null }[];   // only the ones home
  lines: string[];                                                                                      // tonight-only lines written ahead
};

export function compileSheet(x: CompileInput): SheetItem[] {
  const out: SheetItem[] = [];
  for (const s of HOUSEHOLD_SECTIONS) for (const h of x.household.filter((h) => h.section === s.id))
    out.push({ id: h.id, section: s.id, label: s.title, text: h.text, photo: h.photo, on: startsOn(s.id, h.defaultOn) });
  if (x.general) for (const s of GENERAL_SECTIONS) for (const l of x.general.lines.filter((l) => l.section === s.id))
    out.push({ id: l.id, section: `g:${s.id}`, label: s.title, text: l.text, photo: l.photo, on: l.health ? false : l.defaultOn, health: !!s.health });
  for (const c of x.children) {
    if (!c.template) continue;
    for (const s of CHILD_SECTIONS) for (const l of c.template.lines.filter((l) => l.section === s.id))
      out.push({ id: l.id, section: `c:${c.id}:${s.id}`, label: `${c.name} · ${s.title}`, text: l.text, photo: l.photo, on: l.health ? false : l.defaultOn, health: !!s.health });
  }
  x.lines.forEach((t, i) => { if (t.trim()) out.push({ id: `line-${i}`, section: "tonight", label: "Tonight", text: t.trim(), photo: null, on: true }); });
  return out;
}
