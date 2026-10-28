"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { groupSheet, fmtClock } from "@/lib/sitter-shared";
import type { TabletState } from "@/lib/sitter-tablet";

// Kitchen tablet display. Large type, read-only, no navigation. Refreshes every 30 seconds so a note or a confirmation appears within half a minute,
// and returns to the clock by itself when the night ends.
export function TabletView({ state, sample = false }: { state: TabletState; sample?: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const a = setInterval(() => setNow(new Date()), 15_000); const b = setInterval(() => router.refresh(), 30_000); return () => { clearInterval(a); clearInterval(b); }; }, [router]);
  const clock = now ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const base = "fixed inset-0 overflow-y-auto bg-[#16181D] text-white";
  const font = { fontFamily: "'IBM Plex Sans', system-ui, sans-serif", lineHeight: 1.35 } as const;

  if (state.kind !== "active") {
    return (
      <div className={`${base} flex flex-col items-center justify-center text-center p-12`} style={font}>
        <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 120, fontWeight: 800 }}>{clock}</div>
        <div className="text-2xl mt-2" style={{ color: "#C9CED6" }}>{now?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
        {state.kind === "waiting" && <div className="text-2xl mt-10" style={{ color: "#F2C14E" }}>A parent is getting the sitter sheet ready…</div>}
        {sample && <div className="text-lg mt-10" style={{ color: "#C9CED6" }}>Preview mode: no sitter sheet.</div>}
      </div>
    );
  }
  const bySec = groupSheet(state.items).map((g) => ({ id: g.section, title: g.label, items: g.items as typeof state.items }));
  return (
    <div className={`${base} p-8`} style={font}>
      <div className="flex justify-between items-start gap-6 mb-6">
        <div>
          <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 44, fontWeight: 800 }}>{state.sitterName ? `Welcome, ${state.sitterName}` : "Tonight’s sitter sheet"}</div>
          <div className="text-2xl mt-1" style={{ color: "#C9CED6" }}>Parents are {state.place ? `at ${state.place}` : "out"} · back around {fmtClock(state.backBy)}</div>
        </div>
        <div style={{ fontFamily: "Manrope, sans-serif", fontSize: 56, fontWeight: 800 }}>{clock}</div>
      </div>
      {state.note && (
        <div className="rounded-2xl p-6 mb-6" style={{ background: "#27406B" }}>
          <div className="text-sm font-bold tracking-widest mb-1" style={{ color: "#BBD2FF" }}>NOTE FROM THE PARENTS</div>
          <div style={{ fontSize: 34 }} className="whitespace-pre-wrap">{state.note}</div>
        </div>
      )}
      {state.visitOnly && (
        <div className="rounded-2xl p-6 mb-6" style={{ background: "#3B2F12" }}>
          <div className="text-sm font-bold tracking-widest mb-1" style={{ color: "#F2C14E" }}>JUST FOR TONIGHT</div>
          <div style={{ fontSize: 30 }} className="whitespace-pre-wrap">{state.visitOnly}</div>
        </div>
      )}
      <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        {bySec.map((s) => (
          <section key={s.id} className="rounded-2xl p-6" style={{ background: "#20242B" }}>
            <h2 style={{ fontFamily: "Manrope, sans-serif", fontSize: 28, fontWeight: 800, marginBottom: 12 }}>{s.title}</h2>
            <ul className="flex flex-col gap-3">
              {s.items.map((i) => (
                <li key={i.id} className="flex gap-4 items-center" style={{ fontSize: 26 }}>
                  {i.photoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={i.photoUrl} alt="" className="w-24 h-24 rounded-xl object-cover shrink-0" />}
                  <span className="whitespace-pre-wrap">{i.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
