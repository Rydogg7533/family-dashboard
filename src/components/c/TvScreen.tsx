"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type TvPerson = { name: string; lines: Array<{ time: string; text: string; highlight?: boolean }>; jobs?: Array<{ text: string; done: boolean }> };
export type TvData = { dateLabel: string; weatherLine: string; dinner: string; people: TvPerson[]; bring: string; tomorrow: string };

// F19.6: the household screen. 1920x1080, dark, large type, read-only, no nav, no login beyond the device token.
// Fixed full-viewport so it escapes the phone-width main. Refreshes every 5 minutes; dims between 10 pm and 6 am.
export function TvScreen({ data, wallpaper = "plain" }: { data: TvData; wallpaper?: "plain" | "clock" | "photos" }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 30_000);
    const refresh = setInterval(() => router.refresh(), 5 * 60_000);
    return () => { clearInterval(tick); clearInterval(refresh); };
  }, [router]);
  const hour = now?.getHours() ?? 12;
  const night = hour >= 22 || hour < 6;
  const clock = now ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/ (AM|PM)$/, "") : "";
  const muted = "#C9CED6";

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: wallpaper === "photos" ? "linear-gradient(rgba(22,24,29,.78), rgba(22,24,29,.78)), linear-gradient(135deg, #2b3a4a, #16181D)" : "#16181D", color: "#FFF", fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: 28, lineHeight: 1.35, padding: "64px 72px", display: "flex", flexDirection: "column", gap: 40, opacity: night ? 0.45 : 1 }}>
      {wallpaper === "clock" ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope, sans-serif", fontSize: 420, fontWeight: 800, color: "#FFFFFF08", pointerEvents: "none" }}>{clock}</div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>{data.dateLabel}</div>
          <div style={{ fontSize: 30, color: muted, marginTop: 8 }}>{data.weatherLine}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 96, fontWeight: 800, lineHeight: 1, minHeight: 96 }}>{clock}</div>
          <div style={{ fontSize: 24, color: muted }}>Dinner tonight: {data.dinner}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.people.length}, minmax(0, 1fr))`, gap: 32, flex: 1, minHeight: 0 }}>
        {data.people.map((p) => (
          <div key={p.name} style={{ background: "#22262E", borderRadius: 28, padding: 32, display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
            <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 36, fontWeight: 800 }}>{p.name}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 26 }}>
              {p.lines.map((l, i) => <div key={i} style={{ color: l.highlight ? "#F0B36A" : undefined }}><span style={{ color: muted }}>{l.time}</span> {l.text}</div>)}
            </div>
            {p.jobs && p.jobs.length > 0 && <div style={{ marginTop: "auto", fontSize: 22, color: muted }}>Jobs: {p.jobs.map((j) => `${j.text} ${j.done ? "☑" : "☐"}`).join(" · ")}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 24, color: muted }}>
        <div><span style={{ color: "#F0B36A", fontWeight: 600 }}>Bring today:</span> {data.bring}</div>
        <div>Tomorrow: {data.tomorrow}</div>
      </div>
    </div>
  );
}
