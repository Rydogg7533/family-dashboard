import Link from "next/link";
import { H1 } from "@/components/ui";
import { AmazonInvoiceSetting } from "@/components/c/AmazonInvoiceSetting";
import { getAmazonInvoiceSetting } from "@/lib/data-household-settings";
import { ReceiptDetailsBackfill } from "@/components/c/ReceiptDetailsBackfill";
import { getDetailsProgress } from "./details-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;   // reading a few documents per call

export default async function MoneyRules() {
  const [s, details] = await Promise.all([getAmazonInvoiceSetting(), getDetailsProgress()]);
  const when = s.updated_at ? new Date(s.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Denver" }) : null;
  return (
    <>
      <Link href="/settings" className="text-xs font-semibold text-accent">‹ Settings</Link>
      <H1>Money rules</H1>
      <p className="text-sm text-muted mb-3">Rules for how receipts and charges are matched. Both parents see them; owners change them.</p>
      <AmazonInvoiceSetting initial={s.value} canEdit={s.isOwner} changedBy={s.updated_by ? `${s.updated_by}${when ? `, ${when}` : ""}` : null} />
      {details && <ReceiptDetailsBackfill initial={details} />}
    </>
  );
}
