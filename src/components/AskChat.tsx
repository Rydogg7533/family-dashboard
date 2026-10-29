"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { askAction, confirmInstruction, confirmTool, parkThreadInInbox, flagAskReply, logVoiceSession } from "@/lib/ai-actions";
import type { AskCard, AskItem, AskReply, Turn } from "@/lib/ask-engine";
import { VoiceSession, type VoiceStatus } from "@/lib/voice-client";
import { splitAnswer, ASK_FILE_BYTES, ASK_FILE_MAX, ASK_FILE_MIMES, type AskFile } from "@/lib/ask-shared";
import { createClient } from "@/lib/supabase/client";
import { useBeforePaint } from "@/lib/use-before-paint";
import { FetchButton } from "@/components/FetchButton";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const WINDOW_TURNS = 12;
// The on-screen thread and the model's context are the same window; everything before it is on /ask/history.
const inWindow = (bs: Bubble[]) => { const cut = Date.now() - WINDOW_MS; return bs.filter((b) => (b.at ?? 0) >= cut); };

const SUGGESTED = ["What needs me today?", "Where is the Sienna registration?", "Add melatonin for [Child 1] at 8 pm", "Find a 16x25x1 MERV 11 filter", "Save confirmation 8X4K2 for the Moab hotel Nov 3"];

type Bubble = { at?: number; role: "user" | "assistant"; text: string; files?: AskFile[]; stopped?: boolean; reply?: AskReply; confirmed?: "saved" | "undone" | "changed"; flagged?: boolean; toolResult?: { ok: boolean; text: string; href?: string }; eventResult?: { ok: boolean; text: string; href?: string } };

// Photos are shrunk before they leave the phone (max 2000 px, JPEG 0.85); PDFs go as they are, up to 5 MB.
async function shrink(file: File): Promise<Blob | null> {
  if (file.type === "application/pdf") return file.size <= ASK_FILE_BYTES ? file : null;
  if (!file.type.startsWith("image/")) return null;
  try {
    const bmp = await createImageBitmap(file); const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
    const out = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/jpeg", 0.85));
    return out && out.size <= ASK_FILE_BYTES ? out : null;
  } catch { return file.size <= ASK_FILE_BYTES && ASK_FILE_MIMES.includes(file.type) ? file : null; }
}

