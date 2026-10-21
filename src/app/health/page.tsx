import { getStatus, overall, ago, HEARTBEAT_MAX_HOURS } from "@/lib/data";
import { Banner, Card, Chip, H1 } from "@/components/ui";
import { listIssues } from "@/app/issues/actions";
import { ReportIssueButton } from "@/components/ReportIssue";

const names: Record<string, string> = { heartbeat: "Mac mini heartbeat", mirror: "Nightly mirror", time_machine: "Time Machine", free_space_mini: "Mac mini free space", free_space_8tb: "Rossiter 8TB free space" };

export const dynamic = "force-dynamic";

const ISSUE_LABEL: Record<string, string> = { open: "Open", needs_info: "Needs your info", fixed: "Fixed", cannot_reproduce: "Can't reproduce", by_design: "By design", duplicate: "Duplicate" };
const ISSUE_CLS: Record<string, string> = { open: "bg-amber-bg text-amber", needs_info: "bg-red-bg text-red", fixed: "bg-green-bg text-green", cannot_reproduce: "bg-soft text-muted", by_design: "bg-soft text-muted", duplicate: "bg-soft text-muted" };
const SEV_LABEL: Record<string, string> = { blocks: "blocks", annoying: "annoying", cosmetic: "cosmetic", idea: "idea" };

export default async function Health() {
  const [status, issues] = await Promise.all([getStatus(), listIssues()]);
  const o = overall(status);
  const order = ["heartbeat", "mirror", "time_machine", "free_space_mini", "free_space_8tb"];
  const rows = [...status].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return (
    <>
      <H1>System health</H1>
      <div className="mb-4"><Banner level={o.level} text={o.text} /></div>
      <div className="text-xs text-muted mb-4">Server region: <span className="font-semibold text-fg">{process.env.VERCEL_REGION ?? "local"}</span> (the database is in us-west-1; sfo1 is next to it) · version {(process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7)}</div>
      <div className="flex flex-col gap-2">
        {rows.map((s) => (
          <Card key={s.key}>
            <div className="flex justify-between items-center gap-2">
              <div className="font-semibold">{names[s.key] ?? s.key}</div>
              <Chip status={s.state} />
            </div>
            <div className="text-sm mt-1">{s.summary}</div>
            {s.value_num != null && s.key.startsWith("free_space") && (
              <div className="mt-2 h-2 rounded-full bg-soft overflow-hidden"><div className={`h-full ${s.value_num < 15 ? "bg-amber" : "bg-green"}`} style={{ width: `${Math.min(100, s.value_num)}%` }} /></div>
            )}
            {s.detail && <div className="text-xs text-muted mt-1">{s.detail}</div>}
            <div className="text-xs text-muted mt-1">updated {ago(s.updated_at)}</div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted mt-4">Red if the Mac mini has not reported in {HEARTBEAT_MAX_HOURS} hours (asleep, offline, or the 8TB unplugged).</p>

      <div className="flex justify-between items-center mt-8 mb-2">
        <h2 className="text-lg">Your reports</h2>
        <ReportIssueButton className="min-h-9 px-3 rounded-full bg-accent text-white text-sm font-semibold" />
      </div>
      {issues.length === 0 ? (
        <Card className="text-sm text-muted">Nothing reported yet. Use the + button on any page, or the button above. One problem per report, in your words.</Card>
      ) : (
        <div className="flex flex-col gap-2">
          {issues.map((i) => (
            <Card key={i.id}>
              <div className="flex justify-between items-start gap-2">
                <div className="font-semibold text-[15px] min-w-0">{i.text}</div>
                <span className={`shrink-0 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${ISSUE_CLS[i.status] ?? "bg-soft"}`}>{ISSUE_LABEL[i.status] ?? i.status}</span>
              </div>
              <div className="text-xs text-muted mt-1">{i.reporter_name ?? "someone"} · {SEV_LABEL[i.severity] ?? i.severity} · {i.page}{i.item_kind ? ` · ${i.item_kind}` : ""} · {ago(i.created_at)}{i.app_version ? ` · v${i.app_version}` : ""}</div>
              {i.screenshots && i.screenshots.length > 0 && <div className="text-xs mt-1.5 flex gap-3">{i.screenshots.map((_, n) => <a key={n} href={`/api/issue-shot/${i.id}/${n}`} target="_blank" rel="noreferrer" className="font-semibold text-accent">Screenshot {n + 1}</a>)}</div>}
              {i.status_note && <div className="text-sm mt-1.5">{i.status_note}{i.fixed_in ? <span className="text-muted"> · fixed in {i.fixed_in}</span> : null}</div>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
