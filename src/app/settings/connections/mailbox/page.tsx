import Link from "next/link";
import { H1 } from "@/components/ui";
import { RowGroup, SectionTitle } from "@/components/registers";
import AddMailbox from "@/components/c/AddMailbox";
import { getViewer } from "@/lib/data-registers";
import { getMyConnections } from "@/lib/data-connections";

export const dynamic = "force-dynamic";

export default async function AddMailboxPage() {
  const [viewer, { conns }] = await Promise.all([getViewer(), getMyConnections()]);
  const mail = conns.find((c) => c.step === "mail");
  return (
    <>
      <H1 right={<Link href="/settings/connections" className="font-semibold text-accent">Connections ›</Link>}>Add a mailbox</H1>
      <p className="text-xs text-muted mb-3">Connect another email account for {viewer.name}. The app only reads it; it never sends, moves or deletes your mail.</p>
      {mail && mail.state !== "todo" && (<><SectionTitle>Already connected</SectionTitle><RowGroup><div className="py-3 text-xs text-muted break-words">{mail.detail}</div></RowGroup></>)}
      <SectionTitle>New mailbox</SectionTitle>
      <AddMailbox who={viewer.name} />
    </>
  );
}
