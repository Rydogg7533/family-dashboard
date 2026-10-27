// The sender-rule reader, shared by email-agent.mjs (Gmail) and icloud-triage.mjs (iCloud).
// Reads APPROVED rows from email_rules once per run and answers "does a rule place this message?"
// before any model call. Proposed and off rows are never read here: a rule acts only after an owner
// tapped Activate on /review. No dependencies: Node 20+.
//
// Rule actions as the scripts apply them:
//   ignore   never a task, never sent to the model, mail left exactly where it is (iCloud) / untouched (Gmail)
//   archive  never a task, never sent to the model; iCloud moves it to Dashboard/Handled, Gmail leaves it (email-apply.mjs labels)
//   money    treated as a receipt: joins the Money pipeline, never sent to the model
//   record   worth keeping, nothing to do: iCloud → Dashboard/Records
//   task     always a task (skips the model's "needs nothing" judgement); the model still writes the title
// A sender match beats a domain match; an exact domain beats a parent domain (notify.wellsfargo.com before wellsfargo.com).

export async function loadRules(rest, { mailbox } = {}) {
  let rows = [];
  try { rows = await rest("GET", "email_rules?status=eq.approved&match_kind=in.(sender,domain)&select=id,match_kind,match_value,action,mailbox") || []; }
  catch (e) { return { rules: [], ruleFor: () => null, hits: new Map(), error: e.message }; }
  const rules = rows.filter((r) => !r.mailbox || !mailbox || String(r.mailbox).toLowerCase() === String(mailbox).toLowerCase())
    .map((r) => ({ ...r, match_value: String(r.match_value || "").trim().toLowerCase() })).filter((r) => r.match_value);
  const hits = new Map();
  function ruleFor(m) {
    const address = String(m.address || "").toLowerCase(), domain = String(m.domain || address.split("@")[1] || "").toLowerCase();
    let best = null, score = 0;
    for (const r of rules) {
      let s = 0;
      if (r.match_kind === "sender" && r.match_value === address) s = 3;
      else if (r.match_kind === "domain" && r.match_value === domain) s = 2;
      else if (r.match_kind === "domain" && domain.endsWith("." + r.match_value)) s = 1;
      if (s > score) { best = r; score = s; }
    }
    if (best) hits.set(best.id, (hits.get(best.id) || 0) + 1);
    return best;
  }
  return { rules, ruleFor, hits, error: null };
}

// Record how many messages each rule placed this run. Best effort; a failure here never stops a run.
export async function recordHits(rest, hits) {
  const at = new Date().toISOString(); let n = 0;
  for (const [id, count] of hits) {
    try {
      const cur = await rest("GET", `email_rules?id=eq.${id}&select=hit_count`);
      await rest("PATCH", `email_rules?id=eq.${id}`, { hit_count: (cur?.[0]?.hit_count || 0) + count, last_hit_at: at }, { Prefer: "return=minimal" });
      n++;
    } catch { /* counted next time */ }
  }
  return n;
}
