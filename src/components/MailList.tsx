"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { MailRow } from "@/lib/data-mail";

function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (now.getTime() - d.getTime() < 6 * 864e5) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "2-digit" } : {}) });
}
export default function MailList({ rows, showAccount, draft }: { rows: MailRow[]; showAccount: boolean; draft: boolean }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return s ? rows.filter((r) => [r.from_name, r.from_addr, r.subject, r.snippet, ...r.to_addrs.map((t) => `${t.name} ${t.addr}`)].join(" ").toLowerCase().includes(s)) : rows; }, [rows, q]);
  return (
    <div>
      <div className="sticky z-10 bg-bg -mx-5 px-5 pt-2 pb-2" style={{ top: "calc(44px + env(safe-area-inset-top))" }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mail" aria-label="Search mail" autoComplete="off" className="w-full min-h-11 px-3 rounded-xl border border-line bg-bg text-sm" />
      </div>
      {shown.length === 0 && <div className="text-muted text-sm py-4">{q ? `No results for “${q}”.` : draft ? "No drafts." : "Inbox zero."}</div>}
      <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
        {shown.map((r) => {
          const who = draft ? `To: ${r.to_addrs.map((t) => t.name || t.addr).join(", ") || "(no recipient)"}` : r.from_name || r.from_addr || "Unknown";
          return (
            <Link key={r.id} href={`/mail/${r.id}`} prefetch={false} className="block px-3 py-2.5 min-h-11 bg-bg">
              <div className="flex items-baseline gap-2">
                {r.unread && <span aria-label="Unread" className="shrink-0 w-2 h-2 rounded-full bg-accent self-center" />}
                <span className={`min-w-0 flex-1 truncate ${r.unread ? "font-bold" : "font-semibold"}`}>{who}</span>
                <span className="shrink-0 text-xs text-muted">{when(r.sent_at)}</span>
              </div>
              <div className={`truncate text-sm ${r.unread ? "font-semibold" : ""}`}>{r.subject || "(no subject)"}{r.has_files ? " 📎" : ""}</div>
              <div className="truncate text-xs text-muted">{r.snippet}</div>
              {showAccount && <div className="text-[11px] text-muted truncate mt-0.5">{r.account}</div>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
