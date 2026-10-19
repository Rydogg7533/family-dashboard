"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { crumbsFor } from "@/components/TopBar";

// Page heading. The fixed top bar already names the page, so when this heading would only repeat it,
// it is kept for screen readers and only the side info (counts, back links) is shown.
// Headings that carry something the bar does not (a date, a task title, a person's name) stay visible.
export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const path = usePathname();
  const crumbs = crumbsFor(path);
  const here = crumbs[crumbs.length - 1]?.label;
  const redundant = typeof children === "string" && children.trim() === here;

  if (redundant) {
    return (
      <>
        <h1 className="sr-only">{children}</h1>
        {right && <div className="flex justify-end text-xs text-muted mb-3">{right}</div>}
      </>
    );
  }
  return (
    <div className="flex items-center justify-between mb-3 gap-3">
      <h1 className="text-2xl min-w-0">{children}</h1>
      {right && <div className="text-xs text-muted shrink-0">{right}</div>}
    </div>
  );
}
