import Link from "next/link";
import { H1 } from "@/components/ui";
import { getMail, getMailAccounts, mailTrouble } from "@/lib/data-mail";
import MailList from "@/components/MailList";
import { AutoRefresh } from "@/components/EmailSubscriptionList";

export const dynamic = "force-dynamic";

export default async function Mail({ searchParams }: PageProps<"/mail">) {
  const sp = await searchParams;
  const box = sp.box === "drafts" ? "draft" : "inbox";
  const acct = typeof sp.acct === "string" ? sp.acct : "";
  const [rows, accounts] = await Promise.all([getMail(box), getMailAccounts()]);
  const list = acct ? rows.filter((r) => r.account === acct) : rows;
  const unread = rows.filter((r) => r.unread && (!acct || r.account === acct)).length;
  const href = (b: string, a: string) => `/mail?box=${b}${a ? `&acct=${encodeURIComponent(a)}` : ""}`;
  const pill = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-semibold min-h-9 inline-flex items-center ${on ? "bg-accent text-white" : "bg-soft"}`;
  const bad = accounts.map((a) => ({ id: a.id, t: mailTrouble(a) })).filter((x) => x.t);
  return (
    <>
      <AutoRefresh active={false} />
      <H1 right={box === "inbox" ? `${unread} unread` : `${list.length} drafts`}>Mail</H1>
      {accounts.length === 0 && <div className="rounded-xl bg-amber-bg text-amber px-3 py-2 text-sm font-semibold mb-3">No mailbox is connected yet. The Mac mini copies your mail here once an account is signed in.</div>}
      {bad.map((x) => <div key={x.id} role="alert" className="rounded-xl bg-amber-bg text-amber px-3 py-2 text-sm font-semibold mb-2">{x.t!.text}</div>)}
      <div className="flex gap-2 mb-2">
        <Link href={href("inbox", acct)} className={pill(box === "inbox")}>Inbox</Link>
        <Link href={href("drafts", acct)} className={pill(box === "draft")}>Drafts</Link>
      </div>
      {accounts.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-1">
          <Link href={href(box === "draft" ? "drafts" : "inbox", "")} className={pill(!acct)}>All</Link>
          {accounts.map((a) => <Link key={a.id} href={href(box === "draft" ? "drafts" : "inbox", a.address)} className={pill(acct === a.address)}>{a.address}</Link>)}
        </div>
      )}
      <MailList rows={list} showAccount={accounts.length > 1 && !acct} draft={box === "draft"} />
      <div className="flex gap-2 flex-wrap mt-4">
        <a href="message://" className="min-h-11 px-4 inline-flex items-center rounded-xl bg-soft text-xs font-semibold">Open Apple Mail</a>
        {accounts.filter((a) => a.kind === "gmail" && !/\.(contacts|calendar|sheets)$/.test(a.address)).map((a) => <a key={a.id} href={`https://mail.google.com/mail/u/${encodeURIComponent(a.address)}/`} target="_blank" rel="noreferrer" className="min-h-11 px-4 inline-flex items-center rounded-xl bg-soft text-xs font-semibold">Gmail: {a.address}</a>)}
      </div>
      <p className="text-xs text-muted mt-3">Read-only for now: reply and compose come next. Mail is copied from your mailbox every few minutes; pull down to refresh the list.</p>
    </>
  );
}
