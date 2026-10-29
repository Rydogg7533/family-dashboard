import Link from "next/link";
import { H1 } from "@/components/ui";
import { getMail, getMailAccounts, getNewsletters, mailTrouble } from "@/lib/data-mail";
import MailList from "@/components/MailList";
import { AutoRefresh } from "@/components/EmailSubscriptionList";

export const dynamic = "force-dynamic";

export default async function Mail({ searchParams }: PageProps<"/mail">) {
  const sp = await searchParams;
  const box = sp.box === "drafts" ? "draft" : sp.box === "newsletters" ? "newsletters" : "inbox";
  const acct = typeof sp.acct === "string" ? sp.acct : "";
  const from = typeof sp.from === "string" ? sp.from.toLowerCase() : "";
  const [rows, accounts, news] = await Promise.all([getMail(box === "newsletters" ? "inbox" : box), getMailAccounts(), box === "newsletters" ? getNewsletters() : Promise.resolve({ senders: [], rows: [] })]);
  const list = acct ? rows.filter((r) => r.account === acct) : rows;
  const unread = rows.filter((r) => r.unread && (!acct || r.account === acct)).length;
  const href = (b: string, a: string) => `/mail?box=${b}${a ? `&acct=${encodeURIComponent(a)}` : ""}`;
  const pill = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-semibold min-h-9 inline-flex items-center ${on ? "bg-accent text-white" : "bg-soft"}`;
  const bad = accounts.map((a) => ({ id: a.id, t: mailTrouble(a) })).filter((x) => x.t);
  return (
    <>
      <AutoRefresh active={false} />
      <H1 right={box === "inbox" ? `${unread} unread` : box === "draft" ? `${list.length} drafts` : `${news.senders.filter((x) => !x.archived).length} senders`}>Mail</H1>
      {accounts.length === 0 && <div className="rounded-xl bg-amber-bg text-amber px-3 py-2 text-sm font-semibold mb-3">No mailbox is connected yet. The Mac mini copies your mail here once an account is signed in.</div>}
      {bad.map((x) => <div key={x.id} role="alert" className="rounded-xl bg-amber-bg text-amber px-3 py-2 text-sm font-semibold mb-2">{x.t!.text}</div>)}
      <div className="flex gap-2 mb-2">
        <Link href={href("inbox", acct)} className={pill(box === "inbox")}>Inbox</Link>
        <Link href={href("newsletters", acct)} className={pill(box === "newsletters")}>Newsletters</Link>
        <Link href={href("drafts", acct)} className={pill(box === "draft")}>Drafts</Link>
        <Link href="/email-subscriptions" className={pill(false)}>Mailing lists</Link>
      </div>
      {box === "newsletters" && <Newsletters senders={news.senders} rows={news.rows} from={from} acct={acct} showAccount={accounts.length > 1 && !acct} />}
      {box !== "newsletters" && accounts.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-1">
          <Link href={href(box === "draft" ? "drafts" : "inbox", "")} className={pill(!acct)}>All</Link>
          {accounts.map((a) => <Link key={a.id} href={href(box === "draft" ? "drafts" : "inbox", a.address)} className={pill(acct === a.address)}>{a.address}</Link>)}
        </div>
      )}
      {box !== "newsletters" && <MailList rows={list} showAccount={accounts.length > 1 && !acct} draft={box === "draft"} />}
      <div className="flex gap-2 flex-wrap mt-4">
        <a href="message://" className="min-h-11 px-4 inline-flex items-center rounded-xl bg-soft text-xs font-semibold">Open Apple Mail</a>
        {accounts.filter((a) => a.kind === "gmail" && !/\.(contacts|calendar|sheets)$/.test(a.address)).map((a) => <a key={a.id} href={`https://mail.google.com/mail/u/${encodeURIComponent(a.address)}/`} target="_blank" rel="noreferrer" className="min-h-11 px-4 inline-flex items-center rounded-xl bg-soft text-xs font-semibold">Gmail: {a.address}</a>)}
      </div>
      <p className="text-xs text-muted mt-3">Read-only for now: reply and compose come next. Mail is copied from your mailbox every few minutes; pull down to refresh the list.</p>
    </>
  );
}

// Newsletters (D14, D19): the person's mailing lists, grouped by sender, read here. Tap a sender for its messages,
// tap a message to read it; Archive and Unsubscribe live on the open message. Archived senders are hidden here only.
import type { MailRow, NewsletterSender } from "@/lib/data-mail";
function Newsletters({ senders, rows, from, acct, showAccount }: { senders: NewsletterSender[]; rows: MailRow[]; from: string; acct: string; showAccount: boolean }) {
  const shown = senders.filter((s) => !s.archived && (!acct || s.latest?.account === acct));
  const hidden = senders.filter((s) => s.archived).length;
  if (from) {
    const s = senders.find((x) => x.address.toLowerCase() === from);
    const list = rows.filter((r) => r.from_addr?.toLowerCase() === from && (!acct || r.account === acct));
    return (
      <>
        <Link href={`/mail?box=newsletters${acct ? `&acct=${encodeURIComponent(acct)}` : ""}`} className="text-xs font-semibold text-accent">‹ All newsletters</Link>
        <div className="text-sm font-bold mt-1 mb-2">{s?.name ?? from} <span className="text-xs text-muted font-normal">· {list.length} message{list.length === 1 ? "" : "s"}</span></div>
        <MailList rows={list} showAccount={showAccount} draft={false} />
      </>
    );
  }
  return (
    <>
      {shown.length === 0 && <div className="text-muted text-sm py-4">No newsletters in the inbox copy right now.{hidden ? ` ${hidden} archived.` : ""}</div>}
      <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
        {shown.map((s) => (
          <Link key={s.sub_id} href={`/mail?box=newsletters&from=${encodeURIComponent(s.address)}${acct ? `&acct=${encodeURIComponent(acct)}` : ""}`} prefetch={false} className="block px-3 py-2.5 min-h-11 bg-bg">
            <div className="flex items-baseline gap-2">
              {s.unread > 0 && <span aria-label="Unread" className="shrink-0 w-2 h-2 rounded-full bg-accent self-center" />}
              <span className={`min-w-0 flex-1 truncate ${s.unread ? "font-bold" : "font-semibold"}`}>{s.name}</span>
              <span className="shrink-0 text-xs text-muted">{s.count}{s.unread ? ` · ${s.unread} new` : ""}</span>
            </div>
            <div className="truncate text-sm">{s.latest?.subject || "(no subject)"}</div>
            <div className="truncate text-xs text-muted">{s.address}{s.status !== "active" ? ` · ${s.status === "requested" ? "unsubscribe requested" : s.status}` : ""}</div>
          </Link>
        ))}
      </div>
      {hidden > 0 && <div className="text-xs text-muted mt-2">{hidden} archived sender{hidden === 1 ? "" : "s"} hidden · <Link href="/email-subscriptions" className="font-semibold text-accent">Mailing lists › Archived</Link></div>}
    </>
  );
}
