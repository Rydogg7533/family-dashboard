import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";
import { MORE_LINKS } from "@/lib/more-links";
import { filingFolders, vendorKey } from "@/lib/filing-folders";
import { reportIssue } from "@/app/issues/actions";

// The system itself: where things are, filing rules, and the one path anyone may use to ask for a
// change. Features are added by the maintainer only (Ryan's rule, hard-coded in the registry's ownerOnly
// flags and in is_maintainer()); everyone else's "add a feature" becomes an issue of kind "idea" that the
// maintainer reads, never a change. Settings that belong to the head of household or the maintainer have no
// tool at all, so Ask can only point at the page.

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (q: string) => norm(q).split(" ").filter((w) => w.length > 1);

const PAGE_HINTS: Record<string, string> = {
  "/settings/people": "who is in the household, children's logins and access, birthdays (head of household)",
  "/settings/household": "household name, time zone",
  "/settings/vault": "1Password: where each sensitive item is kept (passport, license, SSN, titles, insurance cards, account numbers, deeds, wills, recovery keys), names and private links only",
  "/settings/money": "money accounts and cards",
  "/settings/connections": "Google and Apple connections, mailboxes",
  "/settings/contacts": "which address book contacts come from",
  "/settings/location": "location sharing",
  "/settings/privacy": "privacy, telemetry",
  "/settings/reference": "reference numbers and pointers",
  "/settings/sitter": "sitter sheet contents",
  "/settings/tablet": "kitchen tablet",
  "/settings/notifications": "push notifications, quiet hours, what alerts you get",
  "/settings/appearance": "theme, colours, density, look and feel",
  "/settings/filing-rules": "which vendor's documents go to which folder",
  "/settings/modules": "which cards show on your dashboard",
  "/health": "system health, the hub, your problem reports",
  "/money/receipts": "receipts, charges needing proof, what card paid",
  "/money/routine": "the monthly money routine: transfers, statements, reconciling",
  "/emergency": "emergency plan, contacts, where things are",
};

