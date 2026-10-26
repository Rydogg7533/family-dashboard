import type { Task } from "@/lib/data";
import { TaskActions } from "./TaskActions";
import { TaskWho } from "./TaskWho";

// Only a kind that differs from the default gets an eyebrow. 13 of 14 open tasks are "do", so a "DO"
// label on nearly every card said nothing -- and "decide" shared the accent colour with it, so the
// eyebrow distinguished almost nothing it was there to distinguish.
const label: Partial<Record<Task["kind"], { text: string; cls: string }>> = {
  reply: { text: "REPLY NEEDED", cls: "text-amber" },
  decide: { text: "DECIDE", cls: "text-amber" },
  fyi: { text: "JUST SO YOU KNOW", cls: "text-muted" },
};

// The email funnel appends "(from <addr> - no links kept from the email...; <date>; moved to <folder>)"
// to every summary it writes: about 90 identical characters per card, in front of which the real
// sentence is lost. Split it so the card shows the sentence and the sender separately. The proper fix
// is for email-funnel to stop writing it into summary at all; this also repairs the rows already saved.
const MAIL_TAIL = /\s*\(from\s+([^\s·)]+)[^)]*\)\s*$/;
function splitSummary(s: string | null): { text: string | null; from: string | null } {
  if (!s) return { text: null, from: null };
  const m = s.match(MAIL_TAIL);
  return m ? { text: s.replace(MAIL_TAIL, "").trim() || null, from: m[1] } : { text: s, from: null };
}

const ORIGIN: Record<string, string> = {
  email: "Email", routine: "Money routine", warranty: "Warranty",
  child_unlock: "Child unlock", claim: "Claim", subscription: "Subscription",
};

// "due Fri, Oct 23" makes you do the arithmetic, and every open task is currently overdue, so a column
// of red dates reads as wallpaper. Say how late it is instead.
function dueChip(due: Date | null): { text: string; late: boolean } | null {
  if (!due) return null;
  const days = Math.round((Date.now() - due.getTime()) / 86_400_000);
  if (days >= 1) return { text: days === 1 ? "1 day late" : `${days} days late`, late: true };
  if (days === 0) return { text: "today", late: false };
  const ahead = -days;
  return { text: ahead <= 6 ? due.toLocaleDateString("en-US", { weekday: "short" }) : due.toLocaleDateString("en-US", { month: "short", day: "numeric" }), late: false };
}

const shortAgo = (iso: string) => {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d < 1 ? "today" : `${d}d`;
};

export function TaskRow({ task, me = null, names = {} }: { task: Task; me?: string | null; names?: Record<string, string> }) {
  const l = label[task.kind];
  const chip = dueChip(task.due_at ? new Date(task.due_at) : null);
  const { text: summary, from } = splitSummary(task.summary);
  const ids = Object.keys(names);
  const otherId = ids.find((x) => x !== me) ?? null;
  const otherName = otherId ? names[otherId] : "the other person";
  const isFyi = !!me && task.audience !== "both" && !!task.person && task.person !== me && (task.fyi ?? []).includes(me);
  const addedBy = task.origin_kind === "person" && task.origin_ref ? names[task.origin_ref] : null;
  const source = from ?? (addedBy ? `${addedBy} added this` : ORIGIN[task.origin_kind] ?? task.origin_kind);
  // One word, and only when it is not simply yours: on your own tab, no marker means it is mine.
  const who = task.audience === "both" ? "Household"
    : isFyi ? `${names[task.person!] ?? "Someone"} has this`
    : task.person && task.person !== me ? (names[task.person] ?? "Someone")
    : null;
  return (
    <div className="card flex flex-col gap-2.5">
      {l && <div className={`text-[11px] font-bold tracking-wide ${l.cls}`}>{l.text}</div>}
      <div className="flex gap-2.5 items-start">
        <div className="font-semibold text-base leading-snug min-w-0 flex-1">{task.title}</div>
        {chip && <span className={`flex-none text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap ${chip.late ? "bg-red-bg text-red" : "bg-soft text-muted"}`}>{chip.text}</span>}
      </div>
      {summary && <div className="text-sm text-muted leading-snug line-clamp-2">{summary}</div>}
      <div className="text-xs text-muted truncate">
        {source} &middot; {shortAgo(task.created_at)}
        {who && <> &middot; <span className="text-fg font-semibold">{who}</span></>}
      </div>
      <div className="flex gap-2 items-start">
        <div className="flex-1 min-w-0"><TaskActions id={task.id} kind={task.title.startsWith("Subscription? ") ? "sub" : task.kind} /></div>
        {me && <TaskWho id={task.id} mine={task.person === me} headsUp={(task.fyi ?? []).length > 0} otherName={otherName} canTake={isFyi} />}
      </div>
    </div>
  );
}
