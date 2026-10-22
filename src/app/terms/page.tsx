import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · StewardOS Household",
  description: "Terms for the StewardOS Household app.",
  robots: { index: true, follow: true },
};

const CONTACT = "rross15253@gmail.com";

export default function Terms() {
  const h2 = "text-lg font-bold mt-7 mb-2";
  const p = "text-sm leading-relaxed mb-3";
  return (
    <article className="pt-4">
      <h1 className="text-2xl mb-1">Terms of Service</h1>
      <p className="text-xs text-muted mb-5">StewardOS Household · effective October 21, 2026</p>

      <h2 className={h2}>What this is</h2>
      <p className={p}>StewardOS Household is a private organizing and record-keeping tool run by Ryan Rossiter for his own household. It is not a public service, and only people the household adds can sign in.</p>

      <h2 className={h2}>Use</h2>
      <p className={p}>The app acts only on accounts its owner has connected and approved. The owner can disconnect any account at any time at <a className="underline" href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>

      <h2 className={h2}>Not advice</h2>
      <p className={p}>The app organizes information from the household&apos;s own accounts. It does not give financial, legal, medical or tax advice, and it does not move money or place orders. Check anything important against its original source before relying on it.</p>

      <h2 className={h2}>No warranty</h2>
      <p className={p}>The app is provided as is, without warranties of any kind. To the extent the law allows, the author is not liable for missed deadlines, lost records or any indirect loss arising from its use.</p>

      <h2 className={h2}>Privacy and contact</h2>
      <p className={p}>How the app handles Google account data is described in the <a className="underline" href="/privacy">Privacy Policy</a>. Questions: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
    </article>
  );
}
