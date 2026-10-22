import Link from "next/link";
import { notFound } from "next/navigation";
import { getMailMessage } from "@/lib/data-mail";

export const dynamic = "force-dynamic";
const who = (p: { name: string; addr: string }) => (p.name ? `${p.name} <${p.addr}>` : p.addr);
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function MailMessage({ params }: PageProps<"/mail/[id]">) {
  const { id } = await params;
  const m = await getMailMessage(id);
  if (!m) notFound();
  const back = m.folder === "draft" ? "/mail?box=drafts" : "/mail";
  return (
    <>
      <Link href={back} className="text-xs font-semibold text-accent">‹ {m.folder === "draft" ? "Drafts" : "Inbox"}</Link>
      <h1 className="text-xl font-bold mt-2 break-words">{m.subject || "(no subject)"}</h1>
      <div className="text-sm mt-2 flex flex-col gap-0.5 break-words">
        <div><span className="text-muted">From </span>{m.from_addr ? who({ name: m.from_name ?? "", addr: m.from_addr }) : "Unknown"}</div>
        <div><span className="text-muted">To </span>{m.to_addrs.map(who).join(", ") || "(none)"}</div>
        {m.cc_addrs.length > 0 && <div><span className="text-muted">Cc </span>{m.cc_addrs.map(who).join(", ")}</div>}
        <div className="text-xs text-muted">{m.sent_at ? new Date(m.sent_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : ""} · {m.account}</div>
      </div>
      <div className="border-t border-line my-3" />
      <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.body_text?.trim() || m.snippet || "(no text)"}</div>
      {m.attachments.length > 0 && (
        <div className="mt-4 text-sm"><div className="text-xs font-bold text-muted uppercase tracking-wide mb-1">Attachments</div>
          {m.attachments.map((a, i) => <div key={i}>📎 {a.name} <span className="text-xs text-muted">{kb(a.size)}</span></div>)}
          <div className="text-xs text-muted mt-1">Open in Apple Mail or Gmail to download.</div>
        </div>
      )}
      {m.rfc_message_id && <a href={`message://%3c${encodeURIComponent(m.rfc_message_id).replace(/%40/g, "@")}%3e`} className="mt-5 min-h-11 grid place-items-center rounded-xl bg-accent text-white text-sm font-semibold">Open in Apple Mail</a>}
      {m.web_url && <a href={m.web_url} target="_blank" rel="noreferrer" className="mt-2 min-h-11 grid place-items-center rounded-xl bg-soft text-sm font-semibold">Open in Gmail</a>}
    </>
  );
}
