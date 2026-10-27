"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { askAction, confirmAskEvent, confirmMoveAndAdd, confirmInstruction, confirmTool, parkThreadInInbox, flagAskReply } from "@/lib/ai-actions";
import type { AskReply, Turn } from "@/lib/ask-engine";
import { FetchButton } from "@/components/FetchButton";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const WINDOW_TURNS = 12;
// The on-screen thread and the model's context are the same window; everything before it is on /ask/history.
const inWindow = (bs: Bubble[]) => { const cut = Date.now() - WINDOW_MS; return bs.filter((b) => (b.at ?? 0) >= cut); };

const SUGGESTED = ["What needs me today?", "Where is the Sienna registration?", "Add melatonin for [Child 1] at 8 pm", "Find a 16x25x1 MERV 11 filter", "Save confirmation 8X4K2 for the Moab hotel Nov 3"];

type Bubble = { at?: number; role: "user" | "assistant"; text: string; reply?: AskReply; confirmed?: "saved" | "undone" | "changed"; flagged?: boolean; toolResult?: { ok: boolean; text: string; href?: string }; eventResult?: { ok: boolean; text: string; href?: string } };

// embedded: the same Ask, inside the sheet the + button opens on any page (one thread, two places to open it).
// source names where it was asked from; onPending tells the sheet whether a confirm card is still waiting.
export function AskChat({ prefill, sample, who, embedded, source, onPending }: { prefill: string; sample: boolean; who: string; embedded?: boolean; source?: string; onPending?: (pending: boolean) => void }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [spent, setSpent] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const sent = useRef(false);
  const restored = useRef(false);

  // The thread survives leaving the page (F4): it is kept in this browser, per person, until "New chat".
  // Only this device sees it; nothing about the thread goes to the database from here.
  const storeKey = `ask-thread:${who}`;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storeKey);
      if (raw) { const saved = JSON.parse(raw) as { bubbles?: Bubble[]; spent?: number }; if (Array.isArray(saved.bubbles)) setBubbles(inWindow(saved.bubbles)); if (typeof saved.spent === "number") setSpent(saved.spent); }
    } catch { /* storage unavailable: the thread just lives for this visit */ }
    restored.current = true;
  }, [storeKey]);
  useEffect(() => {
    if (!restored.current) return;
    try { window.localStorage.setItem(storeKey, JSON.stringify({ bubbles: inWindow(bubbles).slice(-60), spent })); } catch { /* ignore */ }
  }, [bubbles, spent, storeKey]);
  function newChat() {
    setBubbles([]); setSpent(0); setInput("");
    try { window.localStorage.removeItem(storeKey); } catch { /* ignore */ }
  }

  useEffect(() => { if (prefill && !sent.current) { sent.current = true; void send(prefill); } }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [bubbles, busy]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 10_000); return () => clearTimeout(t); }, [toast]);

  // One tap files the miss with its trace; the maintainer reads the issue, fixes it, and the question joins the set.
  async function flag(i: number) {
    const b = bubbles[i]; if (!b?.reply) return;
    const q = [...bubbles.slice(0, i)].reverse().find((x) => x.role === "user")?.text ?? "";
    const r = await flagAskReply(q, b.reply);
    if (r.ok) { setBubbles((cur) => cur.map((x, j) => (j === i ? { ...x, flagged: true } : x))); setToast({ text: "Filed for the maintainer with what Ask looked at." }); }
    else setToast({ text: r.error ?? "Could not file it." });
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const next: Bubble[] = [...bubbles, { at: Date.now(), role: "user", text: q }];
    setBubbles(next);
    setBusy(true);
    // The model sees the recent window only (last 24 h, at most 12 turns); older exchanges are in history and
    // reachable through the ask.history tool, so an answer costs the same on day 30 as on day 1.
    const thread: Turn[] = inWindow(next).slice(-WINDOW_TURNS).map((b) => ({ role: b.role, text: b.text, kind: b.reply?.kind }));
    const reply = await askAction(thread, undefined, source ?? "ask");
    setSpent((s) => s + reply.cost);
    if (reply.kind === "inbox") void parkThreadInInbox(thread);
    const bubble: Bubble = { at: Date.now(), role: "assistant", text: reply.text, reply };
    // Tier 1 saves at once with Undo; no card.
    if (reply.kind === "instruction" && reply.confirm?.tier === 1) {
      bubble.confirmed = "saved";
      void confirmInstruction(reply.confirm.summary, reply.confirm.target, 1);
      setToast({ text: `Saved: ${reply.confirm.summary}`, undo: () => setBubbles((bs) => bs.map((b) => (b === bubble ? { ...b, confirmed: "undone" } : b))) });
    }
    setBubbles([...next, bubble]);
    setBusy(false);
  }

  // A write the model chose. It has not run yet; this is where the person agrees to it.
  async function runChosen(i: number) {
    const t = bubbles[i].reply?.tool; if (!t) return;
    setBusy(true);
    const r = await confirmTool(t.name, t.args).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "That did not work." }));
    setBusy(false);
    setBubbles((bs) => bs.map((x, j) => (j === i ? { ...x, toolResult: r.ok ? { ok: true, text: r.summary, href: r.href } : { ok: false, text: r.error } } : x)));
    // A send hands off to the phone's own Messages (F26): the app opens it with the text ready; the person taps Send there.
    if (r.ok && r.href?.startsWith("sms:")) window.location.assign(r.href);
  }

  async function confirm(i: number) {
    const b = bubbles[i];
    if (!b.reply?.confirm) return;
    await confirmInstruction(b.reply.confirm.summary, b.reply.confirm.target, b.reply.confirm.tier);
    setBubbles((bs) => bs.map((x, j) => (j === i ? { ...x, confirmed: "saved" } : x)));
    setToast({ text: `Saved to ${b.reply.confirm.target}. Logged with your words as the source.` });
  }

  async function addEvent(i: number) {
    const d = bubbles[i]?.reply?.draft;
    if (!d || busy) return;
    setBusy(true);
    const mv = bubbles[i].reply?.move;
    const r = await (mv ? confirmMoveAndAdd(mv, d, bubbles[i].reply?.feedId) : confirmAskEvent(d, bubbles[i].reply?.feedId)).catch((e) => ({ ok: false as const, error: String(e?.message ?? e).slice(0, 160) }));
    setBubbles((bs) => bs.map((x, j) => (j === i ? { ...x, eventResult: r.ok ? { ok: true, text: r.summary, href: r.href } : { ok: false, text: r.error } } : x)));
    setBusy(false);
  }

  const last = bubbles[bubbles.length - 1];
  const chips = last?.reply?.chips ?? (bubbles.length === 0 ? SUGGESTED : []);
  const pending = !!last && last.role === "assistant" && ((last.reply?.kind === "tool_confirm" && !last.toolResult) || ((last.reply?.kind === "event_confirm" || last.reply?.kind === "event_move") && !last.eventResult) || (last.reply?.kind === "instruction" && !!last.reply.confirm && !last.confirmed));
  useEffect(() => { onPending?.(pending); }, [pending, onPending]);

  return (
    <div className={embedded ? "flex flex-col" : "flex flex-col min-h-[calc(100vh-140px)]"}>
      <div className="flex items-center justify-end mb-1">
        <h1 className="sr-only">Ask</h1>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted">{sample ? "sample mode · no API key" : `~$${spent.toFixed(3)} this session`}</div>
          {bubbles.length > 0 && <button type="button" onClick={newChat} className="min-h-9 px-3 rounded-full bg-soft text-xs font-semibold">New chat</button>}
        </div>
      </div>
      {!embedded && <p className="text-xs text-muted mb-3">Questions and instructions about the family&apos;s records, in plain words. For things (photos, files) use the + button.</p>}

      <div className={embedded ? "flex flex-col gap-2 overflow-y-auto max-h-[50vh] pr-1" : "flex-1 flex flex-col gap-2"}>
        <div className="text-[11px] text-muted px-1 -mb-1"><Link href="/ask/history" className="font-semibold text-accent">Earlier…</Link> · the last 24 hours are here; everything is kept in history</div>
        {bubbles.length === 0 && (
          <div className="card text-sm text-muted">Try one of the suggestions below, or ask anything the family&apos;s records can answer: schedules, documents, money, people, vehicles, home, your own health.</div>
        )}
        {bubbles.map((b, i) => b.role === "user" ? (
          <div key={i} className="self-end max-w-[85%] min-w-0 rounded-2xl rounded-br-md bg-accent text-white px-4 py-2.5 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{b.text}</div>
        ) : (
          // min-w-0 and overflow-wrap:anywhere on the bubble: a folder path, an order number or a link has no
          // spaces to break at, and without these a flex child grows to fit it and the text runs past the card.
          <div key={i} className="self-start w-full max-w-[92%] min-w-0 flex flex-col gap-1.5">
            <div className={`card text-sm whitespace-pre-wrap min-w-0 [overflow-wrap:anywhere] ${b.reply?.kind === "deflect" ? "text-muted" : ""}`}>{b.text}</div>
            {b.reply?.kind === "tool_confirm" && b.reply.tool && (
              b.toolResult
                ? <div className={`text-xs font-semibold px-1 ${b.toolResult.ok ? "text-green" : "text-red"}`}>{b.toolResult.text}{b.toolResult.ok && b.toolResult.href ? <> · {b.toolResult.href.startsWith("sms:") ? <a href={b.toolResult.href} className="text-accent">Open Messages</a> : <Link href={b.toolResult.href} className="text-accent">Open</Link>}</> : null}</div>
                : (
                  <div className={`card flex flex-col gap-2 ${b.reply.tool.tier === 3 ? "border-amber" : ""}`}>
                    <div className="text-sm font-semibold">{b.reply.tool.title}</div>
                    <dl className="text-xs text-muted flex flex-col gap-0.5">
                      {Object.entries(b.reply.tool.args).filter(([, v]) => v !== "" && v !== null && v !== undefined).map(([k, v]) => (
                        <div key={k} className="flex gap-2"><dt className="shrink-0">{k}</dt><dd className="text-fg min-w-0 break-words">{String(v)}</dd></div>
                      ))}
                    </dl>
                    <div className="text-[11px] text-muted">{who} asked · from Ask · nothing has changed yet</div>
                    <div className="flex gap-2">
                      <button disabled={busy} onClick={() => runChosen(i)} className="min-h-11 flex-1 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50">{busy ? "Doing it…" : "Do it"}</button>
                      <button onClick={() => setInput(b.text)} className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm">Change</button>
                    </div>
                  </div>
                )
            )}
            {b.reply?.kind === "instruction" && b.reply.confirm && <ConfirmCard b={b} who={who} onConfirm={() => confirm(i)} onChange={() => setInput(b.reply!.confirm!.summary)} />}
            {(b.reply?.kind === "event_confirm" || b.reply?.kind === "event_move") && b.reply.draft && (i === bubbles.length - 1 || b.eventResult) && (
              b.eventResult?.ok
                ? <div className="card text-sm border-accent"><div className="text-[11px] font-bold tracking-wide text-accent">SAVED TO GOOGLE CALENDAR</div><div>{b.eventResult.text}</div><Link href={b.eventResult.href!} className="text-xs font-semibold text-accent">Open the event</Link></div>
                : <div className="flex flex-col gap-1">
                    {b.eventResult && !b.eventResult.ok && <div className="text-xs text-red px-1">{b.eventResult.text}</div>}
                    <button disabled={busy} onClick={() => addEvent(i)} className="min-h-11 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50">{b.reply.kind === "event_move" ? `Move “${b.reply.move!.title}”, then add mine` : "Add to Google Calendar"}</button>
                  </div>
            )}
            {b.reply?.items && b.reply.items.length > 0 && (
              <div className="card flex flex-col text-sm p-0 overflow-hidden">
                {b.reply.items.map((it) => (
                  <div key={`${it.href}|${it.name}`} className="flex items-center gap-2 px-3 py-2 border-b border-line last:border-0">
                    <Link href={it.href} className="min-w-0 flex-1"><div className="font-semibold truncate">{it.name}</div>{it.detail && <div className="text-xs text-muted truncate">{it.detail}</div>}</Link>
                    {it.open
                      ? <a href={it.open} target="_blank" rel="noopener" className="shrink-0 min-h-9 px-3 rounded-full bg-accent text-white text-xs font-semibold inline-flex items-center">Open</a>
                      : it.fetch
                        ? <FetchButton path={it.fetch.path} register={it.fetch.register} refId={it.fetch.ref} />
                        : null}
                  </div>
                ))}
              </div>
            )}
            {b.reply?.scopeRule && <div className="text-xs text-muted px-1">Scope rule saved: &ldquo;{b.reply.scopeRule}&rdquo; · remove it in Settings › Assistant</div>}
            {b.reply?.kind === "inbox" && <div className="text-xs font-semibold text-amber px-1">Saved to Inbox · <Link href="/inbox" className="underline">open</Link></div>}
            <div className="text-[11px] text-muted px-1 flex flex-wrap gap-x-2">
              {b.reply?.source && <a href={b.reply.source.href} className="font-semibold text-accent">Open in {b.reply.source.label.replace(/^Open in /, "")}</a>}
              {b.reply && b.reply.kind !== "deflect" && b.reply.kind !== "scope_check" && (
                b.flagged
                  ? <span className="text-green font-semibold">Flagged for the maintainer</span>
                  : <button type="button" onClick={() => flag(i)} className="font-semibold text-muted underline-offset-2 hover:underline">Wrong answer?</button>
              )}
              {b.reply?.kind !== "instruction" && <span>{who} asked · from Ask</span>}
              <span>{b.reply?.costText}{b.reply?.model && b.reply.model !== "none" ? ` · ${b.reply.model.replace("claude-", "").replace("-5-5", "")}` : ""}{b.reply?.sample ? " · sample" : ""}</span>
            </div>
          </div>
        ))}
        {busy && <div className="self-start card text-sm text-muted">Thinking…</div>}
        <div ref={endRef} />
      </div>

      {chips.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto py-2 -mx-5 px-5 [scrollbar-width:none]">
          {chips.map((c) => <button key={c} onClick={() => send(c)} className="shrink-0 min-h-10 px-3 rounded-full bg-soft text-sm font-semibold whitespace-nowrap">{c}</button>)}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className={embedded ? "flex gap-2 py-2 bg-bg" : "sticky bottom-[88px] flex gap-2 py-2 bg-bg"}>
        <input value={input} onChange={(e) => setInput(e.target.value)} autoFocus={embedded} placeholder="Ask or tell me something…" aria-label="Ask" className="flex-1 min-h-12 rounded-full border border-line bg-bg px-4 text-sm" />
        <button type="submit" disabled={busy || !input.trim()} className="min-h-12 px-5 rounded-full bg-accent text-white font-semibold disabled:opacity-40">Send</button>
      </form>

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[150px] z-10 card shadow-lg text-sm flex items-center gap-3 max-w-[360px]">
          <span>{toast.text}</span>
          {toast.undo && <button onClick={() => { toast.undo!(); setToast(null); }} className="font-bold text-accent">Undo</button>}
        </div>
      )}
    </div>
  );
}

