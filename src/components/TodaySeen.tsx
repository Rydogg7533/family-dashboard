"use client";
import { useEffect } from "react";

// Opening Today means everything in the queue has been seen: clear the app icon badge (the Today tab badge clears on
// the next badge fetch, since the page just stamped today_seen_at). Badging API is absent on some browsers; ignored then.
export function TodaySeen() {
  useEffect(() => {
    const n = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    n.clearAppBadge?.().catch(() => {});
  }, []);
  return null;
}
