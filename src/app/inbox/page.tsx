import { H1 } from "@/components/ui";
import { InboxList } from "@/components/InboxList";
import { getInboxItems, getInboxCounts, getPendingReadIds } from "@/lib/data-inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // reading a document can take several seconds

export default async function Inbox({ searchParams }: PageProps<"/inbox">) {
  const { capture, claim } = await searchParams;
  const [items, counts, pending] = await Promise.all([getInboxItems(), getInboxCounts(), getPendingReadIds()]);
  const cap = typeof capture === "string" && ["photo", "file", "bulk"].includes(capture) ? capture : null;
  return (
    <>
      <H1 right={`${items.length} open`}>Inbox</H1>
      <p className="text-xs text-muted mb-3">Things to identify, file or decide. Each one asks only for what is missing.</p>
      <InboxList items={items} pendingIds={pending} capture={cap} claimId={typeof claim === "string" && /^[0-9a-f-]{36}$/.test(claim) ? claim : null} resolvedThisWeek={counts.resolved_this_week} />
    </>
  );
}
