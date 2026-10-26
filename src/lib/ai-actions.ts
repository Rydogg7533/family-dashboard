"use server";
import { runTool } from "@/lib/tools/run";
// Server-action wrappers around the AI layer so client components never hold the key.
import { callModel, type Job, type Message, type ModelResult } from "@/lib/ai";
import { answerAsk, type AskReply, type EventDraft, type Turn } from "@/lib/ask-engine";
import { feedPropose, feedResolve, feedDeclineThread, threadKeyOf } from "@/lib/feed";
import { listCalendars } from "@/lib/google-calendar";
import { saveEvent, moveEventTime } from "@/app/calendar/actions";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export async function callModelAction(args: { job: Job; messages: Message[]; system?: string; feature?: string }): Promise<ModelResult> {
  return callModel(args);
}

export async function askAction(thread: Turn[], assistantApp?: string): Promise<AskReply> {
  try {
    const key = threadKeyOf(thread.find((t) => t.role === "user")?.text ?? "");
    const prev = [...thread].reverse().find((t) => t.role === "assistant");
    const last = thread[thread.length - 1]?.text ?? "";
    const pending = prev?.kind === "event_clarify" || prev?.kind === "event_confirm" || prev?.kind === "event_conflict" || prev?.kind === "event_move";
    if (pending && /^(no|n|nope|never ?mind|cancel|forget it)$/i.test(last.trim())) await feedDeclineThread(key);
    const reply = await answerAsk(thread, assistantApp);
    // What the assistant puts in front of the person goes in the feed, so a proposal that is never tapped is still visible.
    if ((reply.kind === "event_confirm" || reply.kind === "event_move") && reply.draft) {
      const d = reply.draft;
      reply.feedId = await feedPropose({ source: "ask", title: reply.kind === "event_move" ? `Move “${reply.move?.title}”, then add “${d.title}”` : `Add to calendar: ${d.title}`, detail: reply.text.split("\n").slice(0, 2).join(" · "), threadKey: key, link: "/calendar" });
    } else if (reply.kind === "event_conflict" && reply.draft) {
      reply.feedId = await feedPropose({ source: "ask", title: `Conflict for “${reply.draft.title}”`, detail: reply.text.split("\n")[0], threadKey: key });
    }
    return reply;
  } catch (e) {
    return { kind: "inbox", text: `The model could not be reached (${(e as Error).message.slice(0, 80)}). Saved to Inbox with your words.`, source: { label: "Open in Inbox", href: "/inbox" }, cost: 0, costText: "no cost", model: "none", sample: false };
  }
}

// An Ask instruction confirmed by a tap: logged with the instruction as the source (undoable).
export async function confirmInstruction(summary: string, target: string, tier: number) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await sb.from("activity_log").insert({ actor: user.email ?? "member", action: `ask_instruction_tier${tier}`, subject: `${summary} → ${target}`, undoable: true });
  return { ok: !error };
}

// The tap on "Add to Google Calendar" in Ask. Goes through the same saveEvent as the form: validated, written to Google,
// re-read from Google, logged with "from Ask". The person's own tap is the confirmation.
export async function confirmAskEvent(d: EventDraft, feedId?: string | null): Promise<{ ok: true; summary: string; href: string } | { ok: false; error: string }> {
  if (!d.title || !d.date) return { ok: false, error: "The event is missing a title or a date." };
  const cals = await listCalendars().catch(() => null);
  if (!cals) return { ok: false, error: "Google Calendar did not answer." };
  const cal = cals.find((c) => c.primary && c.canWrite) ?? cals.find((c) => c.canWrite);
  if (!cal) return { ok: false, error: "No writable calendar found." };
  const r = await saveEvent({ title: d.title, calendarId: cal.id, allDay: d.allDay, date: d.date, endDate: d.allDay ? d.endDate ?? undefined : d.endDate ?? undefined, start: d.allDay ? null : d.start, end: d.allDay ? null : d.end, location: d.location ?? "", description: "",
    reminders: d.reminders?.length ? d.reminders.map((minutes) => ({ method: "popup" as const, minutes })) : d.reminders ? [] : null, recurrence: null, attendees: d.guests, origin: { kind: "ask", ref: null, label: "Ask" } });
  if (!r.ok) { await feedResolve(feedId, "failed", r.error); return { ok: false, error: r.error }; }
  const e = r.event;
  await feedResolve(feedId, "done", `${e.title} · ${e.date}${e.allDay ? " (all day)" : ` ${e.start}`} · added to Google Calendar`, `/calendar/e/${encodeURIComponent(e.calendarId)}/${encodeURIComponent(e.id)}`);
  return { ok: true, summary: `${e.title} · ${e.date}${e.allDay ? " (all day)" : ` ${e.start}${e.end ? `–${e.end}` : ""}`} · ${e.reminders.useDefault ? "calendar default reminder" : e.reminders.overrides.length ? `${e.reminders.overrides.length} reminder${e.reminders.overrides.length > 1 ? "s" : ""}` : "no reminder"}`, href: `/calendar/e/${encodeURIComponent(e.calendarId)}/${encodeURIComponent(e.id)}` };
}

// "Move X, then add mine": the other event is moved first and read back; if that fails nothing is added.
export async function confirmMoveAndAdd(m: NonNullable<AskReply["move"]>, d: EventDraft, feedId?: string | null) {
  const moved = await moveEventTime({ calendarId: m.calendarId, id: m.id, date: m.date, oldStart: m.oldStart, newStart: m.newStart, newEnd: m.newEnd });
  if (!moved.ok) { await feedResolve(feedId, "failed", moved.error); return moved; }
  const added = await confirmAskEvent(d, null);
  if (!added.ok) { const msg = `“${m.title}” was moved to ${m.newStart}, but adding yours failed: ${added.error}`; await feedResolve(feedId, "failed", msg); return { ok: false as const, error: msg }; }
  await feedResolve(feedId, "done", `Moved “${m.title}” to ${m.newStart}; added “${d.title}”`, added.href);
  return { ...added, summary: `Moved “${m.title}” to ${m.newStart}. Added: ${added.summary}` };
}

// An unanswered thread becomes an Inbox item with the whole conversation attached (F4).
export async function parkThreadInInbox(thread: Turn[]) {
  if (!hasSupabaseEnv()) return { ok: true, sample: true };
  const sb = await createClient();
  const first = thread.find((t) => t.role === "user")?.text ?? "Ask thread";
  const { error } = await sb.from("inbox_items").insert({
    kind: "ask_thread", requested_by: (await sb.auth.getUser()).data.user?.email ?? "member", title: `"${first.slice(0, 80)}"`, origin: "Ask", origin_href: "/ask", origin_label: "Ask",
    missing: "Is this a document, an appointment or a bill?", options: ["File a document", "Add an appointment", "Add a bill", "Something else"],
    thread: thread.map((t) => ({ at: new Date().toISOString(), who: t.role === "user" ? "you" : "assistant", text: t.text })),
  });
  return { ok: !error };
}

// A write the model chose and the person then agreed to. Everything — permission, the tier, the log line —
// is decided by the tool itself, so asking and tapping cannot end up with different rules.
export async function confirmTool(name: string, args: Record<string, unknown>) {
  return runTool(name, args);
}
