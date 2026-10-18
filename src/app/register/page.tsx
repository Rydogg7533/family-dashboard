import { getRegister } from "@/lib/data";
import { Card, Chip, H1 } from "@/components/ui";

const statuses = ["DONE", "RUNNING", "TODO", "WAIT", "OUT"];

export const dynamic = "force-dynamic";

export default async function Register({ searchParams }: PageProps<"/register">) {
  const { status } = await searchParams;
  const all = await getRegister();
  const rows = typeof status === "string" ? all.filter((r) => r.status === status) : all;
  return (
    <>
      <H1 right={`${all.length} sources`}>Sources</H1>
      <div className="flex gap-1.5 flex-wrap text-xs font-semibold mb-3">
        <a href="/register" className={`px-3 py-1.5 rounded-full ${!status ? "bg-accent text-white" : "bg-soft"}`}>All</a>
        {statuses.map((s) => <a key={s} href={`/register?status=${s}`} className={`px-3 py-1.5 rounded-full ${status === s ? "bg-accent text-white" : "bg-soft"}`}>{s}</a>)}
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <Card key={r.id}>
            <div className="flex justify-between gap-2 items-start">
              <div className="font-semibold">{r.source}</div>
              <Chip status={r.status} />
            </div>
            <dl className="text-xs text-muted mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {r.kind && <><dt>Kind</dt><dd>{r.kind}</dd></>}
              {r.landed_at && <><dt>Landed</dt><dd className="text-fg">{r.landed_at}</dd></>}
              {r.route && <><dt>Route</dt><dd>{r.route}</dd></>}
              {r.backup && <><dt>Backup</dt><dd>{r.backup}</dd></>}
              {r.last_verified && <><dt>Verified</dt><dd>{r.last_verified}</dd></>}
              {r.open_items && <><dt>Open</dt><dd className="text-amber">{r.open_items}</dd></>}
            </dl>
          </Card>
        ))}
      </div>
    </>
  );
}
