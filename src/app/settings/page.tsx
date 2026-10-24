import { H1 } from "@/components/ui";
import { Row, RowGroup, SectionTitle } from "@/components/registers";

const settings = [
  { href: "/settings/people", label: "People and access", sub: "Change my password, members, who sees what, sharing between parents" },
  { href: "/settings/connections", label: "Connections", sub: "What is connected for you: notifications, mail, calendar, location, contacts" },
  { href: "/settings/contacts", label: "Contacts source", sub: "Apple or Google contacts, chosen per person" },
  { href: "/settings/location", label: "Location (Overland)", sub: "Connect your phone's location to your own Day page" },
  { href: "/settings/notifications", label: "Notifications", sub: "Where each kind appears, quiet hours, allow this device" },
  { href: "/settings/sitter", label: "Sitter sheet", sub: "What a babysitter needs, shown on the kitchen tablet on sitter nights" },
  { href: "/settings/tablet", label: "Kitchen tablet", sub: "Pair the tablet that shows the sitter sheet" },
  { href: "/money", label: "Money set-up", sub: "Accounts, entities, budget, rules, reconciliation (on Money)" },
  { href: "/places", label: "Schedule and activities", sub: "Places, activities and checklists, learning switches" },
  { href: "/settings#filing", label: "Filing rules", sub: "Folder tree, sender and keyword rules, review cadence" },
  { href: "/settings/appearance", label: "Look and feel", sub: "Theme, accent, text size, fonts, background" },
  { href: "/settings/modules", label: "My dashboard", sub: "Modules on or off, presets, reset to recommended" },
  { href: "/settings#privacy", label: "Data and privacy", sub: "Export, retention, access audit, who can see what" },
];
const info = [
  { href: "/settings#how", label: "How it works", sub: "One page per feature, in plain words" },
  { href: "/health", label: "Status", sub: "Connections, jobs, free space, backup, mirror" },
  { href: "/sources", label: "Sources", sub: "Every place data comes from, with Go and Sync now" },
  { href: "/settings#household", label: "Household reference", sub: "Wi-Fi name, house basics, emergency numbers, utilities" },
  { href: "/contacts", label: "Contacts", sub: "Doctors, schools, contractors, insurers, carpool" },
  { href: "/emergency", label: "Emergency and continuity plan", sub: "Parents only · reviewed yearly" },
  { href: "/settings#where", label: "Where things live", sub: "Organized, the 8TB, iCloud, Google, 1Password" },
  { href: "/log", label: "Logs", sub: "Change log, decisions log, trust and audit view" },
];

export default function Settings() {
  return (
    <>
      <H1>Settings</H1>
      <p className="text-xs text-muted mb-3">Every setting shows who last changed it and when.</p>
      <SectionTitle>Settings</SectionTitle>
      <RowGroup>{settings.map((r) => <Row key={r.label} href={r.href} label={r.label} sub={r.sub} />)}</RowGroup>

      <SectionTitle>Info</SectionTitle>
      <RowGroup>{info.map((r) => <Row key={r.label} href={r.href} label={r.label} sub={r.sub} />)}</RowGroup>

      <section id="people" className="mt-6 text-xs">
        <SectionTitle>People and access</SectionTitle>
        <div className="card text-muted">Ryan (parent, owner) · Melissa (parent) · [Child 1] · [Child 2]. Logins, two-step set-up and the who-sees-what grid are set up here. Changes to access need both parents.</div>
      </section>
      <section id="filing" className="text-xs">
        <SectionTitle>Filing rules</SectionTitle>
        <div className="card text-muted">Organized tree (read-only view), sender and keyword rules, _to_delete review monthly, which document types tag to which family member.</div>
      </section>
      <section id="privacy" className="text-xs">
        <SectionTitle>Data and privacy</SectionTitle>
        <div className="card text-muted">The dashboard stores names, dates, links and summaries; never passwords, account or ID numbers, or file contents. Location raw points kept 30 days. Health is visible only to the person (children to parents). Access audit lists who viewed what.</div>
      </section>
      <section id="how" className="text-xs">
        <SectionTitle>How it works</SectionTitle>
        <div className="card text-muted">Email is summarized into tasks; receipts are matched to charges; the schedule comes from calendars with gaps filled; checklists learn from edits; Ask answers from what the dashboard already holds. Nothing leaves the house without a person.</div>
      </section>
      <section id="household" className="text-xs">
        <SectionTitle>Household reference</SectionTitle>
        <div className="card text-muted">Wi-Fi: [Network name] (password in Apple Passwords, shared group Home) · Emergency: 911, poison control, [Family doctor] · Utilities: [Power] ····21, [Gas] ····[LAST4], [Water], [Internet] ····44 · Insurance contacts in Contacts.</div>
      </section>
      <section id="where" className="text-xs">
        <SectionTitle>Where things live</SectionTitle>
        <div className="card text-muted">~/Organized on the Mac mini (mirrored nightly to Rossiter 8TB) · ~/Code (GitHub as cloud copy) · iCloud Drive (personal cloud) · Google Drive per business · 1Password for sensitive documents · Apple Passwords for logins.</div>
      </section>
    </>
  );
}
