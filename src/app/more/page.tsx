import Link from "next/link";
import { H1 } from "@/components/ui";
import { MORE_LINKS } from "@/lib/more-links";

export default function More() {
  const groups = ["Daily", "Reference", "Settings and Info"] as const;
  return (
    <>
      <H1>More</H1>
      {groups.map((g) => {
        const links = MORE_LINKS.filter((l) => l.group === g);
        if (!links.length) return null;
        return (
          <section key={g} className="mb-5">
            <div className="text-[11px] font-bold tracking-wide text-muted mb-1.5">{g.toUpperCase()}</div>
            <div className="flex flex-col">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="flex justify-between items-center min-h-12 border-b border-line">
                  <span className="font-semibold">{l.label}</span>
                  <span className="text-xs text-muted">{l.note ?? ""} ›</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
