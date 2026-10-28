import "server-only";
// Loads what a night's sheet is made of and compiles it. Defaults: the default general template, each active child's default
// template, every child home; "same as last time" with the same sitter when a past visit exists. Nothing here writes.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSitterTemplate, getSitterTemplates, getTemplate } from "@/lib/data-sitter";
import { compileSheet } from "@/lib/sitter-compile-core";
import type { Night, SheetItem, SitterTemplate } from "@/lib/sitter-shared";

export type Choices = { generalTemplateId: string | null; childTemplates: Record<string, string>; childrenHome: string[]; lines: string[] };
export type ChoiceOptions = { general: SitterTemplate[]; children: { id: string; name: string; templates: SitterTemplate[] }[]; lastWith: string | null };

export async function choiceOptions(): Promise<ChoiceOptions> {
  if (!hasSupabaseEnv()) return { general: [], children: [], lastWith: null };
  const sb = await createClient();
  const [all, { data: kids }] = await Promise.all([getSitterTemplates(), sb.from("children").select("id, display_name").is("archived_at", null).order("birth_date")]);
  return { general: all.filter((t) => t.kind === "general"), children: (kids ?? []).map((k) => ({ id: k.id, name: k.display_name, templates: all.filter((t) => t.kind === "child" && t.childId === k.id) })), lastWith: null };
}

// What the night will use if the parent changes nothing. Saved choices win; else the last ended visit with the same sitter; else defaults.
export async function defaultChoices(n: Night, opts: ChoiceOptions): Promise<Choices & { from: "saved" | "last" | "defaults" }> {
  const activeG = new Set(opts.general.map((t) => t.id));
  const activeC = new Map(opts.children.map((c) => [c.id, new Set(c.templates.map((t) => t.id))]));
  const everyone = opts.children.map((c) => c.id);
  if (n.generalTemplateId || Object.keys(n.childTemplates).length || n.childrenHome) {
    return { from: "saved", generalTemplateId: n.generalTemplateId && activeG.has(n.generalTemplateId) ? n.generalTemplateId : opts.general.find((t) => t.isDefault)?.id ?? null,
      childTemplates: Object.fromEntries(everyone.map((id) => [id, n.childTemplates[id] && activeC.get(id)?.has(n.childTemplates[id]) ? n.childTemplates[id] : opts.children.find((c) => c.id === id)?.templates.find((t) => t.isDefault)?.id ?? ""]).filter(([, v]) => v)),
      childrenHome: n.childrenHome ?? everyone, lines: n.lines };
  }
  if (n.sitterPersonId && hasSupabaseEnv()) {
    const sb = await createClient();
    const { data: last } = await sb.from("sitter_nights").select("general_template_id, child_templates, children_home").eq("sitter_person_id", n.sitterPersonId).eq("status", "ended").neq("id", n.id).order("starts_at", { ascending: false }).limit(1).maybeSingle();
    if (last && (last.general_template_id || Object.keys(last.child_templates ?? {}).length)) {
      const ct = (last.child_templates ?? {}) as Record<string, string>;
      return { from: "last", generalTemplateId: last.general_template_id && activeG.has(last.general_template_id) ? last.general_template_id : opts.general.find((t) => t.isDefault)?.id ?? null,
        childTemplates: Object.fromEntries(everyone.map((id) => [id, ct[id] && activeC.get(id)?.has(ct[id]) ? ct[id] : opts.children.find((c) => c.id === id)?.templates.find((t) => t.isDefault)?.id ?? ""]).filter(([, v]) => v)),
        childrenHome: everyone, lines: n.lines };
    }
  }
  return { from: "defaults", generalTemplateId: opts.general.find((t) => t.isDefault)?.id ?? null,
    childTemplates: Object.fromEntries(opts.children.map((c) => [c.id, c.templates.find((t) => t.isDefault)?.id ?? ""]).filter(([, v]) => v)), childrenHome: everyone, lines: n.lines };
}

export async function compileFor(choices: Choices, opts: ChoiceOptions): Promise<SheetItem[]> {
  const household = (await getTemplate()).map((h) => ({ id: h.id, section: h.section, text: h.text, photo: h.photo, defaultOn: h.defaultOn }));
  const general = choices.generalTemplateId ? await getSitterTemplate(choices.generalTemplateId) : null;
  const children = [];
  for (const c of opts.children) {
    if (!choices.childrenHome.includes(c.id)) continue;
    const tid = choices.childTemplates[c.id];
    const t = tid ? await getSitterTemplate(tid) : null;
    children.push({ id: c.id, name: c.name, template: t ? { name: t.template.name, lines: t.lines } : null });
  }
  return compileSheet({ household, general: general ? { name: general.template.name, lines: general.lines } : null, children, lines: choices.lines });
}
