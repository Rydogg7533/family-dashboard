"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setContactsProvider } from "@/app/settings/contacts/actions";
import { CONTACTS_PROVIDERS, checkChoice, type ConnectionStatus, type ContactsProvider } from "@/lib/contacts-providers";

type Props = { provider: ContactsProvider; chosen: boolean; account: string; status: ConnectionStatus | null; note: string | null; lastSyncedAt: string | null };

// The one place a person chooses where their contacts live. Used on Settings › Contacts source, and meant to be dropped
// into the first-run setup and the Today set-up cards unchanged.
export default function ContactsSourcePicker(c: Props) {
  const [provider, setProvider] = useState<ContactsProvider>(c.provider);
  const [account, setAccount] = useState(c.account);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const spec = CONTACTS_PROVIDERS.find((p) => p.id === provider)!;
  const dirty = provider !== c.provider || account.trim().toLowerCase() !== c.account.toLowerCase();
  const err = checkChoice(provider, account);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await setContactsProvider({ provider, account });
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: "unchanged" in r && r.unchanged ? "Nothing changed." : "Saved. The Mac mini picks this up within a few minutes." });
      router.refresh();
    });
  }

  const when = c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  const statusLine = !c.chosen ? "Using Apple (iCloud) Contacts, the original setting."
    : c.status === "ok" ? `Connected${when ? ` · last synced ${when}` : ""}` : c.status === "error" ? "Problem" : "Waiting for the Mac mini";

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Where your contacts live</legend>
        {CONTACTS_PROVIDERS.map((p) => (
          <label key={p.id} className={`card flex gap-3 items-start cursor-pointer ${provider === p.id ? "ring-2 ring-accent" : ""}`}>
            <input type="radio" name="contacts-provider" value={p.id} checked={provider === p.id} onChange={() => { setProvider(p.id); setMsg(null); }} className="mt-1 size-5 accent-[var(--accent)]" />
            <span className="min-w-0"><span className="block font-semibold">{p.label}</span><span className="block text-xs text-muted">{p.sub}</span></span>
          </label>
        ))}
      </fieldset>

      {spec.accountLabel && (
        <label className="block text-sm">
          <span className="block text-xs font-semibold text-muted mb-1">{spec.accountLabel}</span>
          <input type={provider === "google" ? "email" : "text"} inputMode="email" autoCapitalize="none" autoCorrect="off" value={account} onChange={(e) => { setAccount(e.target.value); setMsg(null); }} placeholder={provider === "google" ? "name@gmail.com" : "name@icloud.com"} className="w-full min-h-11 px-3 rounded-xl border border-line bg-bg text-sm" />
        </label>
      )}

      <button onClick={save} disabled={pending || !dirty || !!err} className="min-h-11 px-4 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-40">{pending ? "Saving…" : "Save"}</button>
      {dirty && err && <p className="text-xs text-muted">{err}</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "text-green" : "text-red"}`}>{msg.text}</p>}

      <div className="card text-sm">
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted mb-1">Status</div>
        <div className={c.status === "error" ? "text-red font-semibold" : "font-semibold"}>{statusLine}</div>
        {c.note && <div className="text-xs text-muted mt-1 break-words">{c.note}</div>}
      </div>

      {c.chosen && c.provider === "google" && c.status !== "ok" && (
        <div className="card text-xs text-muted">
          <div className="font-semibold text-fg text-sm mb-1">One step on the Mac mini</div>
          Google needs your permission once. On the Mac mini, in Terminal, run <code className="break-all">cd ~/family-dashboard &amp;&amp; node scripts/google-auth.mjs --account {c.account} --purpose contacts</code> and sign in as that account in the browser that opens. Contacts appear here within about 30 minutes after that.
        </div>
      )}
      {c.chosen && c.provider === "icloud" && c.status !== "ok" && (
        <div className="card text-xs text-muted">
          <div className="font-semibold text-fg text-sm mb-1">One step on the Mac mini</div>
          iCloud needs an app-specific password (appleid.apple.com › Sign-In and Security). It is added to the Mac mini’s private settings file, never to this app or to chat.
        </div>
      )}
    </div>
  );
}
