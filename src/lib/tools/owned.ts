import "server-only";
import type { Tool } from "@/lib/tools/types";
import { str } from "@/lib/tools/types";
import { FATES, SOURCES, applyFate, findOwned, getOwned, linkReplacement, type Fate } from "@/lib/owned";

// D18: what the household owns, as one conversation. Before anything is added, Ask reads owned.similar so it can ask
// "new, or replacing the one you have?"; owned.fate records what happened to the old one, and "not sure yet" is an answer.
export const ownedTools: Tool[] = [
  {
    name: "owned.similar", title: "Do we already own one of these?", kind: "read", tier: 1,
    description: "Everything the household owns that matches some words, across things, devices and vehicles: name, whose, status, since when, and a ref for owned.fate or the replaces argument. ALWAYS call this before thing.add, device.add or vehicle changes when the person got something new, so you can ask whether it replaces one they have. Also for 'what happened to the old iPad', 'do we still have the drill'.",
    input: { text: { type: "string", describe: "Words from the kind of thing (iPad, drill, car seat), the brand, or whose", required: true } },
    async run(a, c) {
      const rows = await findOwned(c.sb, str(a.text), { includeGone: true });
      const shown = rows.slice(0, 8).map((o) => ({ ref: o.ref, name: o.name, whose: o.owner, status: o.status, since: o.since, detail: o.detail, href: o.href }));
      return { ok: true, summary: rows.length ? `${rows.length} owned thing${rows.length === 1 ? "" : "s"} like "${str(a.text)}": ${shown.map((o) => `${o.name} (${o.whose}, ${o.status}${o.since ? `, since ${o.since}` : ""}, ref ${o.ref})`).join("; ")}. If the person got a new one, ask whether it replaces one of these or is an extra; name them in a sentence, never a list.` : `Nothing owned matches "${str(a.text)}"; a new one is simply new.`, data: shown.map((o) => ({ name: o.name, detail: `${o.whose} · ${o.status}`, href: o.href })) };
    },
  },
  {
    name: "owned.fate", title: "What happens to a thing", kind: "write", tier: 1,
    description: `What happened, or will happen, to something the household owns: spare (kept), sell, give (to someone outside; 'to' names them), hand_down (to a household member; 'to' is their first name; the thing becomes theirs), trade_in, trash, lost, undecided ("not sure yet": nothing changes, the review asks again in a month), gone (it left the house, nobody recorded how). Get the ref from owned.similar. "Get rid of it" is not a fate: ask sell, give or trash. "Give it to family" needs a name: ask who.`,
    input: { ref: { type: "string", describe: "The thing's ref from owned.similar, like device:<id>", required: true }, fate: { type: "enum", options: [...FATES], describe: "What happens to it", required: true }, to: { type: "string", describe: "Who gets it (a household first name for hand_down; anyone for give)" }, note: { type: "string", describe: "For how much, where, anything said" } },
    async run(a, c) {
      const cur = await getOwned(c.sb, str(a.ref)); if (!cur) return { ok: false, error: "Which thing? Read owned.similar first." };
      const r = await applyFate(c.sb, str(a.ref), str(a.fate) as Fate, str(a.to) || undefined, str(a.note) || undefined, c.email);
      return r.ok ? { ok: true, summary: `${r.said}.`, href: cur.href } : { ok: false, error: r.error };
    },
  },
];

// Shared by thing.add and device.add: how it arrived, and what it replaced.
export const arrivalInput = {
  source: { type: "enum" as const, options: [...SOURCES], describe: "How it arrived: bought (default), gift, hand_me_down, inherited, won" },
  from: { type: "string" as const, describe: "Who it came from, when a gift or hand-me-down" },
  replaces: { type: "string" as const, describe: "The ref (from owned.similar) of the thing this one takes over from, when the person said it is a replacement" },
  fate: { type: "enum" as const, options: [...FATES], describe: "What happens to the replaced one, if the person said; undecided when they are not sure yet" },
  fateTo: { type: "string" as const, describe: "Who gets the replaced one, for hand_down or give" },
};
export async function afterArrival(c: { sb: Parameters<typeof applyFate>[0]; email: string }, newRef: string, a: Record<string, unknown>): Promise<string> {
  const rep = str(a.replaces); if (!rep) return "";
  const old = await getOwned(c.sb, rep); if (!old) return " (I could not find the one it replaces; say which with owned.similar)";
  await linkReplacement(c.sb, newRef, rep);
  const fate = str(a.fate) as Fate | "";
  if (!fate) return `. It replaces ${old.name}; what happens to that one (spare, sell, give, hand down, trade in, trash, or not sure yet)?`;
  const r = await applyFate(c.sb, rep, fate, str(a.fateTo) || undefined, undefined, c.email);
  return r.ok ? `. It replaces ${old.name}: ${r.said}` : `. It replaces ${old.name}, but ${r.error}`;
}
