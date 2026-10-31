import type { Metadata } from "next";
import { AI_PROVIDER } from "@/lib/ai-provider";

export const metadata: Metadata = {
  title: "Privacy Policy · StewardOS Household",
  description: "How StewardOS Household uses Google account data.",
  robots: { index: true, follow: true },
};

const CONTACT = "rross15253@gmail.com";

// Public, static, no data. Linked from the Google OAuth consent screen. Keep every statement true to what the
// agents actually do (scripts/email-agent.md, scripts/contacts-sync.mjs); change this page when the behavior changes.
export default function Privacy() {
  const h2 = "text-lg font-bold mt-7 mb-2";
  const p = "text-sm leading-relaxed mb-3";
  const li = "text-sm leading-relaxed mb-1.5";
  return (
    <article className="pt-4">
      <h1 className="text-2xl mb-1">Privacy Policy</h1>
      <p className="text-xs text-muted mb-5">StewardOS Household · effective October 21, 2026</p>

      <h2 className={h2}>Who this is for</h2>
      <p className={p}>StewardOS Household is a private household assistant run by Ryan Rossiter for his own family. It is not offered to the public, has no sign-up, and is used only by the people in that household. The application runs in accounts the household owns, and nobody else operates a server that receives its data.</p>

      <h2 className={h2}>Google data the app accesses</h2>
      <p className={p}>Only after the account owner approves it on Google&apos;s consent screen, the app can access:</p>
      <ul className="list-disc pl-5 mb-3">
        <li className={li}><b>Gmail:</b> message headers (sender, subject, date), the start of the message text, labels, and attachments that are receipts, bills or confirmations. It can apply labels, archive or move messages, and create drafts for the owner to review.</li>
        <li className={li}><b>Google Calendar:</b> event titles, times, locations and attendees, and it can create or update events when the owner asks.</li>
      </ul>

      <h2 className={h2}>How the data is used</h2>
      <p className={p}>The data is used only to run the household&apos;s own assistant: sorting mail into receipts, bills, confirmations and tasks; filing documents; showing the day&apos;s schedule; and keeping the household calendar in sync. It is not used for advertising, is not sold, and is not shared with any third party for their own purposes.</p>

      <h2 className={h2}>Where it is stored</h2>
      <p className={p}>Extracted records are kept in the household&apos;s own database (a Supabase project the household owns) and on a Mac mini in the household&apos;s home. Google sign-in tokens are kept only on that Mac mini, in a local-only folder, and are never put in a cloud-synced folder or in the database.</p>

      <h2 className={h2}>AI processing</h2>
      <p className={p}>To decide what a message is, and to write draft replies, short excerpts of a message (headers and the first part of the text) are sent to {AI_PROVIDER.company}&apos;s API using the household&apos;s own API key. Bulk and automated mail is filtered out by simple rules first and does not reach a model. {AI_PROVIDER.company} handles that text under its own terms and privacy policy. No person other than the household reads the mail through this app.</p>

      <h2 className={h2}>Limited Use</h2>
      <p className={p}>The app&apos;s use and transfer of information received from Google APIs to any other app will adhere to the <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

      <h2 className={h2}>What the app never does</h2>
      <ul className="list-disc pl-5 mb-3">
        <li className={li}>It never sends email. It is not granted permission to send.</li>
        <li className={li}>It never deletes email or calendar events. It labels, archives, moves and drafts only.</li>
        <li className={li}>It never shows ads and never sells or rents data.</li>
      </ul>

      <h2 className={h2}>Keeping and deleting data</h2>
      <p className={p}>Records are kept until the household deletes them. The account owner can withdraw access at any time at <a className="underline" href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>; this stops all further access immediately. To ask for stored records to be removed, write to the contact below.</p>

      <h2 className={h2}>Contact and changes</h2>
      <p className={p}>Questions or requests: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>. If how the app handles Google data changes, this page is updated first and the effective date above changes.</p>
      <p className="text-xs text-muted mt-6">See also the <a className="underline" href="/terms">Terms of Service</a>.</p>
    </article>
  );
}
