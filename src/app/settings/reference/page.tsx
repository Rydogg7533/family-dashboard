import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { SectionTitle } from "@/components/registers";

export const dynamic = "force-dynamic";

// The three reference notes that used to be paragraphs at the foot of Settings, where they looked like
// settings and went nowhere. They are read-only, so they live together under Info.
export default function Reference() {
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>Reference</H1>

      <section id="how">
        <SectionTitle>How it works</SectionTitle>
        <Card className="text-sm">Email is summarized into tasks; receipts are matched to charges; the schedule comes from calendars with gaps filled; checklists learn from edits; Ask answers from what the dashboard already holds. Nothing leaves the house without a person.</Card>
      </section>

      <section id="household">
        <SectionTitle>Household reference</SectionTitle>
        <Card className="text-sm">Wi-Fi: [Network name] (password in Apple Passwords, shared group Home) · Emergency: 911, poison control, [Family doctor] · Utilities: [Power] ····21, [Gas] ····[LAST4], [Water], [Internet] ····44 · Insurance contacts in Contacts.</Card>
      </section>

      <section id="where">
        <SectionTitle>Where things live</SectionTitle>
        <Card className="text-sm">~/Organized on the Mac mini (mirrored nightly to Rossiter 8TB) · ~/Code (GitHub as cloud copy) · iCloud Drive (personal cloud) · Google Drive per business · 1Password for sensitive documents · Apple Passwords for logins.</Card>
      </section>

      <p className="text-xs text-muted mt-4">Nothing on this page changes anything. Contacts, the emergency plan and the other registers are under More.</p>
    </>
  );
}
