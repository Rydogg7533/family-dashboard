"use client";
import { useEffect, useState, useTransition } from "react";
import { pendingLines, sendLine } from "@/app/messages/actions";
import { useRouter } from "next/navigation";
import type { Confirmation, Message, Thread } from "@/lib/data-messages";
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

export function ThreadView({ thread, messages, mirrorOk }: { thread: Thread; messages: Message[]; mirrorOk: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sent, setSent] = useState<Message[]>([]);
  const [waiting, setWaiting] = useState<{ id: string; text: string; status: string; error: string | null }[]>([]);
  const [busy, start] = useTransition();
  const [menu, setMenu] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
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
      <div className="text-[11px] font-bold text-muted">{thread.name.toUpperCase()} · {thread.members.length} people · today</div>
      {all.map((m) => (
        <div key={m.id} className={`flex flex-col gap-1 max-w-[82%] min-w-0 ${m.mine ? "self-end items-end" : "self-start"}`}>
          <div className="text-[11px] text-muted">{m.mine ? "You" : m.sender}{isAssistant && !m.mine ? " · AI" : ""} · {clock(m.at)}{!m.mine && !isAssistant ? ` · for ${thread.kind === "group" ? "Family" : "you"}` : ""}</div>
          <div className={`px-3.5 py-2.5 text-sm max-w-full min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap ${m.mine ? "bg-accent text-white rounded-[16px_16px_4px_16px]" : "bg-soft rounded-[16px_16px_16px_4px]"} ${m.assistant_kind === "confirmation" ? "border-2 border-amber" : ""}`}>
            {m.text}
            {m.attachment && <div className={`text-xs mt-1 ${m.mine ? "text-white/80" : "text-muted"}`}>{m.attachment.kind === "photo" ? "📷 photo" : "🔗"} {m.attachment.label} · opens in Messages</div>}
          </div>
          {!m.mine && !isAssistant && (
            <div className="flex gap-1.5 flex-wrap">
              <button className={btn} onClick={() => { setPending((p) => ({ ...p, [m.id]: "task" })); show("Task created from this message · with the sender and time", () => setPending((p) => { const n = { ...p }; delete n[m.id]; return n; })); }}>Make it a task</button>
              <button className={btn} onClick={() => router.push("/calendar?added=e6")}>Add to schedule</button>
              <button aria-label="More" className={`${btn} w-9`} onClick={() => setMenu(menu === m.id ? null : m.id)}>…</button>
            </div>
          )}
          {menu === m.id && (
            <div className="card flex flex-col gap-1 text-sm font-semibold w-52">
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft" onClick={() => { setMenu(null); show("Saved to [Child 1]'s Family page"); }}>Save to a Family page</button>
              <button className="text-left min-h-10 px-2 rounded-lg hover:bg-soft" onClick={() => { setMenu(null); show("Added to the Smith's list"); }}>Add to a list</button>
              <a className="text-left min-h-10 px-2 rounded-lg hover:bg-soft flex items-center" href="messages://">Open in Messages</a>
            </div>
          )}
          {(m.action || pending[m.id]) && (
            <div className={`self-center text-[11px] rounded-full px-2.5 py-1 ${m.action?.status === "waiting" || pending[m.id] === "task" && !m.action ? "bg-amber-bg text-amber" : "bg-soft text-muted"}`}>
              {m.action?.label ?? "Task created from this · Undo in the toast"}
              <span className="block text-[10px] opacity-80">{m.action ? `${m.action.requested_by} · for ${m.action.for_person}` : `Asked here · for you`} · from {thread.name} thread</span>
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

      {isAssistant && (
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