// embedded: the same Ask, inside the sheet the + button opens on any page (one thread, two places to open it).
// source names where it was asked from; onPending tells the sheet whether a confirm card is still waiting; onControls
// hands the sheet the "New chat" action so it can sit in the sheet's own header row instead of a second row below it.
export function AskChat({ prefill, sample, who, embedded, source, onPending, onControls, autoVoice }: { prefill: string; sample: boolean; who: string; embedded?: boolean; source?: string; onPending?: (pending: boolean) => void; onControls?: (c: { hasMessages: boolean; newChat: () => void }) => void; autoVoice?: boolean }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [spent, setSpent] = useState(0);
  const [files, setFiles] = useState<AskFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // The box grows with what is typed, up to a few lines, and shrinks back after sending.
  useBeforePaint(() => { const t = box.current; if (!t) return; t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 160)}px`; }, [input]);
  // The Ask tab's composer is fixed above the tab bar (it used to be sticky at a guessed 88px, which is less than the
  // bar's real height on a phone with a home indicator, and far less than the page's bottom padding -- so it rested
  // high at the end of the thread and snapped down 40px the moment you scrolled: Ryan's recording, 2026-10-29 11:48).
  // Fixed never moves; the thread gets a spacer the composer's exact height so the last bubble is never under it.
  const formRef = useRef<HTMLFormElement>(null);
  const [composerH, setComposerH] = useState(132);
  useEffect(() => {
    const el = formRef.current; if (!el || embedded) return;
    const ro = new ResizeObserver(() => setComposerH(Math.ceil(el.getBoundingClientRect().height)));
    ro.observe(el); return () => ro.disconnect();
  }, [embedded]);
  const endRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<HTMLDivElement>(null);     // the newest bubble: a reply taller than the screen is shown from its top
  const sent = useRef(false);
  const restored = useRef(false);
  // Stop / edit-and-rerun (Ryan, 2026-10-27 20:37). A request is a generation; Stop bumps it and the late reply is dropped.
  // The server call still finishes and is still logged; only the thread ignores it. Nothing is written without a yes.
  const gen = useRef(0);
  const [editing, setEditing] = useState<number | null>(null);

  // The thread survives leaving the page (F4): it is kept in this browser, per person, until "New chat".
  // Only this device sees it; nothing about the thread goes to the database from here.
  const storeKey = `ask-thread:${who}`;
  // Before paint: restored this way the sheet is drawn once, at its real size. As a plain effect the sheet appeared
  // empty, then the whole saved thread arrived and shoved its top edge up.
  useBeforePaint(() => {
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
  // Keep the newest bubble in view (Ryan, 2026-10-28: after a delivery the feed sat scrolled up). One scrollIntoView is not
  // enough on a phone: the reply can grow after it lands (result line, link, card) and the keyboard closing resizes the
  // viewport a moment later. So scroll now, again over the next ~1.5 s, and whenever the visual viewport changes size
  // shortly after a change. The person scrolling up on purpose is not fought: the retries stop once their window ends.
  // A reply that fits is shown with its end in view; one taller than the space between the header and the composer is
  // shown from its START, so it reads top to bottom (Ryan, 2026-10-29 12:17: "I still have to scroll up sometimes when a
  // request completes" -- scrolling to the end of a long answer put its first lines above the fold). The bubbles carry a
  // scroll-margin for the fixed header so "start" is not hidden under it.
  const firstScroll = useRef(true);
  useBeforePaint(() => {
    const toEnd = () => {
      const el = lastRef.current;
      if (el) {
        const scroller = embedded ? el.closest(".overflow-y-auto") : null;
        const vv = typeof window !== "undefined" ? window.visualViewport : null;
        const main = embedded ? null : document.querySelector("main");
        const header = main ? parseFloat(getComputedStyle(main).paddingTop) || 0 : 0;   // the fixed top bar plus the safe area, as the page reserves it
        const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-bottom")) || 0;
        const avail = scroller ? scroller.clientHeight : (vv?.height ?? window.innerHeight) - header - composerH - bar;
        if (el.getBoundingClientRect().height > avail - 24) { el.scrollIntoView({ block: "start" }); return; }
      }
      endRef.current?.scrollIntoView({ block: "end" });
    };
    // Opening: land at the bottom in the first frame and stop. The retries below are for a reply that is still
    // growing; on open they just made the thread jump for a second and a half.
    if (firstScroll.current) { firstScroll.current = false; toEnd(); return; }
    toEnd();
    const timers = [0, 120, 400, 900, 1500].map((ms) => setTimeout(() => requestAnimationFrame(toEnd), ms));
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const until = Date.now() + 3000;
    const onResize = () => { if (Date.now() < until) toEnd(); };
    vv?.addEventListener("resize", onResize);
    return () => { timers.forEach(clearTimeout); vv?.removeEventListener("resize", onResize); };
  }, [bubbles, busy]);   // composerH and embedded are read, not watched: a composer resize must not re-scroll the thread
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 10_000); return () => clearTimeout(t); }, [toast]);

  // One tap files the miss with its trace; the maintainer reads the issue, fixes it, and the question joins the set.
  async function flag(i: number) {
    const b = bubbles[i]; if (!b?.reply) return;
    const q = [...bubbles.slice(0, i)].reverse().find((x) => x.role === "user")?.text ?? "";
    const r = await flagAskReply(q, b.reply);
    if (r.ok) { setBubbles((cur) => cur.map((x, j) => (j === i ? { ...x, flagged: true } : x))); setToast({ text: "Filed for the maintainer with what Ask looked at." }); }
    else setToast({ text: r.error ?? "Could not file it." });
  }

  // The paperclip: camera, photo library or Files (the phone offers all three). Uploaded at once to the private captures bucket.
  async function attach(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    try {
      const sb = createClient(); const { data: { user } } = await sb.auth.getUser();
      if (!user) { setToast({ text: "Sign in again to attach a file." }); return; }
      const added: AskFile[] = [];
      for (const f of Array.from(list)) {
        if (files.length + added.length >= ASK_FILE_MAX) { setToast({ text: `Up to ${ASK_FILE_MAX} at a time.` }); break; }
        const blob = await shrink(f);
        if (!blob) { setToast({ text: `${f.name || "That file"} is too big or not a photo or PDF (5 MB, JPEG/PNG/WebP/GIF/PDF).` }); continue; }
        const mime = blob.type || f.type; const ext = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "jpg";
        const path = `ask/${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage.from("captures").upload(path, blob, { contentType: mime });
        if (error) { setToast({ text: "Could not upload that one." }); continue; }
        added.push({ path, mime, name: (f.name || `photo.${ext}`).slice(0, 80) });
      }
      if (added.length) setFiles((cur) => [...cur, ...added]);
    } finally { setUploading(false); if (picker.current) picker.current.value = ""; }
  }

  // replaceFrom: resend from this user bubble, dropping it and everything after (the originals stay in Ask history on the server).
  // Returns the reply so voice (D14) can speak it; a typed send ignores the return.
  async function send(text: string, replaceFrom?: number, via: "ask" | "voice" = "ask"): Promise<AskReply | null> {
    const fs = replaceFrom != null ? (bubbles[replaceFrom]?.files ?? []) : files;
    const q = text.trim() || (fs.length ? "Here is what I am looking at." : "");
    if (!q || busy || uploading) return null;
    setInput(""); setEditing(null); if (replaceFrom == null) setFiles([]);
    const base = replaceFrom != null ? bubbles.slice(0, replaceFrom) : bubbles;
    const next: Bubble[] = [...base, { at: Date.now(), role: "user", text: q, ...(fs.length ? { files: fs } : {}) }];
    setBubbles(next);
    setBusy(true);
    const my = ++gen.current;
    // The model sees the recent window only (last 24 h, at most 12 turns); older exchanges are in history and
    // reachable through the ask.history tool, so an answer costs the same on day 30 as on day 1.
    const thread: Turn[] = inWindow(next).slice(-WINDOW_TURNS).map((b, i, arr) => ({ role: b.role, text: b.text, kind: b.reply?.kind, ...(i === arr.length - 1 && b.files?.length ? { files: b.files } : {}) }));
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
    if (voice === "idle" || voice === "error") return;
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
    setVoiceSecs(0);
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
  // Opened from the system-wide mic (QuickBar): start talking straight away, once we know voice is on.
  const autoStarted = useRef(false);
  useEffect(() => { if (autoVoice && voiceOn && !autoStarted.current && !voiceRef.current) { autoStarted.current = true; voiceToggle(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [autoVoice, voiceOn]);

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
  // The sheet draws its own header, so it needs the New chat action; newChat is read through a ref so the identity the
  // parent holds never changes and this does not fire on every render.
  const newChatRef = useRef(newChat); newChatRef.current = newChat;
  const callNewChat = useRef(() => newChatRef.current()).current;
  const hasMessages = bubbles.length > 0;
  useEffect(() => { onControls?.({ hasMessages, newChat: callNewChat }); }, [hasMessages, callNewChat, onControls]);

  return (
    <div className={embedded ? "flex flex-col min-h-0 flex-1" : "flex flex-col min-h-[calc(100vh-140px)]"}>
      {embedded ? (
        sample ? <div className="text-xs text-muted text-right mb-1">sample mode · no API key</div> : null
      ) : (
        <div className="flex items-center justify-end mb-1">
          <h1 className="sr-only">Ask</h1>
          <div className="flex items-center gap-3">
            {sample && <div className="text-xs text-muted">sample mode · no API key</div>}
            {hasMessages && <button type="button" onClick={newChat} className="min-h-9 px-3 rounded-full bg-soft text-xs font-semibold">New chat</button>}
          </div>
        </div>
      )}
      {!embedded && <p className="text-xs text-muted mb-3">Questions and instructions about the family&apos;s records, in plain words. For things (photos, files) use the + button.</p>}

      <div className={embedded ? "flex flex-col gap-5 overflow-y-auto overscroll-contain min-h-0 flex-1 pr-1" : "flex-1 flex flex-col gap-5"}>
        <div className="text-[11px] text-muted px-1 -mb-1"><Link href="/ask/history" className="font-semibold text-accent">Earlier…</Link>{embedded ? "" : " · the last 24 hours are here; everything is kept in history"}</div>
        {bubbles.length === 0 && (
          <div className="card text-sm text-muted">Ask or tell me anything about the family&apos;s records: schedules, documents, money, people, vehicles, home, your own health. For example: {SUGGESTED.map((x) => `“${x}”`).join(", ")}.</div>
        )}
        {/* The accent colour is for things you can tap (Ryan, 2026-10-28): your own words are a quiet bubble on the right, so a
            request never looks like a button next to the card that answers it. */}
        {bubbles.map((b, i) => b.role === "user" ? (
          <div key={i} ref={i === bubbles.length - 1 ? lastRef : undefined} className={`self-end max-w-[85%] min-w-0 flex flex-col items-end gap-0.5 ${embedded ? "" : "scroll-mt-[calc(44px+env(safe-area-inset-top)+16px)]"}`}>
            <button type="button" onClick={() => edit(i)} title="Edit and resend" className={`text-left rounded-[22px] rounded-br-lg px-[18px] py-3 text-[17px] leading-[1.45] whitespace-pre-wrap [overflow-wrap:anywhere] ${editing === i ? "bg-soft text-fg border border-accent" : "bg-soft text-fg border border-line"}`}>{b.text}</button>
            {b.files?.length ? <div className="text-[11px] text-muted px-1">📎 {b.files.map((f) => f.name).join(", ")}</div> : null}
            {editing === i && <div className="text-[11px] text-muted px-1">Editing · Send replaces this and what followed · <button type="button" onClick={() => { setEditing(null); setInput(""); }} className="font-semibold text-accent">cancel</button></div>}
            {b.stopped && editing !== i && <div className="text-[11px] text-muted px-1">Stopped · <button type="button" onClick={() => retry(i)} className="font-semibold text-accent">retry</button> · <button type="button" onClick={() => edit(i)} className="font-semibold text-accent">edit</button></div>}
          </div>
        ) : (
          // min-w-0 and overflow-wrap:anywhere on the bubble: a folder path, an order number or a link has no
          // spaces to break at, and without these a flex child grows to fit it and the text runs past the card.
          <div key={i} ref={i === bubbles.length - 1 ? lastRef : undefined} className={`self-start w-full max-w-[92%] min-w-0 flex flex-col gap-1.5 ${embedded ? "" : "scroll-mt-[calc(44px+env(safe-area-inset-top)+16px)]"}`}>
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
            {b.reply?.card && <DeliveryCard card={b.reply.card} onShare={() => { setInput(`Send the ${b.reply!.card!.name} to `); box.current?.focus(); }} />}
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
              {b.reply?.source && !b.reply.card && (b.reply.source.href.startsWith("copy:")
                ? <button type="button" onClick={() => { const q = b.reply!.source!.href.slice(5); navigator.clipboard?.writeText(q).then(() => setToast({ text: "Question copied. Paste it into your assistant." }), () => setToast({ text: q })); }} className="font-semibold text-accent">{b.reply.source.label}</button>
                : <a href={b.reply.source.href} target={/^https?:/.test(b.reply.source.href) ? "_blank" : undefined} rel="noreferrer" className="font-semibold text-accent">{/^(Open|Show|See)\b/i.test(b.reply.source.label) ? b.reply.source.label : `Open ${b.reply.source.label}`}</a>)}
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
        {/* Everything fixed at the bottom -- the composer and the tab bar under it -- so "scroll to the end" lands above both. */}
        {!embedded && <div aria-hidden style={{ height: `calc(${composerH}px + var(--bar-bottom))` }} />}
        <div ref={endRef} />
      </div>

      {/* One rounded box: the words get the full width on top; plus, mic and send sit underneath (Ryan, 2026-10-28).
          autoFocus is safe again: the sheet now opens with the keyboard's space already reserved (AskSheet), so the
          keyboard rises into an empty gap instead of resizing the sheet underneath itself. The focus has to happen in
          the same task as the tap or iOS will not raise the keyboard at all, which is why it is this attribute and
          never a timer. */}
      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); void send(input, editing ?? undefined); }} className={embedded ? "py-2" : "fixed inset-x-0 bottom-[var(--bar-bottom)] z-10 bg-bg"}>
        <div className={embedded ? "" : "max-w-md mx-auto px-5 py-2"}>
        <div className={`rounded-3xl border bg-bg px-3 pt-3 pb-2 flex flex-col gap-1 ${editing != null ? "border-accent" : voice === "listening" ? "border-green" : "border-line focus-within:border-accent"}`}>
          {(files.length > 0 || uploading) && (
            <div className="flex flex-wrap gap-2 pb-1">
              {files.map((f, i) => (
                <span key={f.path} className="inline-flex items-center gap-1 rounded-full border border-line px-3 min-h-9 text-xs">📎 <span className="max-w-[140px] truncate">{f.name}</span>
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} className="min-w-9 min-h-9 -mr-2 font-bold text-muted">✕</button></span>
              ))}
              {uploading && <span className="text-xs text-muted self-center">Uploading…</span>}
            </div>
          )}
          <textarea ref={box} rows={1} value={input} onChange={(e) => setInput(e.target.value)} autoFocus={embedded}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            placeholder={editing != null ? "Edit, then send" : voice !== "idle" && voice !== "error" ? { connecting: "Connecting…", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…" }[voice] : "Ask or tell me something…"}
            aria-label="Ask" className="w-full resize-none bg-transparent px-1 py-1 text-[17px] leading-[1.45] outline-none max-h-40" />
          <div className="flex items-center gap-2">
            <input ref={picker} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => void attach(e.target.files)} />
            <button type="button" onClick={() => picker.current?.click()} disabled={busy || uploading} aria-label="Attach a photo or file" title="Take a photo, or pick one from your photos or files" className="min-h-11 min-w-11 rounded-full bg-soft text-fg flex items-center justify-center disabled:opacity-40">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M10 4v12M4 10h12" /></svg>
            </button>
            <div className="flex-1" />
            {voiceOn && (
              <button type="button" onClick={voiceToggle} aria-label={voice === "idle" || voice === "error" ? "Talk" : "Stop talking"} title={voice === "idle" || voice === "error" ? "Talk to Ask (audio goes to OpenAI during a voice session)" : "End the voice session"}
                className={`min-h-11 rounded-full flex items-center justify-center ${voice === "idle" || voice === "error" ? "min-w-11 bg-soft text-fg" : voice === "listening" ? "px-4 bg-green-bg text-green font-semibold" : "px-4 bg-accent text-white font-semibold"}`}>
                {voice === "idle" || voice === "error"
                  ? <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="7.5" y="2.5" width="5" height="9" rx="2.5" /><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" /></svg>
                  : <span className="text-xs tabular-nums">■ {Math.floor(voiceSecs / 60)}:{String(voiceSecs % 60).padStart(2, "0")}</span>}
              </button>
            )}
            {busy
              ? <button type="button" onClick={stop} aria-label="Stop" className="min-h-11 min-w-11 rounded-full bg-accent text-white flex items-center justify-center"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><rect x="3" y="3" width="10" height="10" rx="2" /></svg></button>
              : <button type="submit" disabled={(!input.trim() && !files.length) || uploading} aria-label={editing != null ? "Resend" : "Send"} className="min-h-11 min-w-11 rounded-full bg-accent text-white flex items-center justify-center disabled:opacity-40">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" /></svg>
                </button>}
          </div>
        </div>
        </div>
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
    <div className={`px-1 py-1 text-[17px] leading-[1.5] whitespace-pre-wrap min-w-0 [overflow-wrap:anywhere] ${muted ? "text-muted" : ""}`}>
      {open ? `${head} ${more ?? ""}`.trim() : head}
      {more && <button type="button" onClick={() => setOpen((v) => !v)} className="block mt-1 text-xs font-semibold text-accent">{open ? "Less" : "More"}</button>}
    </div>
  );
}

// A found thing: name and date up front; folder, amount and the rest under Details.
// The delivery card (D26, 2026-10-28, approved from the mockup): the reply is the thing. A file the app holds shows as an
// image, readable on the phone (tap for full screen); under it the name, one line of context, and three icons: full
// screen, share (fills the Ask box with "Send … to" so F26 takes it from there), the record's page. A 1Password item
// shows a locked placeholder and one big "Open in 1Password" button; Face ID and sharing happen there. A record with
// no file here shows the name, detail and its page (and a Fetch button when the hub has the file).
const LockIcon = () => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.3" /></svg>;
const DocIcon = () => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>;
function DeliveryCard({ card, onShare }: { card: AskCard; onShare: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const icon = "w-11 h-11 rounded-xl inline-flex items-center justify-center text-fg";
  const isPdf = /\.pdf(\?|$)/i.test(card.open ?? "");
  return (
    <div className="card p-0 overflow-hidden flex flex-col">
      {card.kind === "file" && card.open && (
        imgFailed || isPdf
          ? <a href={card.open} target="_blank" rel="noopener" className="h-32 card-media flex items-center justify-center gap-3 text-muted text-sm"><DocIcon />{isPdf ? "PDF · tap to open" : "Tap to open"}</a>
          : <a href={card.open} target="_blank" rel="noopener" className="card-media flex items-center justify-center" aria-label={`${card.name}, full screen`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.open} alt={card.name} className="max-h-64 w-full object-contain" onError={() => setImgFailed(true)} />
            </a>
      )}
      {card.kind === "vault" && <div className="h-28 card-media flex items-center justify-center gap-3 text-muted px-4"><LockIcon /><div className="text-sm leading-snug max-w-[200px]">Kept in 1Password. The app has the label, not the card.</div></div>}
      <div className="px-3.5 pt-3 pb-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm truncate">{card.name}</div>
            {card.detail && <div className="text-xs text-muted truncate">{card.detail}</div>}
          </div>
          {card.kind === "file" && card.open && (
            <div className="flex shrink-0 -mr-2">
              <a href={card.open} target="_blank" rel="noopener" aria-label="Full screen" className={icon}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg></a>
              <button type="button" onClick={onShare} aria-label="Share" className={icon}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v13" /><path d="m7 8 5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg></button>
              <Link href={card.href} aria-label="Open the record" className={icon}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg></Link>
            </div>
          )}
          {card.kind === "record" && (
            <div className="flex items-center gap-2 shrink-0">
              {card.fetch && <FetchButton path={card.fetch.path} register={card.fetch.register} refId={card.fetch.ref} />}
              <Link href={card.href} aria-label="Open the record" className={icon}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg></Link>
            </div>
          )}
        </div>
        {card.kind === "vault" && (
          card.open
            ? <a href={card.open} className="min-h-12 rounded-xl bg-accent text-white font-semibold text-[15px] flex items-center justify-center gap-2">Open in 1Password</a>
            : <div className="text-xs text-amber font-semibold">Listed, but its 1Password link has not been added yet (Settings › 1Password).</div>
        )}
        {card.kind === "vault" && <div className="text-[11px] text-muted leading-snug">Face ID happens in 1Password. Share from there; the app never holds a copy.</div>}
      </div>
    </div>
  );
}

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
