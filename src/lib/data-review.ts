import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { Task } from "@/lib/data";
import { getCandidates, type Candidate } from "@/lib/data-subscriptions";
import { stillDeciding, type Owned } from "@/lib/owned";

export type Verdict = "right" | "not_a_task" | "wrong_type";
export type Scope = "once" | "every_time";

// One email-made task, up for judgement. `from` is filled only where the message is still in the
// mailbox copy: the inbox is capped at the newest 300 per account (D51) and most of these tasks were
// made from mail going back to March, so for most of them the account and date are all there is.
export type TriageItem = {
  id: string;
  kind: Task["kind"];
  title: string;
  status: string;
  created_at: string;
  account: string | null;
  mailDate: string | null;
  url: string | null;
  from: string | null;
  fromAddress: string | null;               // the address itself, written by triage since D121; what a rule is made from
  verdict: Verdict | null;
  scope: Scope | null;
};

// A sender rule waiting for an owner's tap. Proposed by the coverage run, by "not a task, every time" on a
// triage card, or by an Explain on Money. Nothing acts on it until status = 'approved' (D121).
export type ProposedRule = {
  id: string;
  match_kind: "sender" | "domain";
  match_value: string;
  action: string;
  mailbox: string | null;
  note: string | null;
  origin: string | null;
  created_at: string;
};

export type Review = {
  stale: Task[];                            // open, overdue by more than a week
  deciding: Owned[];                        // replaced or gone things with no fate yet (D18); asked once a month
  asking: Candidate[];                      // subscription candidates nobody has answered
  rules: ProposedRule[];                    // sender rules proposed and not yet activated or declined
  activeRules: number;                      // how many sender rules are live
  triage: TriageItem[];                     // tasks email triage made, and whether anyone has judged them
  triageJudged: number;                     // how many of those already carry a verdict
  split: { who: string; n: number }[];      // tasks finished in the last seven days, by who finished them
  doneThisWeek: number;
  lastConfirmed: { at: string; by: string } | null;
};

// The week's open loops. Not a dashboard of the week: a short list of what the system has been holding,
// each settled with one tap. Six places in the app promised this page before it existed (decisions log
// 2026-10-26h, D99). Sections are added as the things that feed them come to exist -- unclassified
// documents and "what went to Other" are next. "Rules to approve" exists since D121: email-agent.mjs and
// icloud-triage.mjs read approved email_rules before the model, so activating one here changes what reaches you.
// Shown only with no Supabase env, so the section has a shape in preview. Three items because the
// three verdicts need to be reachable: one plainly right, one invented, one real work typed wrong.
const sampleRules: ProposedRule[] = [
  { id: "r1", match_kind: "domain", match_value: "[payments app].com", action: "ignore", mailbox: null, note: "61 messages in 90 days; none needed anything", origin: "coverage run", created_at: new Date().toISOString() },
];
const sampleTriage: TriageItem[] = [
  { id: "s1", kind: "do", title: "Renew the [Vehicle] registration before it expires", status: "open", created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), account: "[mailbox]", mailDate: "2026-10-20", url: null, from: "[State DMV]", fromAddress: null, verdict: null, scope: null },
  { id: "s2", kind: "decide", title: "Decide whether to keep the [Service] plan", status: "open", created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(), account: "[mailbox]", mailDate: "2026-10-19", url: null, from: null, fromAddress: null, verdict: null, scope: null },
  { id: "s3", kind: "reply", title: "Reply to [Contact] about the [Appointment]", status: "dismissed", created_at: new Date(Date.now() - 4 * 86_400_000).toISOString(), account: "[mailbox]", mailDate: "2026-10-18", url: null, from: "[Contact]", fromAddress: null, verdict: "wrong_type", scope: "once" },
];

