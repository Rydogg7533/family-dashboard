"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { askAction, confirmInstruction, confirmTool, parkThreadInInbox, flagAskReply, logVoiceSession } from "@/lib/ai-actions";
import type { AskItem, AskReply, Turn } from "@/lib/ask-engine";
import { VoiceSession, type VoiceStatus } from "@/lib/voice-client";
import { splitAnswer } from "@/lib/ask-shared";
import { FetchButton } from "@/components/FetchButton";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const WINDOW_TURNS = 12;
// The on-screen thread and the model's context are the same window; everything before it is on /ask/history.
const inWindow = (bs: Bubble[]) => { const cut = Date.now() - WINDOW_MS; return bs.filter((b) => (b.at ?? 0) >= cut); };

const SUGGESTED = ["What needs me today?", "Where is the Sienna registration?", "Add melatonin for [Child 1] at 8 pm", "Find a 16x25x1 MERV 11 filter", "Save confirmation 8X4K2 for the Moab hotel Nov 3"];

type Bubble = { at?: number; role: "user" | "assistant"; text: string; stopped?: boolean; reply?: AskReply; confirmed?: "saved" | "undone" | "changed"; flagged?: boolean; toolResult?: { ok: boolean; text: string; href?: string }; eventResult?: { ok: boolean; text: string; href?: string } };

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
  // Stop / edit-and-rerun (Ryan, 2026-10-27 20:37). A request is a generation; Stop bumps it and the late reply is dropped.
  // The server call still finishes and is still logged; only the thread ignores it. Nothing is written without a yes.
  const gen = useRef(0);
  const [editing, setEditing] = useState<number | null>(null);

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

  // replaceFrom: resend from this user bubble, dropping it and everything after (the originals stay in Ask history on the server).
  // Returns the reply so voice (D14) can speak it; a typed send ignores the return.
  async function send(text: string, replaceFrom?: number, via: "ask" | "voice" = "ask"): Promise<AskReply | null> {
    const q = text.trim();
    if (!q || busy) return null;
    setInput(""); setEditing(null);
    const base = replaceFrom != null ? bubbles.slice(0, replaceFrom) : bubbles;
    const next: Bubble[] = [...base, { at: Date.now(), role: "user", text: q }];
    setBubbles(next);
    setBusy(true);
    const my = ++gen.current;
    // The model sees the recent window only (last 24 h, at most 12 turns); older exchanges are in history and
    // reachable through the ask.history tool, so an answer costs the same on day 30 as on day 1.
    const thread: Turn[] = inWindow(next).slice(-WINDOW_TURNS).map((b) => ({ role: b.role, text: b.text, kind: b.reply?.kind }));
    // D5: the last proposal (a write or an event) travels with the question so a typed yes can run it.
    const lastB = base[base.length - 1];
    const pend = lastB?.role === "assistant" && lastB.reply && (lastB.reply.kind === "tool_confirm" || lastB.reply.kind === "event_confirm" || lastB.reply.kind === "event_move") && !lastB.toolResult && !lastB.eventResult
      ? { kind: lastB.reply.kind, tool: lastB.reply.tool, draft: lastB.reply.draft, move: lastB.reply.move, feedId: lastB.reply.feedId } : null;
    const reply = await askAction(thread, undefined, via === "voice" ? "ask-voice" : (source ?? "ask"), pend).catch((e) => ({ kind: "inbox", text: `The model could not be reached (${String(e?.message ?? e).slice(0, 80)}).`, cost: 0, costText: "", model: "none", sample: false } as AskReply));
    if (my !== gen.current) return null;   // stopped, or replaced by a newer request
    // The proposal is answered now, whatever the answer was; it must not be runnable twice.
    if (pend) setBubbles((bs) => bs.map((b) => (b === lastB ? { ...b, toolResult: b.reply?.kind === "tool_confirm" ? { ok: true, text: "" } : b.toolResult, eventResult: b.reply?.kind !== "tool_confirm" ? { ok: true, text: "" } : b.eventResult } : b)));
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
    return reply;
  }

  // Voice (D14): the voice model's one tool is ask(text); it lands here and goes through send() like typing.
  // Rows and cards still appear in the thread; the voice says the sentence. A tier-3 write is told to the voice
  // as "needs the button", and the card is on screen.
  const voiceRef = useRef<VoiceSession | null>(null);
  const [voice, setVoice] = useState<VoiceStatus>("idle");
  const [voiceOn, setVoiceOn] = useState<boolean | null>(null);
  useEffect(() => { fetch("/api/voice/session", { method: "POST" }).then((r) => setVoiceOn(r.status !== 404)).catch(() => setVoiceOn(false)); }, []);
  const busyRef = useRef(busy); busyRef.current = busy;
  const bubblesRef = useRef(bubbles); bubblesRef.current = bubbles;
  async function voiceAsk(text: string): Promise<string> {
    // Wait for a typed send in flight rather than overlapping it.
    for (let i = 0; i < 100 && busyRef.current; i++) await new Promise((r) => setTimeout(r, 100));
    const reply = await send(text, undefined, "voice");
    if (!reply) return "I didn't catch that.";
    const say = reply.text.replace(/\s+/g, " ").trim();
    if (reply.kind === "tool_confirm" && reply.tool?.tier === 3) return `${say.replace(/ This one needs the button below\.$/, "")} This one needs the button on the screen.`;
    if (reply.items?.length) return `${say} The ${reply.items.length === 1 ? "row is" : `${reply.items.length} rows are`} on the screen.`;
    return say;
  }
  const [voiceSecs, setVoiceSecs] = useState(0);
  useEffect(() => {
    if (voice === "idle" || voice === "error") { setVoiceSecs(0); return; }
    const t = setInterval(() => setVoiceSecs(voiceRef.current?.elapsed() ?? 0), 1000);
    return () => clearInterval(t);
  }, [voice]);
  function voiceEnd(why?: "silence" | "cap" | "away" | "bye") {
    const s = voiceRef.current; if (!s) return;
    const secs = s.close(); voiceRef.current = null; setVoice("idle");
    void logVoiceSession(secs, "realtime", source ? `${source}-voice` : "ask-voice");
    // D15: the session ends by itself on silence, at the cap, when the app goes away, or on "bye".
    if (why === "silence") setToast({ text: "Voice ended after 20 seconds of quiet." });
    else if (why === "cap") setToast({ text: "Voice ended at the 5-minute limit. Tap the mic to start again." });
  }
  function voiceToggle() {
    if (voiceRef.current) { voiceEnd(); return; }
    const s = new VoiceSession({
      onStatus: setVoice,
      onUser: () => { /* the transcript reaches the thread through ask(); nothing to add here */ },
      onAssistant: () => { /* same: the thread already holds the reply */ },
      onAsk: voiceAsk,
      onError: (m) => setToast({ text: m }),
      onEnded: voiceEnd,
    });
    voiceRef.current = s;
    void s.connect();
  }
  useEffect(() => () => { voiceRef.current?.close(); }, []);

  function stop() {
    if (!busy) return;
    gen.current += 1;
    setBusy(false);
    setBubbles((bs) => bs.map((b, i) => (i === bs.length - 1 && b.role === "user" ? { ...b, stopped: true } : b)));
  }
  // Tap your own message: it goes back in the box; sending it replaces that turn and everything after.
  function edit(i: number) {
    if (busy) return;
    setEditing(i); setInput(bubbles[i].text);
  }
  function retry(i: number) {
    const u = bubbles[i]; if (!u || u.role !== "user" || busy) return;
    void send(u.text, i);
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



  const last = bubbles[bubbles.length - 1];
  // D5 (2026-10-27): no chips. The thread is a conversation; the person answers in words.
  const pending = !!last && last.role === "assistant" && ((last.reply?.kind === "tool_confirm" && !last.toolResult) || ((last.reply?.kind === "event_confirm" || last.reply?.kind === "event_move") && !last.eventResult) || (last.reply?.kind === "instruction" && !!last.reply.confirm && !last.confirmed));
  useEffect(() => { onPending?.(pending); }, [pending, onPending]);

  return (
    <div className={embedded ? "flex flex-col min-h-0 flex-1" : "flex flex-col min-h-[calc(100vh-140px)]"}>
      <div className="flex items-center justify-end mb-1">
        <h1 className="sr-only">Ask</h1>
        <div className="flex items-center gap-3">
          {sample && <div className="text-xs text-muted">sample mode · no API key</div>}
          {bubbles.length > 0 && <button type="button" onClick={newChat} className="min-h-9 px-3 rounded-full bg-soft text-xs font-semibold">New chat</button>}
        </div>
      </div>
      {!embedded && <p className="text-xs text-muted mb-3">Questions and instructions about the family&apos;s records, in plain words. For things (photos, files) use the + button.</p>}

      <div className={embedded ? "flex flex-col gap-2 overflow-y-auto overscroll-contain min-h-0 flex-1 pr-1" : "flex-1 flex flex-col gap-2"}>
        <div className="text-[11px] text-muted px-1 -mb-1"><Link href="/ask/history" className="font-semibold text-accent">Earlier…</Link> · the last 24 hours are here; everything is kept in history</div>
        {bubbles.length === 0 && (
          <div className="card text-sm text-muted">Ask or tell me anything about the family&apos;s records: schedules, documents, money, people, vehicles, home, your own health. For example: {SUGGESTED.map((x) => `“${x}”`).join(", ")}.</div>
        )}
        {bubbles.map((b, i) => b.role === "user" ? (
          <div key={i} className="self-end max-w-[85%] min-w-0 flex flex-col items-end gap-0.5">
            <button type="button" onClick={() => edit(i)} title="Edit and resend" className={`text-left rounded-2xl rounded-br-md px-4 py-2.5 text-sm whitespace-pre-wrap [overflow-wrap:anywhere] ${editing === i ? "bg-soft text-fg border border-accent" : "bg-accent text-white"}`}>{b.text}</button>
            {editing === i && <div className="text-[11px] text-muted px-1">Editing · Send replaces this and what followed · <button type="button" onClick={() => { setEditing(null); setInput(""); }} className="font-semibold text-accent">cancel</button></div>}
            {b.stopped && editing !== i && <div className="text-[11px] text-muted px-1">Stopped · <button type="button" onClick={() => retry(i)} className="font-semibold text-accent">retry</button> · <button type="button" onClick={() => edit(i)} className="font-semibold text-accent">edit</button></div>}
          </div>
        ) : (
          // min-w-0 and overflow-wrap:anywhere on the bubble: a folder path, an order number or a link has no
          // spaces to break at, and without these a flex child grows to fit it and the text runs past the card.
          <div key={i} className="self-start w-full max-w-[92%] min-w-0 flex flex-col gap-1.5">
            <AnswerText text={b.text} muted={b.reply?.kind === "deflect"} />
            {b.reply?.kind === "tool_confirm" && b.reply.tool && b.reply.tool.tier === 3 && (
              b.toolResult
                ? (b.toolResult.text ? <ResultLine ok={b.toolResult.ok} text={b.toolResult.text} href={b.toolResult.href} /> : null)
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
            {(b.reply?.kind === "event_confirm" || b.reply?.kind === "event_move") && b.eventResult && b.eventResult.text && (
              b.eventResult.ok
                ? <div className="card text-sm border-accent"><div className="text-[11px] font-bold tracking-wide text-accent">SAVED TO GOOGLE CALENDAR</div><div>{b.eventResult.text}</div><Link href={b.eventResult.href!} className="text-xs font-semibold text-accent">Open the event</Link></div>
                : <div className="text-xs text-red px-1">{b.eventResult.text}</div>
            )}
            {b.reply?.items && b.reply.items.length > 0 && (
              <div className="card flex flex-col text-sm p-0 overflow-hidden">
                {b.reply.items.map((it) => (
                  <div key={`${it.href}|${it.name}`} className="flex items-center gap-2 px-3 py-2 border-b border-line last:border-0">
                    <ItemRow it={it} />
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
            {b.reply?.kind === "inbox" && /could not be reached/i.test(b.text)
              ? <div className="text-xs font-semibold text-amber px-1"><button type="button" onClick={() => retry(i - 1)} className="underline">Retry</button></div>
              : b.reply?.kind === "inbox" && <div className="text-xs font-semibold text-amber px-1">Saved to Inbox · <Link href="/inbox" className="underline">open</Link></div>}
            <div className="text-[11px] text-muted px-1 flex flex-wrap gap-x-2">
              {b.reply?.source && <a href={b.reply.source.href} className="font-semibold text-accent">{/^(Open|Show|See)\b/i.test(b.reply.source.label) ? b.reply.source.label : `Open ${b.reply.source.label}`}</a>}
              {b.reply && b.reply.kind !== "deflect" && b.reply.kind !== "scope_check" && (
                b.flagged
                  ? <span className="text-green font-semibold">Flagged for the maintainer</span>
                  : <button type="button" onClick={() => flag(i)} className="font-semibold text-muted underline-offset-2 hover:underline">Wrong answer?</button>
              )}
              {b.reply?.sample && <MetaInfo text="sample" />}
            </div>
          </div>
        ))}
        {busy && <div className="self-start card text-sm text-muted flex items-center gap-3"><span>Thinking…</span><button type="button" onClick={stop} className="min-h-9 px-3 rounded-full border border-line text-xs font-semibold text-fg">Stop</button></div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void send(input, editing ?? undefined); }} className={embedded ? "flex gap-2 py-2" : "sticky bottom-[88px] flex gap-2 py-2 bg-bg"}>
        <input value={input} onChange={(e) => setInput(e.target.value)} autoFocus={embedded} placeholder={editing != null ? "Edit, then Send" : voice !== "idle" && voice !== "error" ? { connecting: "Connecting…", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…" }[voice] : "Ask or tell me something…"} aria-label="Ask" className={`flex-1 min-h-12 rounded-full border bg-bg px-4 text-sm ${editing != null ? "border-accent" : voice === "listening" ? "border-green" : "border-line"}`} />
        {voiceOn && (
          <button type="button" onClick={voiceToggle} aria-label={voice === "idle" || voice === "error" ? "Talk" : "Stop talking"} title={voice === "idle" || voice === "error" ? "Talk to Ask (audio goes to OpenAI during a voice session)" : "End the voice session"}
            className={`min-h-12 min-w-12 rounded-full border font-semibold text-lg ${voice === "idle" || voice === "error" ? "border-line" : voice === "listening" ? "border-green bg-green-bg text-green" : "border-accent bg-accent text-white"}`}>
            {voice === "idle" || voice === "error" ? "🎙" : <span className="text-xs tabular-nums">■ {Math.floor(voiceSecs / 60)}:{String(voiceSecs % 60).padStart(2, "0")}</span>}
          </button>
        )}
        {busy ? <button type="button" onClick={stop} className="min-h-12 px-5 rounded-full border border-line font-semibold">Stop</button>
          : <button type="submit" disabled={!input.trim()} className="min-h-12 px-5 rounded-full bg-accent text-white font-semibold disabled:opacity-40">{editing != null ? "Resend" : "Send"}</button>}
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

// The answer, kept short: the model is told one or two sentences; if it runs on, the rest folds behind More.
function AnswerText({ text, muted }: { text: string; muted?: boolean }) {
  const [open, setOpen] = useState(false);
  const { head, more } = splitAnswer(text);
  return (
    <div className={`card text-sm whitespace-pre-wrap min-w-0 [overflow-wrap:anywhere] ${muted ? "text-muted" : ""}`}>
      {open ? `${head} ${more ?? ""}`.trim() : head}
      {more && <button type="button" onClick={() => setOpen((v) => !v)} className="block mt-1 text-xs font-semibold text-accent">{open ? "Less" : "More"}</button>}
    </div>
  );
}

// A found thing: name and date up front; folder, amount and the rest under Details.
function ItemRow({ it }: { it: AskItem }) {
  const [open, setOpen] = useState(false);
  const parts = (it.detail ?? "").split(" · ").filter(Boolean);
  const date = parts.find((p) => /^\d{4}-\d{2}-\d{2}$/.test(p)) ?? null;
  const rest = parts.filter((p) => p !== date);
  return (
    <div className="min-w-0 flex-1">
      <Link href={it.href} className="block"><div className="font-semibold truncate">{it.name}</div></Link>
      <div className="text-xs text-muted flex gap-2 min-w-0">
        {date && <span>{date}</span>}
        {rest.length > 0 && <button type="button" onClick={() => setOpen((v) => !v)} className="font-semibold text-accent">{open ? "Less" : "Details"}</button>}
      </div>
      {open && rest.length > 0 && <div className="text-xs text-muted [overflow-wrap:anywhere]">{rest.join(" · ")}</div>}
    </div>
  );
}

// What a tapped card did: one line, the full text behind Details.
function ResultLine({ ok, text, href }: { ok: boolean; text: string; href?: string }) {
  const [open, setOpen] = useState(false);
  const short = ok ? text.split(/[:.]\s/)[0] : text;
  const hasMore = ok && short.length < text.length - 2;
  return (
    <div className={`text-xs font-semibold px-1 ${ok ? "text-green" : "text-red"} [overflow-wrap:anywhere]`}>
      {open ? text : short}
      {href ? <> · {href.startsWith("sms:") ? <a href={href} className="text-accent">Open Messages</a> : <Link href={href} className="text-accent">Open</Link>}</> : null}
      {hasMore && <> · <button type="button" onClick={() => setOpen((v) => !v)} className="text-muted font-semibold">{open ? "Less" : "Details"}</button></>}
    </div>
  );
}

// Who asked, what it cost, which model: behind one small (i) so the thread stays readable.
function MetaInfo({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return open
    ? <span>{text} · <button type="button" onClick={() => setOpen(false)} className="font-semibold">hide</button></span>
    : <button type="button" aria-label="Details" onClick={() => setOpen(true)} className="font-semibold text-muted">ⓘ</button>;
}
