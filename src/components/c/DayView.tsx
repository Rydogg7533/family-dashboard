"use client";
import { useState } from "react";
import Link from "next/link";
import type { DayBlock, DayQuestion, DayRecordEntry, ChecklistItem } from "@/lib/data-day";
import { fmtTime, shortTime, weatherGlyph, weatherLine } from "@/lib/c-shared";
import { useToast } from "@/components/c/Toast";
import { Who } from "@/components/c/Who";
import { answerStop } from "@/app/day/actions";

const btn = "min-h-9 px-3 rounded-lg border border-line text-xs font-semibold hover:bg-soft";

export function QuestionsList({ questions }: { questions: DayQuestion[] }) {
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const { show, el } = useToast();
  const open = questions.filter((q) => !answered[q.id]);
  const top = open.slice(0, 5);
  if (!questions.length) return null;
  return (
    <section className="mb-5">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base">Questions for you</h2>
        <span className="text-xs text-muted">{open.length} open · each answer becomes a rule</span>
      </div>
      {top.length === 0 ? <div className="card text-muted text-sm">All answered. Thanks, that teaches the day record.</div> : (
        <div className="flex flex-col gap-2">
          {top.map((q) => (
            <div key={q.id} className="card flex flex-col gap-2">
              <div>
                <div className="text-[11px] font-bold tracking-wide text-amber">WHAT WAS THIS?</div>
                <div className="font-semibold">{q.window}</div>
                <div className="text-sm text-muted">{q.place_label}{q.days_waiting > 2 ? ` · waiting ${q.days_waiting} days` : ""}</div>
                <Who by="System" forPerson={q.for_person} source="Overland" className="mt-0.5" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {q.suggestions.map((s) => (
                  <button key={s} className={btn} onClick={async () => { let ans = s; if (s === "New place") { const typed = window.prompt("What is this place called?"); if (!typed?.trim()) return; ans = typed.trim(); } setAnswered((a) => ({ ...a, [q.id]: ans })); const r = await answerStop(q.id, ans); if (!r.ok) { setAnswered((a) => { const n = { ...a }; delete n[q.id]; return n; }); show(r.error ?? "Could not save"); return; } show(ans === "Skip" ? "Skipped · no rule made" : `Saved: ${ans} · will fill this next time`); }}>{s}</button>
                ))}
              </div>
            </div>
          ))}
          {open.length > top.length && <span className="text-sm font-semibold text-accent px-1">and {open.length - top.length} more</span>}
        </div>
      )}
      {el}
    </section>
  );
}

function Checklist({ block }: { block: DayBlock }) {
  const [items, setItems] = useState<ChecklistItem[]>(block.checklist?.items ?? []);
  const [openList, setOpenList] = useState(false);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [ask, setAsk] = useState<ChecklistItem | null>(null); // "remove this time only, or always?"
  const { show, el } = useToast();
  if (!block.checklist) return null;
  const active = items.filter((i) => i.layer !== "done_before");
  const packed = active.filter((i) => i.packed).length;
  return (
    <div className="mt-2 border-t border-line pt-2">
      <button className="w-full flex justify-between items-center min-h-9 text-sm font-semibold" onClick={() => setOpenList((v) => !v)} aria-expanded={openList}>
        <span>Bring: {packed} of {active.length} packed{block.checklist.draft ? <span className="text-amber font-semibold"> · draft, confirm or edit</span> : null}</span>
        <span className="text-muted">{openList ? "▴" : "▾"}</span>
      </button>
      {openList && (
        <div className="flex flex-col gap-1.5 mt-1">
          {items.map((i) => (
            <div key={i.id} className={`flex items-center gap-2 min-h-10 ${i.layer === "done_before" ? "opacity-60" : ""}`}>
              <input type="checkbox" className="w-5 h-5 shrink-0" checked={i.packed} disabled={i.layer === "done_before"} onChange={() => setItems((xs) => xs.map((x) => (x.id === i.id ? { ...x, packed: !x.packed } : x)))} aria-label={`Packed: ${i.label}`} />
              <span className="flex-1 text-sm">
                {i.label}
                {i.weather && <span className="ml-1 text-[11px] text-amber font-semibold">{weatherGlyph(block.weather?.icon ?? "cloud")} weather</span>}
                {i.learned && <span className="ml-1 text-[11px] text-muted font-semibold">learned from last time</span>}
                <span className="block text-[10px] text-muted">{i.added_by}</span>
                {i.layer === "done_before" && <button className="ml-1 text-[11px] text-accent font-semibold" onClick={() => setItems((xs) => xs.map((x) => (x.id === i.id ? { ...x, layer: "today" } : x)))}>include</button>}
              </span>
              {i.layer !== "done_before" && <button aria-label={`Remove ${i.label}`} className="text-muted min-w-9 min-h-9 rounded-lg hover:bg-soft" onClick={() => setAsk(i)}>−</button>}
            </div>
          ))}
          {ask && (
            <div className="card bg-soft text-sm flex flex-col gap-2">
              <div>Remove <b>{ask.label}</b> from this time only, or always for {block.checklist.activity.toLowerCase()}?</div>
              <div className="flex gap-2">
                <button className={btn} onClick={() => { const it = ask; setItems((xs) => xs.filter((x) => x.id !== it.id)); setAsk(null); show(`Removed ${it.label} this time`, () => setItems((xs) => [...xs, it])); }}>This time only</button>
                <button className={btn} onClick={() => { const it = ask; setItems((xs) => xs.filter((x) => x.id !== it.id)); setAsk(null); show(`Removed ${it.label} from ${block.checklist?.activity} always`, () => setItems((xs) => [...xs, it])); }}>Always</button>
                <button className={`${btn} border-transparent`} onClick={() => setAsk(null)}>Cancel</button>
              </div>
            </div>
          )}
          {adding ? (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; const it: ChecklistItem = { id: `n${Date.now()}`, label: text.trim(), layer: "today", packed: false, added_by: "You added just now" }; setItems((xs) => [...xs, it]); setText(""); setAdding(false); show(`Added ${it.label} · added twice becomes Always`, () => setItems((xs) => xs.filter((x) => x.id !== it.id))); }}>
              <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Item to bring" className="flex-1 min-h-10 rounded-lg border border-line bg-bg px-3 text-sm" />
              <button className={`${btn} bg-accent text-white border-accent`}>Add</button>
            </form>
          ) : (
            <button className="text-sm font-semibold text-accent text-left min-h-9" onClick={() => setAdding(true)}>+ add</button>
          )}
        </div>
      )}
      {el}
    </div>
  );
}

