"use client";
import { useMemo, useRef, useState } from "react";
import { savePreonboardAnswer, savePreonboardEmail, finishPreonboard, resendOnboardingEmail } from "@/app/preonboard/[token]/actions";
import { SECTIONS, progress, type Answers } from "@/lib/preonboard-shared";
import { WALKTHROUGH_STEPS } from "@/lib/preonboard-walkthrough";

const card = "rounded-2xl border border-line bg-card p-4";
const btn = "min-h-11 px-4 rounded-xl text-sm font-semibold disabled:opacity-50";
const input = "w-full min-h-10 px-3 rounded-xl border border-line bg-bg text-sm";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function PreonboardApp({ token, initialAnswers, initialCompleted, initialEmail, initialSentAt }: { token: string; initialAnswers: Answers; initialCompleted: boolean; initialEmail: string; initialSentAt: string | null }) {
  const [tab, setTab] = useState<"checklist" | "walkthrough">("checklist");
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [completed, setCompleted] = useState(initialCompleted);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState(initialEmail);
  const [emailSaving, setEmailSaving] = useState(false);
  const [sentEmail, setSentEmail] = useState(initialEmail);
  const [sentAt, setSentAt] = useState<string | null>(initialSentAt);
  const [finishErr, setFinishErr] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendErr, setResendErr] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const prog = useMemo(() => progress(answers), [answers]);
  const emailValid = EMAIL_RE.test(email.trim());

  const persist = (key: string, checked: boolean, value?: string) => {
    setSaving((s) => new Set(s).add(key));
    savePreonboardAnswer(token, key, checked, value).finally(() => setSaving((s) => { const n = new Set(s); n.delete(key); return n; }));
  };

  const toggle = (key: string) => {
    const was = answers[key];
    const next: Answers = { ...answers, [key]: { checked: !was?.checked, value: was?.value, updatedAt: new Date().toISOString() } };
    setAnswers(next);
    persist(key, !was?.checked, was?.value);
  };

  const setValue = (key: string, value: string) => {
    const was = answers[key];
    const next: Answers = { ...answers, [key]: { checked: was?.checked ?? false, value, updatedAt: new Date().toISOString() } };
    setAnswers(next);
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => persist(key, next[key].checked, value), 500);
  };

  const onEmailChange = (value: string) => {
    setEmail(value);
    clearTimeout(timers.current.__email);
    timers.current.__email = setTimeout(() => {
      setEmailSaving(true);
      savePreonboardEmail(token, value).finally(() => setEmailSaving(false));
    }, 500);
  };

  const finish = () => {
    setFinishErr(null);
    setFinishing(true);
    finishPreonboard(token).then((r) => {
      setFinishing(false);
      if (!r.ok) { setFinishErr(r.error ?? "That didn't work."); return; }
      setCompleted(true);
      setSentEmail(r.email ?? email);
      setSentAt(r.sentAt ?? new Date().toISOString());
    });
  };

  const resend = () => {
    setResendErr(null);
    setResending(true);
    resendOnboardingEmail(token).then((r) => {
      setResending(false);
      if (!r.ok) { setResendErr(r.error ?? "That didn't work."); return; }
      setSentAt(r.sentAt ?? new Date().toISOString());
    });
  };

  if (completed) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 flex flex-col gap-3 text-center">
        <h1 className="text-2xl font-semibold">You&apos;re ready</h1>
        <p className="text-muted">Thanks — you&apos;ve checked off everything on the pre-onboarding list. We&apos;ll follow up to schedule your setup call.</p>
        <div className={`${card} text-left text-sm mx-auto w-full`}>
          <div className="text-muted text-xs">Onboarding link sent to</div>
          <div className="font-semibold">{sentEmail || "(no email on file)"}</div>
          {sentAt && <div className="text-muted text-xs mt-1">Sent {relTime(sentAt)}</div>}
          <button type="button" disabled={resending || !sentEmail} className={`${btn} bg-soft mt-3`} onClick={resend}>{resending ? "Sending…" : "Resend onboarding email"}</button>
          {resendErr && <div role="alert" className="text-red text-xs mt-2">{resendErr}</div>}
        </div>
        <button type="button" className={`${btn} bg-soft self-center`} onClick={() => setCompleted(false)}>Go back and review</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Getting ready for StewardOS</h1>
        <p className="text-muted text-sm mt-1">Work through this at your own pace — it saves automatically, so you can close this and come back later on any device.</p>
      </div>

      <div className="flex gap-2 border-b border-line">
        <button type="button" onClick={() => setTab("checklist")} className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === "checklist" ? "border-accent text-accent" : "border-transparent text-muted"}`}>Checklist</button>
        <button type="button" onClick={() => setTab("walkthrough")} className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === "walkthrough" ? "border-accent text-accent" : "border-transparent text-muted"}`}>Walkthrough &amp; screenshots</button>
      </div>

      {tab === "checklist" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-soft overflow-hidden"><div className="h-full bg-accent" style={{ width: `${Math.round((prog.done / prog.total) * 100)}%` }} /></div>
            <div className="text-xs text-muted shrink-0">{prog.done}/{prog.total}</div>
          </div>
          <div className={card}>
            <div className="font-semibold">Your email</div>
            <div className="text-xs text-muted mt-1">We&apos;ll send your onboarding link here once everything&apos;s checked off.</div>
            <input className={`${input} mt-2`} type="email" placeholder="you@example.com" value={email} onChange={(e) => onEmailChange(e.target.value)} />
            {emailSaving && <div className="text-xs text-muted mt-1">saving…</div>}
          </div>
          {SECTIONS.map((sec) => (
            <div key={sec.id} className={card}>
              <div className="font-semibold">{sec.title}</div>
              {sec.intro && <div className="text-xs text-muted mt-1">{sec.intro}</div>}
              <div className="flex flex-col gap-3 mt-3">
                {sec.items.map((it) => {
                  const a = answers[it.key];
                  return (
                    <div key={it.key} className="flex flex-col gap-1.5">
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-0.5 w-5 h-5" checked={!!a?.checked} onChange={() => toggle(it.key)} />
                        <span>{it.label}{saving.has(it.key) && <span className="text-muted text-xs ml-1">saving…</span>}</span>
                      </label>
                      {it.helper && <div className="text-xs text-muted pl-7">{it.helper}</div>}
                      {it.kind === "check_text" && (
                        <input className={`${input} ml-7`} placeholder={it.placeholder} value={a?.value ?? ""} onChange={(e) => setValue(it.key, e.target.value)} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <button type="button" disabled={!prog.ready || !emailValid || finishing} className={`${btn} bg-accent text-white self-start`} onClick={finish}>
            {finishing ? "Sending your link…" : prog.ready ? (emailValid ? "I'm ready — send me the link" : "Add your email above first") : `Finish the checklist first (${prog.done}/${prog.total})`}
          </button>
          {finishErr && <div role="alert" className="rounded-xl bg-red-bg text-red px-3 py-2 font-semibold text-sm">{finishErr}</div>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {WALKTHROUGH_STEPS.map((s, i) => (
            <div key={s.id} className={card}>
              <div className="font-semibold">{i + 1}. {s.title}</div>
              <p className="text-sm text-muted mt-1 whitespace-pre-line">{s.body}</p>
              <Screenshot file={s.screenshot} alt={s.screenshotAlt} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Screenshot({ file, alt }: { file: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return <div className="mt-3 rounded-xl border border-dashed border-line bg-soft/40 aspect-video flex items-center justify-center text-xs text-muted px-4 text-center">Screenshot coming soon — {alt}</div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/preonboard-assets/${file}`} alt={alt} className="mt-3 rounded-xl border border-line w-full" onError={() => setBroken(true)} />;
}
