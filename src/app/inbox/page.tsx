import Link from "next/link";
import { H1 } from "@/components/ui";
import { InboxList } from "@/components/InboxList";
import { getPeopleNames } from "@/lib/data";
import { getRequestUser, hasSupabaseEnv } from "@/lib/supabase/server";
import { isOwnerViewer } from "@/lib/owner";
import { getInboxItems, getInboxCounts, getPendingReadIds, getDecidedItems, getPaidWithContext } from "@/lib/data-inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // reading a document can take several seconds

export default async function Inbox({ searchParams }: PageProps<"/inbox">) {
  const { capture, claim } = await searchParams;
  const [items, counts, pending, names, user, decided] = await Promise.all([getInboxItems(), getInboxCounts(), getPendingReadIds(), getPeopleNames(), getRequestUser(), getDecidedItems()]);
  const paid = await getPaidWithContext(items);
  const canOpenStatements = hasSupabaseEnv() ? await isOwnerViewer() : true;   // preview pretends to be an owner, like the Statements page
  const cap = typeof capture === "string" && ["photo", "file", "bulk"].includes(capture) ? capture : null;
  return (
    <>
      <H1 right={`${items.length} open`}>Inbox</H1>
      <p className="text-xs text-muted mb-3">Things to identify, file or decide. Each one asks only for what is missing.</p>
      {canOpenStatements && (
        <Link href="/money/statements" className="card flex items-center justify-between gap-3 mb-3 text-sm">
          <span><span className="block font-semibold">Bank or card statement?</span><span className="block text-xs text-muted">Use Statements (private). It is read on your Mac and never by AI.</span></span>
          <span className="font-semibold text-accent whitespace-nowrap">Open ›</span>
        </Link>
      )}
      <InboxList me={user?.id ?? null} names={names} items={items} pendingIds={pending} capture={cap} claimId={typeof claim === "string" && /^[0-9a-f-]{36}$/.test(claim) ? claim : null} resolvedThisWeek={counts.resolved_this_week} decided={decided} paid={paid} />
    </>
  );
}
