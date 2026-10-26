import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";
import { saveContact } from "@/app/contacts/actions";

// People: who is in the household, the address book, medications, orders. Row-level security already
// decides what each person sees (own medications; a child's only through the parent pages), and the tools
// add nothing on top -- a tool that reads nothing for this person says so, rather than reading around it.

type Ctx = Parameters<Tool["run"]>[1];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9@.+]+/g, " ").trim();
const words = (q: string) => norm(q).split(" ").filter((w) => w.length > 1);
const matches = (ws: string[], hay: string) => { const h = norm(hay); return ws.every((w) => h.includes(w)); };
const mmdd = (iso: string | null) => (iso ? iso.slice(-5) : null);

async function household(c: Ctx) {
  const [{ data: ps }, { data: kids }] = await Promise.all([
    c.sb.from("profiles").select("id, display_name, role, birth_date, created_at").order("created_at"),
    c.sb.from("children").select("id, display_name, birth_date, birth_year, profile_id").is("archived_at", null).order("birth_year"),
  ]);
  const people = (ps ?? []).map((p) => ({ id: p.id as string, name: String(p.display_name ?? "Member"), role: String(p.role), birthday: (p.birth_date as string | null) ?? null, year: null as number | null, me: p.id === c.userId }));
  for (const k of kids ?? []) if (!k.profile_id) people.push({ id: k.id as string, name: String(k.display_name ?? ""), role: "child", birthday: (k.birth_date as string | null) ?? null, year: (k.birth_year as number | null) ?? null, me: false });
  return people;
}

