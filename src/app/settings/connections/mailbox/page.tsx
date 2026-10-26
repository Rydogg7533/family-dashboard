import Link from "next/link";
import { H1 } from "@/components/ui";
import { RowGroup, SectionTitle } from "@/components/registers";
import AddMailbox from "@/components/c/AddMailbox";
import { getViewer } from "@/lib/data-registers";
import { getHouseholdMailboxes } from "@/lib/data-mail";

export const dynamic = "force-dynamic";

// Already connected comes from the household_mailboxes view (0065), not from getMyConnections(). Two reasons,
// both found live on 2026-10-26: mail_accounts is own-rows-only, so one parent could not see that the other
// had already connected an address and was about to add it twice; and the old block was hidden whenever the
// mail step read "todo", which is exactly the state of a mailbox that is signed in and has not finished its
// first sync -- so a just-added mailbox showed as nothing at all.
export default async function AddMailboxPage() {
  const [viewer, boxes] = await Promise.all([getViewer(), getHouseholdMailboxes()]);
  const mine = boxes.filter((b) => b.mine);
  const theirs = boxes.filter((b) => !b.mine);
  const label = (k: string) => (k === "gmail" ? "Google" : k === "icloud" ? "iCloud" : "Other");

  return (
    <>
      <H1 right={<Link href="/settings/connections" className="font-semibold text-accent">Connections ›</Link>}>Add a mailbox</H1>
      <p className="text-xs text-muted mb-3">Connect another email account for {viewer.name}. The app only reads it; it never sends, moves or deletes your mail.</p>

      {boxes.length > 0 && (<>
        <SectionTitle>Already connected ({boxes.length})</SectionTitle>
        <RowGroup>
          {mine.map((b) => (
            <div key={b.address} className="py-2.5 flex gap-3 items-baseline">
              <span className="text-sm font-semibold break-all min-w-0 flex-1">{b.address}</span>
              <span className="flex-none text-[11px] font-bold rounded-full px-2 py-0.5 bg-green-bg text-green whitespace-nowrap">Yours · {label(b.kind)}</span>
            </div>
          ))}
          {theirs.map((b) => (
            <div key={b.address} className="py-2.5 flex gap-3 items-baseline">
              <span className="text-sm break-all min-w-0 flex-1">{b.address}</span>
              <span className="flex-none text-[11px] font-semibold rounded-full px-2 py-0.5 bg-soft text-muted whitespace-nowrap">{b.owner ?? "someone else"} · {label(b.kind)}</span>
            </div>
          ))}
        </RowGroup>
        <p className="text-xs text-muted mt-2 mb-1">
          {theirs.length > 0
            ? "Mailboxes someone else connected are listed so the same address is not set up twice. Only the address and whose it is are shown here — their mail, counts and sync are theirs."
            : "Adding one of these again is not needed; it is already being read."}
        </p>
      </>)}

      <SectionTitle>New mailbox</SectionTitle>
      <AddMailbox who={viewer.name} />
    </>
  );
}
