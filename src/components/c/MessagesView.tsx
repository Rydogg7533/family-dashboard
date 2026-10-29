"use client";
import { useEffect, useState, useTransition } from "react";
import { pendingLines, sendLine, takeSuggestion, ignoreSuggestion, setThreadSwitch } from "@/app/messages/actions";
import { useRouter } from "next/navigation";
import type { Confirmation, Message, Suggestion, Thread } from "@/lib/data-messages";
import { clock } from "@/lib/c-shared";
import { useToast } from "@/components/c/Toast";
import { Who } from "@/components/c/Who";

const btn = "min-h-9 px-2.5 rounded-lg border border-line text-xs font-semibold hover:bg-soft";

// Tier-2 one-line confirm cards for the assistant's pending Y/N questions (F17). Answering here or by text: first wins.
export function ConfirmCards({ items }: { items: Confirmation[] }) {
  const [done, setDone] = useState<Record<string, "yes" | "no">>({});
  const { show, el } = useToast();
  return (
    <div className="flex flex-col gap-2">
      {items.map((c) => (
        <div key={c.id} className="card flex flex-col gap-2">
          <div>
            <div className="text-[11px] font-bold tracking-wide text-amber">{c.via === "messages" ? "ASKED BY TEXT" : "ASKED HERE"} · {clock(c.asked_at)}</div>
            <div className="font-semibold">{c.question}</div>
            <Who by={c.requested_by} forPerson={c.for_person} source={c.source} className="mt-0.5" />
          </div>
          {done[c.id] ? <div className="text-sm text-green font-semibold">{done[c.id] === "yes" ? "Yes · created and logged" : "No · nothing created"}</div> : (
            <div className="flex gap-2">
              <button className={`${btn} flex-1 min-h-11 bg-accent text-white border-accent`} onClick={() => { setDone((d) => ({ ...d, [c.id]: "yes" })); show("Created · the Assistant thread shows “done”", () => setDone((d) => { const n = { ...d }; delete n[c.id]; return n; })); }}>Y · yes</button>
              <button className={`${btn} flex-1 min-h-11`} onClick={() => { setDone((d) => ({ ...d, [c.id]: "no" })); show("Declined · the assistant learns from it"); }}>N · no</button>
            </div>
          )}
        </div>
      ))}
      {el}
    </div>
  );
}

const CHIP: Record<Suggestion["kind"], { label: string; icon: string }> = { task: { label: "Make it a task", icon: "✓" }, calendar: { label: "Add to calendar", icon: "📅" }, reply: { label: "Reply", icon: "↩" }, receipt: { label: "Save receipt", icon: "🧾" } };

