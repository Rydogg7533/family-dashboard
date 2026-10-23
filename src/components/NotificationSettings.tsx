"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CHANNELS, DEFAULT_PREFS, NOTIF_TYPES, loadPrefs, savePrefs, urlBase64ToUint8Array, type Channel, type NotifPrefs } from "@/lib/notifications";
import { saveSubscription, sendTest } from "@/app/settings/notifications/actions";
import { Toast, useToast } from "@/components/Toast";

type SubState = "checking" | "unsupported" | "needs-install" | "off" | "on" | "sample" | "denied";

export function NotificationSettings({ viewer, vapidKey }: { viewer: string; vapidKey: string }) {
  const [p, setP] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [sub, setSub] = useState<SubState>("checking");
  const [subNote, setSubNote] = useState("");
  const [pending, start] = useTransition();
  const [testNote, setTestNote] = useState("");
  const { toast, show, clear } = useToast();

  useEffect(() => {
    setP(loadPrefs());
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setSub("unsupported"); return; }
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      if (ios && !standalone) { setSub("needs-install"); return; }
      if (!vapidKey) { setSub("sample"); return; }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const existing = await reg.pushManager.getSubscription();
        setSub(existing ? "on" : Notification.permission === "denied" ? "denied" : "off");
      } catch { setSub("off"); }
    })();
  }, [vapidKey]);

  const commit = (next: NotifPrefs, text: string) => {
    const prev = p; const stamped = { ...next, updatedBy: viewer, updatedAt: new Date().toISOString() };
    setP(stamped); savePrefs(stamped); show(`${text} · ${viewer}`, () => { setP(prev); savePrefs(prev); });
  };
  const setChannel = (id: string, ch: Channel) => commit({ ...p, matrix: { ...p.matrix, [id]: ch } }, `${NOTIF_TYPES.find((t) => t.id === id)!.label} → ${CHANNELS.find((c) => c.id === ch)!.label}`);

  const allow = () => start(async () => {
    if (sub === "sample") { setSub("sample"); setSubNote("Sample mode: no VAPID key set, so this device is marked subscribed only here."); show(`Subscription noted (sample) · ${viewer}`); return; }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setSub("denied"); setSubNote("Permission was not granted. Allow notifications for this site in the browser or system settings."); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
      const json = s.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await saveSubscription(json, navigator.userAgent.slice(0, 80));
      if (r.ok) { setSub("on"); setSubNote(""); show(`This device will receive push · ${viewer}`); } else setSubNote(r.error ?? "Could not save the subscription.");
    } catch (e) { setSubNote(`Could not subscribe: ${(e as Error).message} (key seen by the app: ${vapidKey.length} characters, starts ${vapidKey.slice(0, 6)}, ends ${vapidKey.slice(-4)}; it should be 87, BP2uaH, RYkg)`); }
  });

  const test = () => start(async () => {
    const r = await sendTest(viewer);
    setTestNote(r.ok ? `Queued ${new Date(r.queuedAt ?? Date.now()).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${r.sample ? " (sample mode: logged, not sent)" : "; the Mac mini sender delivers it within a minute"} · ${viewer} asked` : `Could not queue: ${r.error}`);
  });

  const subLabel: Record<SubState, { text: string; cls: string }> = {
    checking: { text: "Checking…", cls: "text-muted" }, unsupported: { text: "This browser cannot receive push", cls: "text-amber" },
    "needs-install": { text: "On iPhone, add to Home Screen first (Share → Add to Home Screen); a tab does not receive push", cls: "text-amber" },
    off: { text: "Not allowed on this device yet", cls: "text-muted" }, on: { text: "Allowed on this device", cls: "text-green" },
    sample: { text: "Sample mode (no VAPID key)", cls: "text-amber" }, denied: { text: "Blocked in the browser", cls: "text-red" },
  };

  return (
    <>
      <div className="card mb-4">
        <div className="font-semibold">This device</div>
        <div className={`text-sm mt-0.5 ${subLabel[sub].cls}`}>{subLabel[sub].text}</div>
        {subNote && <div className="text-xs text-muted mt-1">{subNote}</div>}
        <div className="flex gap-2 mt-3 flex-wrap">
          <button type="button" onClick={allow} disabled={pending || sub === "on" || sub === "unsupported" || sub === "needs-install" || sub === "checking"} className="min-h-11 px-4 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50">Allow notifications on this device</button>
          <button type="button" onClick={test} disabled={pending} className="min-h-11 px-4 rounded-xl border border-line text-sm font-semibold disabled:opacity-50">Send me a test</button>
        </div>
        {testNote && <div className="text-xs text-muted mt-2">{testNote}</div>}
      </div>

      <div className="text-[11px] font-bold tracking-wide text-muted mb-1.5">WHERE EACH KIND APPEARS</div>
      <div className="card !py-1 mb-4">
        {NOTIF_TYPES.map((t) => (
          <div key={t.id} className="py-2.5 border-b border-line last:border-b-0">
            <div className="font-semibold text-sm">{t.label}</div><div className="text-xs text-muted">{t.note}</div>
            <div className="flex gap-1.5 mt-1.5" role="radiogroup" aria-label={t.label}>
              {CHANNELS.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={p.matrix[t.id] === c.id} onClick={() => setChannel(t.id, c.id)} className={`min-h-9 px-3 rounded-full text-xs font-semibold border ${p.matrix[t.id] === c.id ? "bg-accent text-white border-accent" : "bg-soft border-transparent"}`}>{c.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="text-[11px] font-bold tracking-wide text-muted mb-1.5">TIMES · {viewer.toUpperCase()}</div>
      <div className="card !py-1 mb-4">
        <label className="flex justify-between items-center min-h-12 border-b border-line gap-3"><span className="font-semibold text-sm">Morning summary</span><input type="time" value={p.morningTime} onChange={(e) => commit({ ...p, morningTime: e.target.value }, "Morning time saved")} className="min-h-10 px-2 rounded-xl border border-line bg-bg text-sm" /></label>
        <label className="flex justify-between items-center min-h-12 border-b border-line gap-3"><span className="font-semibold text-sm">Quiet hours start</span><input type="time" value={p.quietStart} onChange={(e) => commit({ ...p, quietStart: e.target.value }, "Quiet hours saved")} className="min-h-10 px-2 rounded-xl border border-line bg-bg text-sm" /></label>
        <label className="flex justify-between items-center min-h-12 border-b border-line gap-3"><span className="font-semibold text-sm">Quiet hours end</span><input type="time" value={p.quietEnd} onChange={(e) => commit({ ...p, quietEnd: e.target.value }, "Quiet hours saved")} className="min-h-10 px-2 rounded-xl border border-line bg-bg text-sm" /></label>
        <div className="flex justify-between items-center min-h-12 gap-3"><span className="font-semibold text-sm">Weekly review</span><span className="text-sm text-muted">{p.weeklyDay} 6:00 pm</span></div>
      </div>

      <p className="text-xs text-muted">
        Standing rules: one morning summary, not a stream; the same fact never pushed twice; everything pushed is also on Today; the household TV never notifies; safety and system-red ignore quiet hours. Inside the dashboard there are no popups; a count on the More tab is the only in-app signal. Y/N confirmations arrive in the assistant&apos;s <Link href="/messages" className="text-accent font-semibold">Messages</Link> thread.
        {p.updatedAt ? ` Last changed by ${p.updatedBy} · ${new Date(p.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : " Defaults; not changed yet."}
      </p>
      <Toast toast={toast} onDone={clear} />
    </>
  );
}
