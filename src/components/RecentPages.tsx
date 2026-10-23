"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MORE_LINKS, moreLinkFor, type MoreLink } from "@/lib/more-links";
import { MoreIcon } from "@/components/MoreIcons";

// "Recently opened": the last pages opened from the More list, remembered on this device only
// (browser storage; nothing is sent anywhere, and it is simply empty if storage is unavailable).
const KEY = "more-recent-v1";
const SHOW = 4;

function read(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}

export function RecentTracker() {
  const path = usePathname();
  useEffect(() => {
    const l = moreLinkFor(path);
    if (!l) return;
    try {
      const next = [l.href, ...read().filter((h) => h !== l.href)].slice(0, 8);
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch { /* storage unavailable: the row just stays empty */ }
  }, [path]);
  return null;
}

export function RecentRow() {
  const [items, setItems] = useState<MoreLink[]>([]);
  useEffect(() => {
    const byHref = new Map(MORE_LINKS.map((l) => [l.href, l]));
    setItems(read().map((h) => byHref.get(h)).filter((l): l is MoreLink => !!l).slice(0, SHOW));
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="mb-5" aria-label="Recently opened">
      <div className="text-xs font-semibold text-muted mb-2">Recently opened</div>
      <div className="flex flex-wrap gap-2">
        {items.map((l) => (
          <Link key={l.href} href={l.href} className="inline-flex items-center gap-2 min-h-11 px-3 rounded-full border border-line bg-soft text-sm font-semibold">
            <MoreIcon name={l.icon} size={18} className="text-muted" />{l.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
