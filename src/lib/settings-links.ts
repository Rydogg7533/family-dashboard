// Settings in eight groups, then Info (D79). It was one flat list of 24 rows, where a settings page, a
// register, a status page and a paragraph further down the same page all looked alike. Groups carry the
// meaning the subtitles were trying to carry, and Info is cut off below a rule because nothing there changes
// anything. Keep a row in the group a person would look in, not the one the code lives under.
export type SettingRow = { href: string; label: string; sub: string };
export type SettingGroup = { title: string; rows: SettingRow[] };

export const SETTING_GROUPS: SettingGroup[] = [
  { title: "Household", rows: [
    { href: "/settings/household", label: "Household", sub: "Name and time zone — the clock every page reads" },
    { href: "/settings/vault", label: "1Password", sub: "Where each sensitive item is kept: names and private links, never contents" },
    { href: "/settings/people", label: "People and access", sub: "Members, logins, birthdays, who sees what" },
    { href: "/settings/tablet", label: "Kitchen tablet", sub: "Pair the tablet that shows the sitter sheet" },
    { href: "/settings/sitter", label: "Sitter", sub: "Approved sitters, the emergency card, instruction templates" },
  ] },
  { title: "Connections", rows: [
    { href: "/settings/connections", label: "Connections", sub: "Mail, calendar, location, contacts, notifications" },
    { href: "/settings/contacts", label: "Contacts source", sub: "Apple or Google, chosen per person" },
    { href: "/settings/location", label: "Location", sub: "Your phone's location on your own Day page" },
  ] },
  { title: "Notifications", rows: [
    { href: "/settings/notifications", label: "Notifications", sub: "Where each kind appears, quiet hours, this device" },
  ] },
  { title: "Assistant", rows: [
    { href: "/settings/assistant", label: "Assistant", sub: "Voice, your wake word, which app answers questions outside the family" },
  ] },
  { title: "Money", rows: [
    { href: "/settings/money/accounts", label: "Accounts and cards", sub: "Bank and credit accounts, each card tied to the account it draws on" },
    { href: "/settings/money", label: "Money rules", sub: "Amazon invoices: when to ask, what to wait for" },
    { href: "/money", label: "Money set-up", sub: "Entities, budget, reconciliation" },
  ] },
  { title: "Schedule and activities", rows: [
    { href: "/places", label: "Places and activities", sub: "Learned places, checklists, learning switches" },
  ] },
  { title: "Filing and documents", rows: [
    { href: "/settings/filing-rules", label: "Filing rules", sub: "Folder tree, sender and keyword rules, review cadence" },
  ] },
  { title: "Look and feel", rows: [
    { href: "/settings/appearance", label: "Look and feel", sub: "Theme, accent, text size, fonts, background" },
    { href: "/settings/modules", label: "My dashboard", sub: "Modules on or off, presets, reset to recommended" },
  ] },
  { title: "Data and privacy", rows: [
    { href: "/settings/privacy", label: "Data and privacy", sub: "What is stored, how long, who can see it" },
  ] },
];

// Read-only. Nothing in here changes anything, which is why it sits apart.
export const INFO_ROWS: SettingRow[] = [
  { href: "/health", label: "Status", sub: "Connections, jobs, free space, backup, mirror" },
  { href: "/sources", label: "Sources", sub: "Every place data comes from, with Go and Sync now" },
  { href: "/log", label: "Logs", sub: "Change log, decisions log, trust and audit view" },
  { href: "/settings/reference#how", label: "How it works", sub: "One page per feature, in plain words" },
  { href: "/settings/reference#household", label: "Household reference", sub: "Wi-Fi name, house basics, utilities, emergency numbers" },
  { href: "/settings/reference#where", label: "Where things live", sub: "Organized, the 8TB, iCloud, Google, 1Password" },
];
