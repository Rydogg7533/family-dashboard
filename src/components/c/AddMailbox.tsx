"use client";
import { useState } from "react";

// Builds the one command to paste on the Mac mini. The app password is never typed here: the script asks for it hidden in Terminal,
// so it never passes through the app, the database or this page.
const PROVIDERS = {
  gmail: { label: "Gmail", hint: "Needs 2-Step Verification on the Google account, then an App password: myaccount.google.com/apppasswords." },
  icloud: { label: "iCloud Mail", hint: "Needs an app-specific password: appleid.apple.com › Sign-In and Security › App-Specific Passwords." },
  other: { label: "Other (IMAP)", hint: "Any service that offers IMAP with an app password. Outlook.com no longer allows this." },
} as const;
type P = keyof typeof PROVIDERS;
const ADDRESS = /^[^@\s'"`$\;&|<>()]+@[^@\s'"`$\;&|<>()]+\.[^@\s'"`$\;&|<>()]+$/;
const HOST = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

export default function AddMailbox({ who }: { who: string }) {
  const [provider, setProvider] = useState<P>("gmail");
  const [address, setAddress] = useState("");
  const [host, setHost] = useState("");
  const [done, setDone] = useState(false);
  const addr = address.trim().toLowerCase();
  const okAddr = ADDRESS.test(addr), okHost = provider !== "other" || HOST.test(host.trim());
  const safeWho = /^[A-Za-z][A-Za-z .'-]{0,40}$/.test(who) ? who : "";
  const cmd = okAddr && okHost && safeWho
    ? `cd ~/family-dashboard && git pull -q --rebase && node scripts/mail-connect.mjs --provider ${provider} --account "${addr}" --person "${safeWho}"${provider === "other" ? ` --host "${host.trim().toLowerCase()}"` : ""}`
    : "";
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="card flex flex-col gap-3">
        <div>
          <div className="text-xs text-muted mb-1">Mail service</div>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(PROVIDERS) as P[]).map((k) => (
              <button key={k} type="button" onClick={() => { setProvider(k); setDone(false); }} aria-pressed={provider === k} className={`min-h-11 px-4 rounded-xl text-sm font-semibold ${provider === k ? "bg-accent text-white" : "bg-soft"}`}>{PROVIDERS[k].label}</button>
            ))}
          </div>
          <div className="text-xs text-muted mt-2">{PROVIDERS[provider].hint}</div>
        </div>
        <label className="flex flex-col gap-1"><span className="text-xs text-muted">Email address</span>
          <input value={address} onChange={(e) => { setAddress(e.target.value); setDone(false); }} inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="name@example.com" className="min-h-11 rounded-xl border border-line bg-transparent px-3" />
        </label>
        {provider === "other" && (
          <label className="flex flex-col gap-1"><span className="text-xs text-muted">IMAP server</span>
            <input value={host} onChange={(e) => { setHost(e.target.value); setDone(false); }} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="imap.example.com" className="min-h-11 rounded-xl border border-line bg-transparent px-3" />
          </label>
        )}
        {address && !okAddr && <div className="text-xs text-red">That doesn’t look like an email address.</div>}
        {!safeWho && <div className="text-xs text-red">Your name in the app has characters this page can’t put in a command. Ask Ryan to run the script by hand.</div>}
      </div>
      {cmd && (
        <div className="card flex flex-col gap-2">
          <div className="font-semibold">Paste this into Terminal on the Mac mini</div>
          <div className="font-mono text-[11px] break-all select-all rounded-xl border border-line p-2">{cmd}</div>
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(cmd); setDone(true); } catch { /* selectable */ } }} className="min-h-11 px-4 rounded-xl bg-soft text-sm font-semibold">{done ? "Copied" : "Copy command"}</button>
          <ol className="text-xs text-muted list-decimal pl-4 flex flex-col gap-1">
            <li>It asks for the app password. Typing is hidden, and the password is saved only on the Mac mini, never here.</li>
            <li>It signs in read-only, lists the folders to prove it works, then does a test sync that reads only.</li>
            <li>Within 5 minutes the mailbox shows up in Connections and Mail. Nothing in the mailbox is ever changed.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