export async function getReview(): Promise<Review> {
  if (!hasSupabaseEnv()) return { stale: [], deciding: [], asking: [], rules: sampleRules, activeRules: 0, triage: sampleTriage, triageJudged: 1, split: [], doneThisWeek: 0, lastConfirmed: null };
  const sb = await createClient();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [stale, asking, done, confirmed, triage, rules, active, deciding] = await Promise.all([
    sb.from("tasks").select("*").eq("status", "open").lt("due_at", weekAgo).order("due_at", { ascending: true }).limit(50),
    getCandidates(),
    sb.from("tasks").select("done_by").eq("status", "done").gte("updated_at", weekAgo),
    sb.from("activity_log").select("actor, at").eq("action", "week_confirmed").order("at", { ascending: false }).limit(1).maybeSingle(),
    getTriage(sb),
    sb.from("email_rules").select("id, match_kind, match_value, action, mailbox, note, origin, created_at").eq("status", "proposed").in("match_kind", ["sender", "domain"]).order("created_at", { ascending: true }).limit(60),
    sb.from("email_rules").select("id", { count: "exact", head: true }).eq("status", "approved").in("match_kind", ["sender", "domain"]),
    stillDeciding(sb).catch(() => [] as Owned[]),
  ]);
  const by = new Map<string, number>();
  for (const r of done.data ?? []) { const w = String(r.done_by ?? "").trim() || "Unknown"; by.set(w, (by.get(w) ?? 0) + 1); }
  return {
    stale: ((stale.data ?? []) as Task[]),
    deciding,
    asking: asking.filter((c) => c.status === "asking"),
    rules: ((rules.data ?? []) as ProposedRule[]),
    activeRules: active.count ?? 0,
    triage,
    triageJudged: triage.filter((t) => t.verdict !== null).length,
    split: [...by].map(([who, n]) => ({ who, n })).sort((a, b) => b.n - a.n),
    doneThisWeek: (done.data ?? []).length,
    lastConfirmed: confirmed.data ? { at: String(confirmed.data.at), by: String(confirmed.data.actor) } : null,
  };
}

// Tasks email triage made. `done` ones are left out: finishing a task is already a verdict that it was
// worth making. What needs judging is what is sitting open (did it deserve the space?) and what was
// dismissed (triage was wrong, and the pattern is worth recording before the reason is forgotten).
async function getTriage(sb: Awaited<ReturnType<typeof createClient>>): Promise<TriageItem[]> {
  const { data } = await sb.from("tasks")
    .select("id, kind, title, status, created_at, origins, origin_ref")
    .eq("origin_kind", "email").in("status", ["open", "dismissed"])
    .order("created_at", { ascending: false }).limit(120);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => String(r.id));
  const { data: verdicts } = await sb.from("task_reviews").select("task, verdict, scope").in("task", ids);
  const seen = new Map((verdicts ?? []).map((v) => [String(v.task), v]));

  // The sender, where the message survives in the mailbox copy. One query for the lot, matched on the
  // provider id triage recorded in origins; misses are normal and leave `from` null rather than guessing.
  const extIds = rows.flatMap((r) => (Array.isArray(r.origins) ? r.origins : []).map((o: { id?: string }) => o?.id).filter(Boolean) as string[]);
  const senders = new Map<string, string>();
  if (extIds.length > 0) {
    const { data: msgs } = await sb.from("mail_messages").select("ext_id, from_name, from_addr").in("ext_id", extIds.slice(0, 200));
    for (const m of msgs ?? []) {
      const label = String(m.from_name ?? "").trim() || String(m.from_addr ?? "").trim();
      if (m.ext_id && label) senders.set(String(m.ext_id), label);
    }
  }

  // Unjudged first, newest first within that: the page shows a dozen at a time, so the work queue
  // refills from the top as each one is answered rather than making a wall of 54 cards on a phone.
  return rows.map((r) => {
    const origins = (Array.isArray(r.origins) ? r.origins : []) as { id?: string; account?: string; date?: string; url?: string; from?: string; name?: string }[];
    const first = origins[0] ?? {};
    const v = seen.get(String(r.id));
    return {
      id: String(r.id),
      kind: r.kind as Task["kind"],
      title: String(r.title),
      status: String(r.status),
      created_at: String(r.created_at),
      account: first.account ?? null,
      mailDate: first.date ?? null,
      url: first.url ?? (r.origin_ref ? String(r.origin_ref) : null),
      from: origins.map((o) => o.name || o.from).find(Boolean) ?? origins.map((o) => (o.id ? senders.get(o.id) : undefined)).find(Boolean) ?? null,
      fromAddress: origins.map((o) => o.from).find(Boolean) ?? null,
      verdict: (v?.verdict as Verdict | undefined) ?? null,
      scope: (v?.scope as Scope | undefined) ?? null,
    };
  }).sort((a, b) => (a.verdict === null ? 0 : 1) - (b.verdict === null ? 0 : 1));
}
