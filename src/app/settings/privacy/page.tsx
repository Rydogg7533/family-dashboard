import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { SectionTitle } from "@/components/registers";

export const dynamic = "force-dynamic";

export default function Privacy() {
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>Data and privacy</H1>
      <SectionTitle>What the dashboard holds</SectionTitle>
      <Card className="text-sm">The dashboard stores names, dates, links and summaries; never passwords, account or ID numbers, or file contents. Location raw points are kept 30 days. Health is visible only to the person it is about (a child&apos;s to their parents). The access audit lists who viewed what.</Card>
      <SectionTitle>Still to build</SectionTitle>
      <Card className="text-sm text-muted">Export my data, retention settings you can change, delete a day&apos;s location record, delete Ask history, and the access audit itself. Until then this page states the rules the app already follows.</Card>
      <p className="text-xs text-muted mt-4">We never see your records. Telemetry that leaves the house is shape only, and opt-in.</p>
    </>
  );
}