function ConfirmCard({ b, who, onConfirm, onChange }: { b: Bubble; who: string; onConfirm: () => void; onChange: () => void }) {
  const c = b.reply!.confirm!;
  if (b.confirmed === "saved") return <div className="text-xs font-semibold text-green px-1">Saved to {c.target}{c.tier === 1 ? " (Undo above)" : ""}</div>;
  if (b.confirmed === "undone") return <div className="text-xs text-muted px-1">Undone.</div>;
  return (
    <div className={`card flex flex-col gap-2 ${c.tier === 3 ? "border-amber" : ""}`}>
      <div className="text-sm"><span className="font-semibold">{c.summary}</span> <span className="text-muted">→ {c.target}</span></div>
      <div className="text-[11px] text-muted">{who} asked · from Ask · {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
      {c.tier === 3 && <div className="text-xs text-amber font-semibold">Affects access, money set-up or another person. Needs an explicit confirm{/access|people/i.test(c.target) ? " and the other person's" : ""}.</div>}
      <div className="flex gap-2">
        <button onClick={onConfirm} className={`min-h-11 flex-1 rounded-xl font-semibold text-sm ${c.tier === 3 ? "bg-amber-bg text-amber border border-amber" : "bg-accent text-white"}`}>{c.tier === 3 ? "Confirm this change" : "Confirm"}</button>
        <button onClick={onChange} className="min-h-11 px-4 rounded-xl border border-line font-semibold text-sm">Change</button>
      </div>
    </div>
  );
}
