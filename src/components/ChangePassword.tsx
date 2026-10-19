"use client";
import { useState, useTransition } from "react";
import { changePassword } from "@/app/settings/people/actions";

const input = "w-full min-h-11 px-3 rounded-xl border border-line bg-bg text-base";

export function ChangePassword({ viewer }: { viewer: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await changePassword(current, next, confirm);
      if (r.ok) {
        setMsg({ ok: true, text: r.sample ? "Sample mode: nothing was changed." : `Password changed for ${viewer}. Use the new one next time you sign in.` });
        setCurrent(""); setNext(""); setConfirm("");
      } else setMsg({ ok: false, text: r.error ?? "Could not change the password." });
    });
  };

  return (
    <form onSubmit={submit} className="card" autoComplete="off">
      <div className="font-semibold">Change my password</div>
      <p className="text-xs text-muted mt-0.5 mb-3">For {viewer}. Replace the temporary password you were given. Save the new one in Apple Passwords.</p>
      <label className="block text-xs font-semibold mb-1" htmlFor="pw-current">Current (temporary) password</label>
      <input id="pw-current" type={show ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
      <label className="block text-xs font-semibold mt-3 mb-1" htmlFor="pw-new">New password (at least 10 characters)</label>
      <input id="pw-new" type={show ? "text" : "password"} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
      <label className="block text-xs font-semibold mt-3 mb-1" htmlFor="pw-confirm">New password again</label>
      <input id="pw-confirm" type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
      <label className="flex items-center gap-2 mt-3 text-sm min-h-11"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="w-5 h-5" />Show passwords</label>
      <button type="submit" disabled={pending} className="mt-1 min-h-11 px-4 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50">{pending ? "Changing…" : "Change password"}</button>
      {msg && <div role="status" className={`text-sm mt-3 ${msg.ok ? "text-green" : "text-red"}`}>{msg.text}</div>}
    </form>
  );
}
