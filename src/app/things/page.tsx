import Link from "next/link";
import { Card, H1 } from "@/components/ui";
import { ThingForm } from "@/components/c/ThingForm";
import { getThings } from "@/lib/data-things";
import { getPeople } from "@/lib/data-registers";
import { isOwnerViewer } from "@/lib/owner";
import { STATUS_LABEL, type ThingStatus } from "@/lib/things-shared";

export const dynamic = "force-dynamic";

function href(p: Record<string, string | undefined>) {
  const q = Object.entries(p).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
  return q ? `/things?${q}` : "/things";
}

export default async function Things({ searchParams }: PageProps<"/things">) {
  const sp = await searchParams;
  const one = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  const q = one("q").trim(), cat = one("cat"), own = one("owner"), st = (one("status") || "active") as ThingStatus | "all";
  const [all, people, isOwner] = await Promise.all([getThings(), getPeople(), isOwnerViewer()]);
  const peopleOpts = people.map((p) => ({ key: p.childId ? `child:${p.childId}` : p.uuid ? `person:${p.uuid}` : "", label: p.name })).filter((p) => p.key);
  const label = (k: string) => (k === "shared" ? "Shared" : peopleOpts.find((p) => p.key === k)?.label ?? "Someone");

  const base = st === "all" ? all : all.filter((t) => t.status === st);
  const shown = base.filter((t) => (!cat || t.category.toLowerCase() === cat.toLowerCase()) && (!own || t.ownerKey === own) && (!q || `${t.name} ${t.category} ${t.location ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const cats = Array.from(new Set(all.map((t) => t.category))).sort();
  const noPhoto = all.filter((t) => t.status === "active" && t.photos === 0).length;
  const last = all[0];
  const chip = (on: boolean) => `shrink-0 rounded-full px-3 min-h-9 inline-flex items-center text-xs font-semibold border ${on ? "bg-accent text-white border-accent" : "border-line"}`;
  const keep = { q: q || undefined, cat: cat || undefined, owner: own || undefined, status: st === "active" ? undefined : st };

  return (
    <>
      <H1>Things</H1>
      <p className="text-sm text-muted mb-2">Everything the household owns, with photos. Nothing here is ever deleted: an item is marked sold, given away, lost or thrown out, and the history stays.</p>
      <Link href="/things/catalog" className="block mb-3"><div className="card text-sm font-semibold border-accent">Catalog everything you own, one area at a time <span className="text-accent">Open the guide</span></div></Link>
      <div className="mb-3"><ThingForm people={peopleOpts} isOwner={isOwner} lastCategory={last?.category} lastLocation={last?.location ?? undefined} /></div>
      {noPhoto > 0 && st === "active" && <Card className="text-sm mb-3">{noPhoto} {noPhoto === 1 ? "item has" : "items have"} no photo yet. Open one and tap Add the first photo.</Card>}
      <form action="/things" className="flex gap-2 mb-2">
        {cat && <input type="hidden" name="cat" value={cat} />}{own && <input type="hidden" name="owner" value={own} />}{st !== "active" && <input type="hidden" name="status" value={st} />}
        <input name="q" defaultValue={q} placeholder="Search name, category or place" className="flex-1 min-h-10 rounded-xl border border-line bg-bg px-3 text-sm" />
        <button className="min-h-10 px-4 rounded-xl border border-line text-sm font-semibold">Search</button>
      </form>
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Link href={href({ ...keep, cat: undefined })} className={chip(!cat)}>All</Link>
        {cats.map((c) => <Link key={c} href={href({ ...keep, cat: c })} className={chip(cat.toLowerCase() === c.toLowerCase())}>{c}</Link>)}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Link href={href({ ...keep, owner: undefined })} className={chip(!own)}>Everyone</Link>
        <Link href={href({ ...keep, owner: "shared" })} className={chip(own === "shared")}>Shared</Link>
        {peopleOpts.map((p) => <Link key={p.key} href={href({ ...keep, owner: p.key })} className={chip(own === p.key)}>{p.label}</Link>)}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-3">
        {(["active", "all", "undecided", "sold", "given_away", "lost", "discarded", "gone"] as const).map((s) => <Link key={s} href={href({ ...keep, status: s === "active" ? undefined : s })} className={chip(st === s)}>{s === "all" ? "Everything" : STATUS_LABEL[s]}</Link>)}
      </div>
      {shown.length === 0 && <Card className="text-sm text-muted">{all.length === 0 ? "Nothing here yet. Tap Add a thing, take a photo, and give it a name. That is all it needs." : "Nothing matches those filters."}</Card>}
      <div className="grid grid-cols-2 gap-2">
        {shown.slice(0, 200).map((t) => (
          <Link key={t.id} href={`/things/${t.id}`} className="card p-0 overflow-hidden flex flex-col">
            <div className="aspect-square bg-soft flex items-center justify-center text-muted text-xs">
              {t.photoId ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/thing-photo/${t.photoId}?t=1`} alt="" className="w-full h-full object-cover" loading="lazy" /> : "No photo"}
            </div>
            <div className="p-2 flex flex-col gap-0.5">
              <div className="text-sm font-semibold leading-tight">{t.name}</div>
              <div className="text-[11px] text-muted">{t.category} · {label(t.ownerKey)}{t.size ? ` · ${t.size}` : ""}</div>
              {t.location && <div className="text-[11px] text-muted">{t.location}</div>}
              {t.status !== "active" && <div className="text-[11px] font-bold text-amber">{STATUS_LABEL[t.status]}</div>}
            </div>
          </Link>
        ))}
      </div>
      {shown.length > 200 && <p className="text-xs text-muted mt-2">Showing the first 200. Use search or filters to narrow it.</p>}
      <Card className="mt-4 text-sm"><div className="font-semibold mb-1">Tracked elsewhere</div><div className="flex gap-x-4 gap-y-1 flex-wrap text-xs"><Link href="/vehicles" className="font-semibold text-accent">Vehicles</Link><Link href="/devices" className="font-semibold text-accent">Devices</Link><Link href="/warranties" className="font-semibold text-accent">Warranties</Link></div></Card>
    </>
  );
}
