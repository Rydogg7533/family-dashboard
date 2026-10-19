import { getCalendarEvents, getDayBlocks, daySummary, shortTime } from "@/lib/data-day";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import { TvScreen, type TvData } from "@/components/c/TvScreen";

export const dynamic = "force-dynamic";

// F19.6 household screen for the family room TV (an old MacBook Air in kiosk mode, see scripts/tv-kiosk.md).
// Read-only. No money, health, tasks or messages. No login: the route is public in sample mode.
// PRODUCTION: src/proxy.ts lets /tv through without a session; this page must then require a device token
// (?token=… on first load, stored as a cookie) matched against device_tokens kind='tv', issued and revocable in
// Settings ("Family room TV"), valid only from the home network. Until that check is wired, /tv renders sample data only.
export default async function Tv({ searchParams }: PageProps<"/tv">) {
  const sp = await searchParams;
  const wallpaper = (["plain", "clock", "photos"].includes(String(sp.wallpaper)) ? String(sp.wallpaper) : "plain") as "plain" | "clock" | "photos";
  const token = typeof sp.token === "string" ? sp.token : null;

  if (hasSupabaseEnv() && !token) {
    return <div className="fixed inset-0 bg-[#16181D] text-white flex items-center justify-center text-3xl p-16 text-center">This screen needs its device token. Issue one in Settings › Family room TV and open /tv?token=…</div>;
  }
  // TODO(production): verify `token` against device_tokens (kind='tv', not revoked) with the service role, set a cookie, and read live rows.

  const [blocks, events] = await Promise.all([getDayBlocks(), getCalendarEvents(undefined, 1)]);
  const s = daySummary(blocks);
  const tomorrowIso = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const tomorrow = events.filter((e) => e.date === tomorrowIso).map((e) => `${e.title.charAt(0).toLowerCase() + e.title.slice(1)} ${e.start ? shortTime(e.start) : ""}`.trim()).join(" · ") || "nothing on the calendar";
  const byPerson = (name: string) => blocks.filter((b) => b.person === name && b.kind !== "free" && b.kind !== "unknown").map((b) => ({ time: shortTime(b.start), text: `${b.title}${b.driving && b.person !== b.driving ? ` · ${b.driving} driving` : b.driving ? " · driving" : ""}${b.checklist?.items.some((i) => i.weather && !i.packed) ? ` · ${b.checklist.items.find((i) => i.weather && !i.packed)!.label.toLowerCase()}` : ""}`, highlight: (b.weather?.precip ?? 0) >= 50 || Boolean(b.driving) }));

  const data: TvData = {
    dateLabel: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    weatherLine: s.line.replace(/\.$/, "").replace(". ", " · "),
    dinner: "[planned meal]",
    people: [
      { name: "Ryan", lines: byPerson("Ryan") },
      { name: "Melissa", lines: [...byPerson("Melissa"), { time: "6:00", text: "Free" }] },
      { name: "[Child 1]", lines: [{ time: "8:00", text: "School" }, ...byPerson("[Child 1]")], jobs: [{ text: "feed the dog", done: false }, { text: "piano", done: true }] },
      { name: "[Child 2]", lines: [{ time: "8:00", text: "School" }, { time: "3:30", text: "Home" }], jobs: [{ text: "dishes", done: false }] },
    ],
    bring: s.bring.length ? s.bring.map((b) => b.replace(/ for .*$/, "")).join(", ") + " · cleats, shin guards, water" : "nothing extra",
    tomorrow,
  };
  return <TvScreen data={data} wallpaper={wallpaper} />;
}
