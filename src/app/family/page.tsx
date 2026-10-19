import Link from "next/link";
import { H1 } from "@/components/ui";
import { getOpenItems, getPeople, getSchedule, getViewer } from "@/lib/data-registers";

export const dynamic = "force-dynamic";

export default async function Family() {
  const [people, viewer] = await Promise.all([getPeople(), getViewer()]);
  const rows = await Promise.all(people.map(async (p) => ({ p, open: (await getOpenItems(p.id)).length, next: (await getSchedule(p.id))[0] })));
  return (
    <>
      <H1 right="One page per person">Family</H1>
      <div className="flex flex-col gap-2">
        {rows.map(({ p, open, next }) => (
          <Link key={p.id} href={`/family/${p.id}`} className="card flex items-center gap-3">
            <span className="w-11 h-11 rounded-full bg-accent text-white font-bold flex items-center justify-center shrink-0 display">{p.initials}</span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold block">{p.name}{p.id === viewer.id && <span className="text-xs text-muted font-normal"> · you</span>}</span>
              <span className="text-xs text-muted block truncate">{p.role === "parent" ? "Parent" : "Child"} · {open ? `${open} open item${open > 1 ? "s" : ""}` : "nothing open"}{next ? ` · next: ${next.title} ${next.time}` : ""}</span>
            </span>
            <span className="text-muted" aria-hidden>›</span>
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted mt-4">Each page shows only that person&apos;s items plus shared ones. Health is private to each adult; children&apos;s is visible to both parents. Add or pause a member in <Link href="/settings" className="text-accent font-semibold">Settings → People and access</Link>.</p>
    </>
  );
}
