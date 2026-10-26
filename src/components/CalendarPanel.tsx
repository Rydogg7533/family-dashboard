import Link from "next/link";
import { calendarsWithChoices, googleCalAccount } from "@/lib/google-calendar";
import { CalendarChoiceRow } from "@/components/CalendarChoices";

// The calendar list, grouped by the account it came from, sliding in from the right (D73).
// It is a page state (?calendars=1), not client state, so the back gesture closes it.
export async function CalendarPanel({ back }: { back: string }) {
  const cals = await calendarsWithChoices();
  const account = googleCalAccount();
  const fresh = cals.filter((c) => c.isNew).length;

  return (
    <div className="fixed inset-0 z-40">
      <Link href={back} aria-label="Close" className="absolute inset-0 bg-black/60" />
      <div className="absolute inset-y-0 right-0 w-[88%] max-w-sm bg-bg border-l border-line flex flex-col shadow-2xl animate-[calslide_.18s_ease-out]">
        <style>{"@keyframes calslide{from{transform:translateX(100%)}to{transform:translateX(0)}}"}</style>
        <div className="flex justify-between items-center px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-2">
          <div className="text-xl font-bold">Calendars</div>
          <Link href={back} aria-label="Close" className="w-11 h-11 -mr-2 inline-flex items-center justify-center text-muted text-2xl leading-none">×</Link>
        </div>
        <p className="px-4 pb-3 text-xs text-muted">Ticked calendars appear in the app — on the calendar, on Today, and in what the assistant notices. The rest stay in Google.</p>

        <div className="flex-1 overflow-auto px-4 pb-6 flex flex-col gap-4">
          {cals.length === 0 && <div className="card text-sm text-muted">No calendars on this account.</div>}
          {cals.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <div className="text-[11px] font-bold tracking-wide text-muted px-1 truncate">{account.toUpperCase()}</div>
              <div className="card !py-0 !px-0 overflow-hidden">
                {cals.map((c) => <CalendarChoiceRow key={c.id} c={{ id: c.id, name: c.name, color: c.color, shown: c.shown, role: c.role, isNew: c.isNew, canWrite: c.canWrite }} />)}
              </div>
            </section>
          )}
          {fresh > 0 && <p className="text-xs text-amber px-1">{fresh} calendar{fresh === 1 ? "" : "s"} appeared on this account since you last chose. They stay hidden until you tick them.</p>}
          <Link href="/settings/connections" className="min-h-11 rounded-xl border border-line font-semibold text-sm inline-flex items-center justify-center">Accounts…</Link>
          <p className="text-xs text-muted px-1">One account today. When Melissa connects hers, her calendars appear under her own heading and she picks her own.</p>
        </div>
      </div>
    </div>
  );
}
