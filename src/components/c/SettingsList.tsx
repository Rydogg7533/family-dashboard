"use client";
import { useMemo, useState } from "react";
import { Row, RowGroup, SectionTitle } from "@/components/registers";
import type { SettingGroup, SettingRow } from "@/lib/settings-links";

// Search is the way in when you know the word but not the group (F19.10); the groups are the way in when
// you don't. A group with no match disappears, so an empty page means the word is nowhere.
export function SettingsList({ groups, info }: { groups: SettingGroup[]; info: SettingRow[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const hit = (r: SettingRow) => !needle || r.label.toLowerCase().includes(needle) || r.sub.toLowerCase().includes(needle);

  const shown = useMemo(() => groups.map((g) => ({ ...g, rows: g.rows.filter(hit) })).filter((g) => g.rows.length > 0), [groups, needle]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shownInfo = useMemo(() => info.filter(hit), [info, needle]);   // eslint-disable-line react-hooks/exhaustive-deps
  const nothing = shown.length === 0 && shownInfo.length === 0;

  return (
    <>
      <label className="flex items-center gap-2 min-h-11 card !py-0 mb-2">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted shrink-0"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings" aria-label="Search settings"
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm py-2" />
        {q && <button type="button" onClick={() => setQ("")} className="text-xs font-semibold text-accent shrink-0 px-1">Clear</button>}
      </label>
      <p className="text-xs text-muted mb-1 px-1">Or just ask — &ldquo;turn off rain alerts&rdquo; works. Every setting shows who last changed it and when.</p>

      {nothing && <div className="card text-sm text-muted mt-3">Nothing matches &ldquo;{q}&rdquo;. Try asking instead.</div>}

      {shown.map((g) => (
        <section key={g.title}>
          <SectionTitle>{g.title}</SectionTitle>
          <RowGroup>{g.rows.map((r) => <Row key={r.href + r.label} href={r.href} label={r.label} sub={r.sub} />)}</RowGroup>
        </section>
      ))}

      {shownInfo.length > 0 && (
        <section className="mt-6 pt-5 border-t border-line">
          <SectionTitle right="nothing to change here">Info</SectionTitle>
          <RowGroup>{shownInfo.map((r) => <Row key={r.href} href={r.href} label={r.label} sub={r.sub} />)}</RowGroup>
        </section>
      )}
    </>
  );
}
