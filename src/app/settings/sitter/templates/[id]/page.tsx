import Link from "next/link";
import { notFound } from "next/navigation";
import { H1 } from "@/components/ui";
import { SitterTemplateEditor } from "@/components/c/SitterTemplateEditor";
import { getSitterTemplate } from "@/lib/data-sitter";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const ageOf = (born: Date) => Math.floor((new Date().getTime() - born.getTime()) / (365.25 * 864e5));

export default async function TemplatePage({ params }: PageProps<"/settings/sitter/templates/[id]">) {
  const { id } = await params;
  const t = await getSitterTemplate(id); if (!t) notFound();
  let age: number | null = null;
  if (t.template.childId && hasSupabaseEnv()) {
    const sb = await createClient(); const { data } = await sb.from("children").select("birth_date, birth_year").eq("id", t.template.childId).maybeSingle();
    const y = data?.birth_date ? new Date(data.birth_date) : data?.birth_year ? new Date(data.birth_year, 6, 1) : null;
    if (y) age = ageOf(y);
  }
  const back = t.template.kind === "general" ? "/settings/sitter?tab=general" : "/settings/sitter?tab=kids";
  return (
    <>
      <Link href={back} className="text-xs font-semibold text-accent">‹ Sitter</Link>
      <H1>{t.template.childName ? `${t.template.childName}${age != null ? `, ${age}` : ""} · ` : ""}{t.template.name}</H1>
      <p className="text-sm text-muted mb-3">{t.template.isDefault ? "The default for " : "A template for "}{t.template.childName ?? "the house"}. One line per item; the sitter sees the lines that are on. Nothing here changes a visit already confirmed.</p>
      <SitterTemplateEditor template={t.template} lines={t.lines} childAge={age} />
    </>
  );
}
