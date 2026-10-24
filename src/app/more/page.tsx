import Link from "next/link";
import { H1 } from "@/components/ui";
import { MORE_GROUPS, MORE_LINKS } from "@/lib/more-links";
import { MoreIcon } from "@/components/MoreIcons";
import { RecentRow } from "@/components/RecentPages";
import { getViewer } from "@/lib/data-registers";
import SignOut from "@/components/c/SignOut";

export const dynamic = "force-dynamic";

// Four sections of two-column tiles. Each section has its own color (tokens in globals.css), icon and count;
// the tile shape is the same everywhere, so a section is recognised by color, icon and heading.
export default async function More() {
  const viewer = await getViewer();
  return (
    <>
      <H1>More</H1>
      <RecentRow />
      {MORE_GROUPS.map((g) => {
        const links = MORE_LINKS.filter((l) => l.group === g.id);
        if (!links.length) return null;
        return (
          <section key={g.id} data-sec={g.sec} aria-labelledby={`more-${g.id}`} className="sec sec-panel mb-5">
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className="sec-badge w-9 h-9 rounded-full flex items-center justify-center"><MoreIcon name={g.icon} size={20} /></span>
              <h2 id={`more-${g.id}`} className="sec-title text-lg flex-1">{g.label}</h2>
              <span className="sec-badge text-xs font-bold rounded-full px-2.5 py-0.5">{links.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {links.map((l) => (
                <Link key={l.href} href={l.href}
                  className={`sec-tile min-h-[76px] p-3 flex ${l.wide ? "col-span-2 min-h-[60px] flex-row items-center gap-2.5" : "flex-col justify-between"}`}>
                  <MoreIcon name={l.icon} className="sec-ic shrink-0" />
                  <span className="text-sm font-semibold leading-tight">{l.label}</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      <SignOut who={viewer.name} />
    </>
  );
}