export function ThreadView({ thread, messages, mirrorOk, suggestions = [] }: { thread: Thread; messages: Message[]; mirrorOk: boolean; suggestions?: Suggestion[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sent, setSent] = useState<Message[]>([]);
  const [waiting, setWaiting] = useState<{ id: string; text: string; status: string; error: string | null }[]>([]);
  const [busy, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);          // message id whose chips are slid out
  const [gone, setGone] = useState<Record<string, string>>({});   // suggestion id → what happened, for the inline note
  const [info, setInfo] = useState(false);
  const [reads, setReads] = useState(!!thread.assistant_reads);
  const [hidden, setHidden] = useState(!!thread.hidden);
  const chipsFor = (mid: string) => suggestions.filter((x) => x.message_id === mid && !gone[x.id]);
  const { show, el } = useToast();
  const all = [...messages, ...sent];
  const isAssistant = thread.kind === "assistant";

  // Lines queued here show as "sending…" until the Mac has sent them through Messages and the mirror has read them back.
  // Open at the latest line, like Messages.
  useEffect(() => { window.scrollTo({ top: document.documentElement.scrollHeight }); }, [thread.id]);
  useEffect(() => {
    let on = true;
    const tick = async () => { try { const w = await pendingLines(thread.id); if (on) setWaiting(w); } catch { /* keep the last state */ } };
    void tick();
    const t = setInterval(() => { if (document.visibilityState === "visible") { void tick(); router.refresh(); } }, 10000);
    return () => { on = false; clearInterval(t); };
  }, [thread.id, router]);

  function send(e: React.FormEvent) {
    e.preventDefault(); const t = text.trim(); if (!t) return;
    start(async () => {
      const r = await sendLine(thread.id, t);
      if (!r.ok) { show(r.error ?? "Could not send"); return; }
      setText("");
      if (r.sample) { setSent((s) => [...s, { id: r.id ?? `s${Date.now()}`, thread_id: thread.id, sender: "Ryan", mine: true, at: new Date().toISOString(), text: t, assistant_kind: isAssistant ? "command" : null }]); show("Sample mode: not sent"); return; }
      setWaiting((w) => [...w, { id: r.id ?? `q${Date.now()}`, text: t, status: "queued", error: null }]);
      show(`Queued · your Mac sends it to ${thread.name} through Messages`);
    });
  }

  return (
    <div className="flex flex-col gap-3 pb-16">
      <div className="flex items-center justify-center gap-2 text-[11px] text-muted">
        <span>{thread.members.join(", ")}</span>
        <button aria-label="About this thread" aria-expanded={info} onClick={() => setInfo((v) => !v)} className="w-6 h-6 rounded-full border border-line text-accent font-bold text-[11px]">i</button>
      </div>
      {info && (
        <div className="card text-xs text-muted flex flex-col gap-1">
          <div>A mirror of your own Messages thread: family threads only, the last 30 days, owner-only and encrypted at rest. Full history stays in Messages and iCloud.</div>
          <div>What you type here goes out from your Mac through Messages, as you, so it appears on every phone like any other text. If the mirror is paused, use Messages directly.</div>
          <div>⋯ on a line means the assistant spotted something it could turn into a task, event, reply or receipt. Nothing happens until you tap; "Not this" teaches it to suggest less.</div>
          <label className="flex items-center justify-between gap-3 min-h-10 mt-1 text-fg">
            <span><span className="font-semibold">Assistant reads this thread</span><span className="block text-muted">Only then do inbound lines go to the model for suggestions. {thread.is_family ? "On for family threads unless you turn it off." : "Off for everyone outside the family unless you turn it on."}</span></span>
            <input type="checkbox" checked={reads} onChange={(e) => { const v = e.target.checked; setReads(v); void setThreadSwitch(thread.id, { assistant_reads: v }); }} className="w-5 h-5 accent-[var(--accent)]" />
          </label>
          <label className="flex items-center justify-between gap-3 min-h-10 text-fg">
            <span><span className="font-semibold">Hide from StewardOS</span><span className="block text-muted">Keeps mirroring nothing to show: the thread leaves the list and sends no badges. Messages is untouched.</span></span>
            <input type="checkbox" checked={hidden} onChange={(e) => { const v = e.target.checked; setHidden(v); start(async () => { await setThreadSwitch(thread.id, { hidden: v }); if (v) router.push("/messages"); }); }} className="w-5 h-5 accent-[var(--accent)]" />
          </label>
          <a href="messages://" className="font-semibold text-accent">Open in Messages</a>
        </div>
      )}
      {all.map((m) => (
        <div key={m.id} className={`flex flex-col gap-1 max-w-[82%] min-w-0 ${m.mine ? "self-end items-end" : "self-start"}`}>
          <div className="text-[11px] text-muted">{m.mine ? "You" : m.sender}{isAssistant && !m.mine ? " · AI" : ""} · {clock(m.at)}</div>
          {m.attachment?.path && (m.attachment.kind === "photo" || m.attachment.kind === "gif") && (
            <a href={`/api/media/${m.attachment.path}`} target="_blank" rel="noreferrer" className={`block max-w-full overflow-hidden ${m.mine ? "rounded-[16px_16px_4px_16px]" : "rounded-[16px_16px_16px_4px]"} bg-soft`}>
              <img src={`/api/media/${m.attachment.path}`} alt={m.attachment.kind === "gif" ? "GIF" : "Photo"} loading="lazy" width={m.attachment.w ?? undefined} height={m.attachment.h ?? undefined} className="block max-h-[360px] w-auto max-w-full object-contain" />
            </a>
          )}
          {m.attachment?.path && m.attachment.kind === "video" && (
            <video controls playsInline preload="metadata" src={`/api/media/${m.attachment.path}`} className={`block max-h-[360px] max-w-full bg-black ${m.mine ? "rounded-[16px_16px_4px_16px]" : "rounded-[16px_16px_16px_4px]"}`} />
          )}
          {(m.text || (m.attachment && !m.attachment.path)) && (
            <div className={`px-3.5 py-2.5 text-sm max-w-full min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap ${m.mine ? "bg-accent text-white rounded-[16px_16px_4px_16px]" : "bg-soft rounded-[16px_16px_16px_4px]"} ${m.assistant_kind === "confirmation" ? "border-2 border-amber" : ""}`}>
              {m.text}
              {m.attachment && !m.attachment.path && <div className={`text-xs ${m.text ? "mt-1" : ""} ${m.mine ? "text-white/80" : "text-muted"}`}>{m.attachment.kind === "photo" ? "📷" : m.attachment.kind === "video" ? "🎬" : m.attachment.kind === "audio" ? "🎤" : "📎"} {m.attachment.skipped === "size" ? "large file" : m.attachment.label} · <a href="messages://" className="underline">open in Messages</a></div>}
            </div>
          )}
          {!m.mine && chipsFor(m.id).length > 0 && (
            <div className="flex flex-col gap-1.5 w-full">
              <button aria-label={open === m.id ? "Hide suggestions" : "Suggestions"} aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}
                className={`self-start min-w-8 min-h-7 px-2 rounded-full text-sm font-bold leading-none ${open === m.id ? "bg-accent text-white" : "bg-soft text-accent"}`}>⋯</button>
              {open === m.id && (
                <div className="flex flex-col gap-1.5 w-full animate-[fadein_.15s_ease]">
                  {chipsFor(m.id).map((sg) => (
                    <div key={sg.id} className="flex items-center gap-2 flex-wrap">
                      <button className={`${btn} min-h-10 bg-accent text-white border-accent`} onClick={() => start(async () => {
                        const r = await takeSuggestion(sg.id);
                        if (!r.ok) { show(r.error ?? "Could not do that"); return; }
                        setGone((g) => ({ ...g, [sg.id]: sg.kind })); setOpen(null);
                        const p = r.payload ?? {};
                        if (r.kind === "task") show(r.sample ? "Sample mode: not created" : "Task created · from this text");
                        else if (r.kind === "calendar") { const st = String(p.start ?? ""); router.push(`/calendar/new?title=${encodeURIComponent(String(p.title ?? sg.title))}&date=${st.slice(0, 10)}&time=${st.slice(11, 16)}${p.where ? `&where=${encodeURIComponent(String(p.where))}` : ""}&origin=message&ref=${encodeURIComponent(sg.message_id)}&label=${encodeURIComponent(thread.name + " thread")}`); }
                        else if (r.kind === "reply") { setText(String(p.text ?? "")); show("Reply drafted · edit, then send"); }
                        else if (r.kind === "receipt") router.push(`/inbox?from=message&ref=${encodeURIComponent(sg.message_id)}`);
                      })}>{CHIP[sg.kind].icon} {CHIP[sg.kind].label}{sg.kind !== "reply" ? ` · ${sg.title}` : ""}</button>
                      <button className={`${btn} min-h-10`} onClick={() => { setGone((g) => ({ ...g, [sg.id]: "ignored" })); setOpen(null); void ignoreSuggestion(sg.id); }}>Not this</button>
                    </div>
                  ))}
                  <div className="text-[10px] text-muted">Suggested from this text · nothing happens until you tap · {chipsFor(m.id)[0]?.reason}</div>
                </div>
              )}
            </div>
          )}
          {suggestions.filter((x) => x.message_id === m.id && gone[x.id] && gone[x.id] !== "ignored").map((x) => (
            <div key={x.id} className="self-center text-[11px] rounded-full px-2.5 py-1 bg-soft text-muted">{CHIP[x.kind].label} · done · from {thread.name} thread</div>
          ))}
          {m.action && (
            <div className={`self-center text-[11px] rounded-full px-2.5 py-1 ${m.action.status === "waiting" ? "bg-amber-bg text-amber" : "bg-soft text-muted"}`}>
              {m.action.label}
              <span className="block text-[10px] opacity-80">{m.action.requested_by} · for {m.action.for_person} · from {thread.name} thread</span>
            </div>
          )}
          {isAssistant && m.assistant_kind === "confirmation" && m.action?.status === "waiting" && !sent.some((s) => /^(y|yes|n|no)$/i.test(s.text)) && (
            <div className="flex gap-2 w-full">
              <button className={`${btn} flex-1 min-h-10 bg-accent text-white border-accent`} onClick={() => { setText("Y"); }}>Y</button>
              <button className={`${btn} flex-1 min-h-10`} onClick={() => { setText("N"); }}>N</button>
            </div>
          )}
        </div>
      ))}

      {isAssistant && info && (
        <div className="card text-xs text-muted flex flex-col gap-1">
          <div className="font-semibold text-fg text-sm">How this thread works</div>
          <div>The assistant has its own Apple ID (email only, no phone number) signed into a second macOS user on the Mac mini, so it appears in Messages as a normal contact. It is not in the Family thread.</div>
          <div><b>You text it</b> anything the Ask box takes: questions, “add milk”, “mark the Tahoe oil change done at 143,100”, a receipt photo, a forwarded message.</div>
          <div><b>It texts you</b> the morning summary, confirmations (“Reply Y or N”), safety and money alerts, and “done” notices. Low-risk things it does and reports; medium ones wait for your Y; high-risk ones (money set-up, access, someone else's data) reply “this needs the dashboard” with a link.</div>
          <div>Only the family's own iMessage addresses can command it. Everything it does is in the <a href="/log" className="font-semibold text-accent">Log</a> with “via Messages” and your words. If the mini is down, texts wait and it catches up.</div>
        </div>
      )}

      <div className="fixed left-0 right-0 bottom-[calc(var(--bar-bottom)-1px)] z-10 bg-bg backdrop-blur border-t border-line"><div className="max-w-md mx-auto px-5 pt-2 pb-2">
        {waiting.map((w) => (
          <div key={w.id} className="self-end max-w-[85%] rounded-2xl px-3 py-2 bg-soft text-sm opacity-80 break-words [overflow-wrap:anywhere]">
            <div>{w.text}</div>
            <div className="text-[11px] text-muted">{w.status === "failed" ? `Not sent: ${w.error ?? "the Mac could not send it"}` : "Sending through Messages…"}</div>
          </div>
        ))}
        <form onSubmit={send} className="flex gap-2 items-center">
          <label htmlFor="msg" className="sr-only">Message {thread.name}</label>
          <input id="msg" value={text} onChange={(e) => setText(e.target.value)} placeholder={mirrorOk ? `Message ${thread.name} (sends via Messages)` : "Mirror paused · open Messages to send"} disabled={!mirrorOk} className="flex-1 min-h-11 rounded-xl border border-line bg-bg px-3.5 text-sm disabled:opacity-60" />
          <button className="min-h-11 px-3.5 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-50" disabled={!mirrorOk || !text.trim() || busy}>Send</button>
        </form>
        <div className="text-[11px] text-muted mt-1">Sent as you, from your own Mac, so it appears in Messages on every device. {!mirrorOk && <a href="messages://" className="font-semibold text-accent">Open in Messages</a>}</div>
      </div></div>
      {el}
    </div>
  );
}
