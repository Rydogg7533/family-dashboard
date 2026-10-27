import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";
import { VAULT_GROUP_IDS, groupLabel } from "@/lib/vault";

// Where the sensitive things are: pointers into 1Password (Settings › 1Password). Ask answers with the
// item's name and an Open link that works only behind the asker's own 1Password unlock. It never has the
// number, the scan or the code, so it can never say them. The asker sees their own pointers and the
// household's (RLS); never another adult's.

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (q: string) => norm(q).split(" ").filter((w) => w.length > 1);
const matches = (ws: string[], hay: string) => { const h = norm(hay); return ws.every((w) => h.includes(w)); };

export const vaultTools: Tool[] = [
  {
    name: "vault.find", title: "Find in 1Password", kind: "read", tier: 1,
    description: "Where a sensitive item is kept in 1Password: passport, license, Social Security card, titles, registrations, insurance cards, account numbers, deeds, wills, recovery keys. Returns the item's name, group, renewal date and an Open link (opens in the person's own 1Password); never the contents. Use for 'where's my passport', 'the Tahoe title', 'our insurance card', 'what do I have in 1Password'.",
    input: { text: { type: "string", describe: "Words from the item's name, e.g. 'passport', 'Tahoe title', 'health insurance'", required: false }, group: { type: "enum", options: [...VAULT_GROUP_IDS], describe: "Limit to one group", required: false } },
    async run(a, c) {
      const { data } = await c.sb.from("vault_pointers").select("id, person, \"group\", label, item_type, link, expires_on, note").is("deleted_at", null).order("group").order("label");
      const ws = words(str(a.text)), g = str(a.group);
      const rows = ((data ?? []) as { id: string; person: string | null; group: string; label: string; item_type: string | null; link: string | null; expires_on: string | null; note: string | null }[]).filter((r) => (!g || r.group === g) && (!ws.length || matches(ws, `${r.label} ${r.group} ${r.item_type ?? ""} ${r.note ?? ""}`)));
      const shown = rows.map((r) => ({ id: r.id, name: r.label, group: groupLabel(r.group), whose: r.person === null ? "household" : r.person === c.userId ? "yours" : "theirs", type: r.item_type, date: r.expires_on, detail: [groupLabel(r.group), r.person === null ? "household" : "yours", r.expires_on ? `renews ${r.expires_on}` : null].filter(Boolean).join(" · "), note: r.note, href: "/settings/vault", open: r.link }));
      const noLink = rows.filter((r) => !r.link).length;
      return { ok: true, summary: rows.length ? `${rows.length} item${rows.length === 1 ? "" : "s"} in 1Password${ws.length ? ` matching "${str(a.text)}"` : ""}. The person sees them as rows with an Open button that opens 1Password; tell them the name and, if there is one, the renewal date. Never state a number.${noLink ? ` ${noLink} of them have no link yet: say the item is listed but the link has not been added under Settings › 1Password.` : ""}` : `Nothing in 1Password${ws.length ? ` matching "${str(a.text)}"` : ""} is listed yet. It is added under Settings › 1Password: the item's name and its private link.`, data: shown, href: "/settings/vault" };
    },
  },
];