const KIND: Record<DayBlock["kind"], { text: string; cls: string }> = {
  calendar: { text: "CALENDAR", cls: "text-muted" }, inferred: { text: "FILLED FROM OVERLAND", cls: "text-accent" }, free: { text: "FREE", cls: "text-muted" }, unknown: { text: "UNKNOWN STOP", cls: "text-amber" },
};

export function Schedule({ blocks, viewer }: { blocks: DayBlock[]; viewer?: string }) {
  const [fix, setFix] = useState<string | null>(null);
  const { show, el } = useToast();
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((b) => (
        <div key={b.id} className={`card ${b.kind === "free" ? "opacity-70" : ""}`}>
          <div className="flex justify-between gap-2 items-start">
            <div className="min-w-0 flex-1">
              <div className={`text-[11px] font-bold tracking-wide ${KIND[b.kind].cls}`}>
                {KIND[b.kind].text}{b.confidence != null && ` · ${Math.round(b.confidence * 100)}% sure`}{b.person !== viewer && ` · ${b.person}`}
              </div>
              <div className="font-semibold text-base">{b.title}</div>
              <div className="text-sm text-muted">
                {fmtTime(b.start)}–{fmtTime(b.end)}{b.place ? ` · ${b.place}` : ""}{b.travel_min ? ` · ${b.travel_min} min drive` : ""}{b.driving ? ` · ${b.driving} driving` : ""}
              </div>
            </div>
            {b.kind === "inferred" && <button className={btn} onClick={() => setFix(fix === b.id ? null : b.id)}>Not this?</button>}
          </div>
          {fix === b.id && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["Errand", "Client visit", "Personal", "Private time"].map((s) => <button key={s} className={btn} onClick={() => { setFix(null); show(`Changed to ${s} · remembered for ${b.place}`); }}>{s}</button>)}
            </div>
          )}
          {b.weather && <div className="text-sm mt-1"><span className="text-amber">{weatherGlyph(b.weather.icon)}</span> {weatherLine(b.weather)}</div>}
          {b.kind === "unknown" && (
            <div className="text-sm text-muted mt-1">Too unsure to fill in. It's in <a href="#questions" className="font-semibold text-accent">Questions for you</a> below.</div>
          )}
          <Checklist block={b} />
          <Who by={b.requested_by} forPerson={b.person} source={b.source.name} href={b.source.href} className="mt-2" />
        </div>
      ))}
      {el}
    </div>
  );
}

const HOW: Record<DayRecordEntry["how"], string> = { calendar: "calendar", inferred: "filled from Overland", answered: "you answered", private: "private time · no question asked" };

export function DayRecord({ entries, dateLabel }: { entries: DayRecordEntry[]; dateLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mb-5">
      <button className="w-full flex items-baseline justify-between mb-2 min-h-9" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <h2 className="text-base">Day record · {dateLabel}</h2>
        <span className="text-xs text-muted">{entries.length} entries {open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="card flex flex-col">
          {entries.map((e) => (
            <div key={e.id} className="flex gap-3 py-2 border-b border-line last:border-0 text-sm">
              <div className="w-24 shrink-0 text-muted">{shortTime(e.start)}–{shortTime(e.end)}</div>
              <div className="min-w-0 flex-1">
                <div className={e.how === "private" ? "text-muted italic" : "font-semibold"}>{e.title === "?" ? "Waiting for your answer" : e.title}</div>
                <div className="text-xs text-muted">{e.place ?? ""}{e.place ? " · " : ""}<span className="font-semibold text-fg/80">{e.how === "answered" ? "You answered" : e.how === "private" ? "You paused" : "System"}</span> · for you · from {e.how === "calendar" ? "your calendar" : "Overland"}{e.learned ? ` · learned: ${e.learned}` : ""}</div>
              </div>
            </div>
          ))}
          <div className="text-xs text-muted pt-2">Places and times only; the raw track is never kept past 30 days. <Link href="/places" className="font-semibold text-accent">Open in Places</Link></div>
        </div>
      )}
    </section>
  );
}