export const peopleTools: Tool[] = [
  {
    name: "people.find", title: "Household members", kind: "read", tier: 1,
    description: "Who is in the household: name, role (parent or child), birthday when recorded, and who is asking. Use for 'when is Audrey's birthday', 'who's in the family', and before any task or calendar item for a named person.",
    input: { text: { type: "string", describe: "A name, to narrow", required: false } },
    async run(a, c) {
      const ws = words(str(a.text));
      const rows = (await household(c)).filter((p) => !ws.length || matches(ws, p.name));
      const data = rows.map((p) => ({ id: p.id, name: p.name, role: p.role, birthday: p.birthday ?? (p.year ? `${p.year} (year only)` : null), isAsking: p.me, href: "/family" }));
      return { ok: true, summary: rows.length ? rows.map((p) => `${p.name} (${p.role}${p.me ? ", asking" : ""}${p.birthday ? `, birthday ${p.birthday}` : p.year ? `, born ${p.year}` : ", birthday not recorded"})`).join("; ") + "." : `Nobody called "${str(a.text)}" in the household.`, data, href: "/family" };
    },
  },
  {
    name: "contact.find", title: "Find a contact", kind: "read", tier: 1,
    description: "Look someone up in the household's address book: phone numbers, emails, company, birthday. Use for 'grandma's number', 'the plumber's email', 'who do we use for the furnace'.",
    input: { text: { type: "string", describe: "Name, nickname, company or words from the notes", required: true }, limit: { type: "number", describe: "How many; 1 for 'the' one person", required: false } },
    async run(a, c) {
      const ws = words(str(a.text));
      if (!ws.length) return { ok: false, error: "Say who to look for." };
      const out: { id: string; name: string; org: string | null; phones: string[]; emails: string[]; birthday: string | null; href: string }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await c.sb.from("contact_cards").select("id, full_name, first_name, last_name, nickname, org, phones, emails, birthday, notes").is("deleted_at", null).range(from, from + 999);
        for (const r of data ?? []) {
          const hay = `${r.full_name ?? ""} ${r.first_name ?? ""} ${r.last_name ?? ""} ${r.nickname ?? ""} ${r.org ?? ""} ${r.notes ?? ""}`;
          if (!matches(ws, hay)) continue;
          const phones = ((r.phones ?? []) as { label?: string; number: string }[]).map((p) => `${p.number}${p.label ? ` (${p.label})` : ""}`);
          const emails = ((r.emails ?? []) as { label?: string; address: string }[]).map((e) => e.address);
          out.push({ id: r.id as string, name: String(r.full_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || r.org || "Unnamed"), org: (r.org as string | null) ?? null, phones, emails, birthday: (r.birthday as string | null) ?? null, href: `/contacts?q=${encodeURIComponent(str(a.text))}` });
        }
        if (!data || data.length < 1000) break;
      }
      const want = Number.isFinite(Number(a.limit)) && Number(a.limit) > 0 ? Math.min(Number(a.limit), 10) : 10;
      const shown = out.slice(0, want);
      return { ok: true, summary: out.length ? `${out.length} contact${out.length === 1 ? "" : "s"} match "${str(a.text)}"${out.length > want ? `; showing ${want}` : ""}. Give the number or address the person asked for; the rows carry them.` : `Nobody matching "${str(a.text)}" in the address book.`, data: shown.map((s) => ({ ...s, detail: [...s.phones, ...s.emails].join(" · ") })), href: "/contacts" };
    },
  },
  {
    name: "contact.add", title: "Add a contact", kind: "write", tier: 1,
    description: "Add a person or company to the household's address book (goes to the asker's own Apple or Google contacts through the hub). Name or company plus any phone or email the person gave.",
    input: {
      first: { type: "string", describe: "First name", required: false },
      last: { type: "string", describe: "Last name", required: false },
      org: { type: "string", describe: "Company, e.g. 'Dave's Plumbing'", required: false },
      phone: { type: "string", describe: "A phone number, as said", required: false },
      email: { type: "string", describe: "An email address, as said", required: false },
    },
    async run(a) {
      const r = await saveContact({ firstName: str(a.first), lastName: str(a.last), org: str(a.org), phones: str(a.phone) ? [{ label: "mobile", number: str(a.phone) }] : [], emails: str(a.email) ? [{ label: "home", address: str(a.email) }] : [] });
      if (!r.ok) return { ok: false, error: r.error };
      const who = [str(a.first), str(a.last)].filter(Boolean).join(" ") || str(a.org);
      return { ok: true, summary: `Adding ${who} to your contacts; the hub writes it to your address book within a few minutes.`, href: "/contacts" };
    },
  },
  {
    name: "meds.find", title: "My medications", kind: "read", tier: 1,
    description: "The asker's own medications: name, strength, dose, times, pharmacy, refill due. A child's medications are on Settings › Health for a parent; another adult's are theirs alone.",
    input: {},
    async run(_a, c) {
      const { data } = await c.sb.from("medications").select("id, name, strength, dose, times, pharmacy, refill_due, refills_remaining, finished").eq("person", c.userId).eq("finished", false).order("name");
      const rows = (data ?? []) as { id: string; name: string; strength: string | null; dose: string | null; times: string[]; pharmacy: string | null; refill_due: string | null; refills_remaining: number | null }[];
      return { ok: true, summary: rows.length ? `${rows.length} medication${rows.length === 1 ? "" : "s"} on your list.` : "No medications on your list. Add one under Settings › Health.", data: rows.map((m) => ({ id: m.id, name: `${m.name}${m.strength ? ` ${m.strength}` : ""}`, dose: m.dose, times: m.times, pharmacy: m.pharmacy, date: m.refill_due, refills: m.refills_remaining, href: "/meds" })), href: "/meds" };
    },
  },
  {
    name: "meds.add", title: "Add a medication", kind: "write", tier: 2,
    description: "Add a medication to the asker's own list, with dose and the times it is taken. For a child, say it is done under Settings › Health › the child; this tool cannot do that.",
    input: {
      name: { type: "string", describe: "The medication", required: true },
      strength: { type: "string", describe: "e.g. '5 mg'", required: false },
      dose: { type: "string", describe: "e.g. '1 tablet'", required: false },
      times: { type: "string", describe: "When, comma separated, e.g. '8 pm' or '8:00, 20:00'", required: false },
    },
    async run(a, c) {
      const { data: me } = await c.sb.from("profiles").select("display_name").eq("id", c.userId).maybeSingle();
      const times = str(a.times).split(",").map((t) => t.trim()).filter(Boolean);
      const { error } = await c.sb.from("medications").insert({ person: c.userId, name: str(a.name).slice(0, 120), strength: str(a.strength).slice(0, 60) || null, dose: str(a.dose).slice(0, 60) || null, times, added_by: me?.display_name ?? c.email });
      if (error) return { ok: false, error: error.message };
      return { ok: true, summary: `Added ${str(a.name)}${str(a.strength) ? ` ${str(a.strength)}` : ""}${times.length ? ` at ${times.join(", ")}` : ""} to your list.`, href: "/meds" };
    },
  },
  {
    name: "shop.orders", title: "Recent orders", kind: "read", tier: 1,
    description: "Recent online orders (Amazon, Smith's, Costco): placed when, how many items, status, delivery window, tracking note. Use for 'did the Amazon order ship', 'what's arriving'. The shopping list itself is kept on each person's device for now, so 'add milk' goes on the task list.",
    input: { text: { type: "string", describe: "Store or words, to narrow", required: false } },
    async run(a, c) {
      const { data } = await c.sb.from("orders").select("id, store, placed_at, item_count, total_note, status, window_note, tracking_note, source_href").order("placed_at", { ascending: false }).limit(20);
      const ws = words(str(a.text));
      const rows = ((data ?? []) as { id: string; store: string; placed_at: string; item_count: number; total_note: string | null; status: string; window_note: string | null; tracking_note: string | null; source_href: string | null }[]).filter((r) => !ws.length || matches(ws, `${r.store} ${r.status} ${r.tracking_note ?? ""}`));
      return { ok: true, summary: rows.length ? `${rows.length} recent order${rows.length === 1 ? "" : "s"}. The person sees them as rows.` : "No recent orders on record.", data: rows.map((r) => ({ id: r.id, name: `${r.store} · ${r.item_count} item${r.item_count === 1 ? "" : "s"} · ${r.status}`, date: r.placed_at.slice(0, 10), window: r.window_note, tracking: r.tracking_note, href: "/shop/orders" })), href: "/shop/orders" };
    },
  },
];