export const systemTools: Tool[] = [
  {
    name: "app.findPage", title: "Find the page", kind: "read", tier: 1,
    description: "Where in the app something is done or changed. Use when the person asks 'where do I', 'how do I change', or when there is no tool for what they want and the page is the answer.",
    input: { text: { type: "string", describe: "What they want to do or find", required: true } },
    async run(a) {
      const ws = words(str(a.text));
      const pages = [...MORE_LINKS.map((l) => ({ href: l.href, label: l.label, hint: PAGE_HINTS[l.href] ?? "" })), ...Object.entries(PAGE_HINTS).filter(([h]) => !MORE_LINKS.some((l) => l.href === h)).map(([href, hint]) => ({ href, label: href.replace("/settings/", "Settings › ").replace("/", ""), hint }))];
      const scored = pages.map((p) => ({ ...p, score: ws.filter((w) => norm(`${p.label} ${p.hint} ${p.href}`).includes(w)).length })).filter((p) => p.score > 0).sort((x, y) => y.score - x.score).slice(0, 5);
      return { ok: true, summary: scored.length ? `Closest pages: ${scored.map((p) => p.label).join("; ")}. The person sees them as rows.` : "No page matches that; say so and name the nearest area (Settings, Money, Records).", data: scored.map((p) => ({ id: p.href, name: p.label, detail: p.hint || null, href: p.href })), href: scored[0]?.href };
    },
  },
  {
    name: "issue.report", title: "Report a problem or an idea", kind: "write", tier: 1,
    description: "File a problem, annoyance, cosmetic issue or feature idea for the maintainer. This is how anyone asks for the system to change: a request for a new feature or a change to how something works is filed as an idea, never done from here. Say what happened or what they want, in their words.",
    input: {
      text: { type: "string", describe: "What happened, or what they want, in their words", required: true },
      severity: { type: "enum", options: ["blocks", "annoying", "cosmetic", "idea"], describe: "blocks = cannot continue; annoying = works but wrong; cosmetic = looks off; idea = a feature or change request", required: true },
      page: { type: "string", describe: "Which page it concerns, if known, e.g. '/tasks'", required: false },
    },
    async run(a) {
      const r = await reportIssue({ text: str(a.text), severity: str(a.severity) as "blocks" | "annoying" | "cosmetic" | "idea", page: str(a.page) || "/ask", user_agent: "Ask" });
      if (!r.ok) return { ok: false, error: r.error ?? "Could not file it." };
      const idea = str(a.severity) === "idea";
      return { ok: true, summary: idea ? "Filed as an idea for the maintainer. Features are added by the maintainer only; you will see it under System health › Your reports." : "Filed. It shows under System health › Your reports with its status.", href: "/health" };
    },
  },
  {
    name: "rule.find", title: "Filing rules", kind: "read", tier: 1,
    description: "The vendor-to-folder filing rules: which vendor's documents always go to which folder. Use for 'where do Render invoices go', 'what rules do we have'.",
    input: { text: { type: "string", describe: "A vendor, to narrow", required: false } },
    async run(a, c) {
      const { data } = await c.sb.from("filing_rules").select("id, vendor_label, folder_template, created_at").order("vendor_label");
      const ws = words(str(a.text));
      const rows = ((data ?? []) as { id: string; vendor_label: string; folder_template: string; created_at: string }[]).filter((r) => !ws.length || ws.every((w) => norm(r.vendor_label).includes(w)));
      return { ok: true, summary: rows.length ? `${rows.length} filing rule${rows.length === 1 ? "" : "s"}. The person sees them as rows.` : `No filing rule${ws.length ? ` for "${str(a.text)}"` : ""}; documents without one are filed by what the reader sees.`, data: rows.map((r) => ({ id: r.id, name: r.vendor_label, where: r.folder_template.replace("Organized/", ""), date: r.created_at.slice(0, 10), href: "/settings/filing-rules" })), href: "/settings/filing-rules" };
    },
  },
  {
    name: "rule.add", title: "Add a filing rule", kind: "write", tier: 2,
    description: "Always file a vendor's documents in one folder. The folder must be one the app already uses (rule.folders lists them). Vehicle documents follow the vehicle and do not take a rule.",
    input: { vendor: { type: "string", describe: "The vendor, as it appears on its documents", required: true }, folder: { type: "string", describe: "A folder from rule.folders, e.g. 'Organized/Business/Veil Labs/{year}/Receipts/'", required: true } },
    async run(a, c) {
      const key = vendorKey(str(a.vendor)), label = str(a.vendor).trim().slice(0, 80), folder = str(a.folder).trim();
      if (!key || !folder) return { ok: false, error: "Need a vendor and a folder." };
      if (/\/Vehicles\//.test(folder)) return { ok: false, error: "Vehicle documents follow the vehicle; they do not take a vendor rule." };
      const { data: vs } = await c.sb.from("vehicles").select("short");
      const allowed = filingFolders("{year}", (vs ?? []).map((v) => String(v.short)).filter(Boolean));
      const template = folder.replace(/\/(20\d\d)\//, "/{year}/");
      if (!allowed.includes(template)) return { ok: false, error: `"${folder}" is not one of the app's folders. Ask rule.folders for the list.` };
      const { error } = await c.sb.from("filing_rules").upsert({ vendor_key: key, vendor_label: label, folder_template: template, created_by: c.userId }, { onConflict: "vendor_key" });
      if (error) return { ok: false, error: error.message };
      await c.sb.from("activity_log").insert({ actor: c.email, action: "filing_rule_saved", subject: `${label} → ${template}`, undoable: true }).then(() => {}, () => {});
      return { ok: true, summary: `${label} documents will go to ${template.replace("Organized/", "")} from now on. Remove it under Settings › Filing rules.`, href: "/settings/filing-rules" };
    },
  },
  {
    name: "rule.folders", title: "Filing folders", kind: "read", tier: 1,
    description: "The folders the app files into (for rule.add and for 'where would this go').",
    input: {},
    async run(_a, c) {
      const { data: vs } = await c.sb.from("vehicles").select("short");
      const folders = filingFolders("{year}", (vs ?? []).map((v) => String(v.short)).filter(Boolean));
      return { ok: true, summary: `${folders.length} folders.`, data: folders };
    },
  },
];
