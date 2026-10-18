import { getStatus, overall, ago, HEARTBEAT_MAX_HOURS } from "@/lib/data";
import { Banner, Card, Chip, H1 } from "@/components/ui";

const names: Record<string, string> = { heartbeat: "Mac mini heartbeat", mirror: "Nightly mirror", time_machine: "Time Machine", free_space_mini: "Mac mini free space", free_space_8tb: "Rossiter 8TB free space" };

export const dynamic = "force-dynamic";

export default async function Health() {
  const status = await getStatus();
  const o = overall(status);
  const order = ["heartbeat", "mirror", "time_machine", "free_space_mini", "free_space_8tb"];
  const rows = [...status].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return (
    <>
      <H1>System health</H1>
      <div className="mb-4"><Banner level={o.level} text={o.text} /></div>
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
    </>
  );
}
