import Link from "next/link";
import { getDayBlocks, getDayQuestions, getDayRecord, getSyncStatus, daySummary } from "@/lib/data-day";
import { getDisplayName } from "@/lib/data";
import { H1 } from "@/components/ui";
import { DayRecord, QuestionsList, Schedule } from "@/components/c/DayView";
import { SyncLine } from "@/components/c/SyncLine";

export const dynamic = "force-dynamic";

// F3 + F5 + F6: the morning schedule, weather on every block, a checklist per activity, the questions that
// teach the day record, and yesterday's record. Location points come from Overland on the person's own phone.
export default async function Day() {
  const [name, blocks, questions, record, sync] = await Promise.all([getDisplayName(), getDayBlocks(), getDayQuestions(), getDayRecord(), getSyncStatus(["calendar", "location", "weather"])]);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-US", { weekday: "long" });
  const s = daySummary(blocks);
  const unpacked = blocks.flatMap((b) => b.checklist?.items.filter((i) => i.layer !== "done_before" && !i.packed) ?? []).length;

  return (
    <>
      <H1 right={name}>{today}</H1>
      <div className="card mb-4">
        <div className="text-sm">{s.line}</div>
        {s.bring.length > 0 && <div className="text-sm mt-1"><span className="font-semibold text-amber">Bring:</span> {s.bring.join(", ")}.</div>}
        <div className="text-xs text-muted mt-1">{unpacked} item{unpacked === 1 ? "" : "s"} still unpacked for today · <Link href="/calendar" className="font-semibold text-accent">Full calendar</Link></div>
      </div>

      <div id="questions"><QuestionsList questions={questions} /></div>

      <section className="mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base">Schedule</h2>
          <span className="text-xs text-muted">calendar + gaps filled from Overland</span>
        </div>
        <Schedule blocks={blocks} />
      </section>

      <DayRecord entries={record} dateLabel={yesterday} />

      <section className="card">
        <SyncLine items={sync} />
      </section>
      <p className="text-xs text-muted mt-3">Your location is yours: collected by Overland on your phone, shown only on your own Day page, raw points kept 30 days. Pause it with the private-time switch in <Link href="/settings" className="font-semibold text-accent">Settings</Link>.</p>
    </>
  );
}
