import { getLog, ago } from "@/lib/data";
import { H1, Card } from "@/components/ui";


export const dynamic = "force-dynamic";

export default async function Log() {
  const rows = await getLog();
  return (
    <>
      <H1>Log</H1>
      <p className="text-xs text-muted mb-3">Everything the system did on its own, newest first. Undo where offered.</p>
      <div className="flex flex-col gap-1.5">
        {rows.length === 0 && <Card className="text-muted">Nothing yet.</Card>}
        {rows.map((r) => (
          <div key={r.id} className="flex justify-between gap-2 py-2 border-b border-line text-sm">
            <div><span className="font-semibold">{r.action}</span> · {r.subject}<div className="text-xs text-muted">{r.actor} · {ago(r.at)}</div></div>
            {r.undoable && <span className="text-xs text-muted self-center">undoable</span>}
          </div>
        ))}
      </div>
    </>
  );
}
