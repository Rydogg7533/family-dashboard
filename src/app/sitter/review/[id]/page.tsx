import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { SitterReview } from "@/components/c/SitterReview";
import { getNight, getTemplate, templateToSheet } from "@/lib/data-sitter";

export const dynamic = "force-dynamic";

export default async function Review({ params }: PageProps<"/sitter/review/[id]">) {
  const { id } = await params;
  const night = await getNight(id);
  if (!night) return <><H1>Sitter sheet</H1><Card className="text-sm">That sitter night was not found. <Link href="/" className="font-semibold text-accent">Back to Today</Link></Card></>;
  const open = ["scheduled", "awaiting_review", "confirmed"].includes(night.status) && new Date(night.endsAt) > new Date();
  if (!open) return <><H1>Sitter sheet</H1><Card className="text-sm">This night is {night.status === "ended" ? "over" : night.status}. <Link href="/" className="font-semibold text-accent">Back to Today</Link></Card></>;
  // A confirmed night shows what is on the tablet; before confirmation it starts from your saved sheet (health items start off).
  const initial = night.sheet.length ? night.sheet : templateToSheet(await getTemplate());
  return (
    <>
      <H1>Sitter sheet</H1>
      <p className="text-sm text-muted mb-3">This is what the kitchen tablet will show while the sitter is here. Untick anything you do not want shown, edit or add for tonight, then confirm.</p>
      <SitterReview night={night} initial={initial} />
    </>
  );
}
