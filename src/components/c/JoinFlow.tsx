"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PinPad } from "@/components/c/PinPad";
import { acceptInvite } from "@/app/join/[token]/actions";

// Four short screens: hello, pick a PIN (twice), what your page does, what parents can see. Then straight to the kid page.
export function JoinFlow({ token, name }: { token: string; name: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pin, setPin] = useState(""); const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const next = "min-h-12 rounded-xl bg-accent text-white font-semibold text-base w-full";
  const wrap = (c: React.ReactNode) => <div className="pt-12 flex flex-col gap-5 max-w-sm mx-auto">{c}</div>;
  if (step === 0) return wrap(<>
    <h1 className="text-3xl">Hi {name}!</h1>
    <p className="text-base">This is your own page in the family app. It shows your day, your lists and your jobs. A parent set it up for you.</p>
    <p className="text-base">First, pick a secret 6-number code. That’s how you’ll sign in.</p>
    <button className={next} onClick={() => setStep(1)}>Pick my code</button>
  </>);
  if (step === 1) return wrap(<>
    <h1 className="text-2xl">Pick your code</h1>
    <p className="text-sm text-muted">6 numbers. Not your birthday, and not 123456.</p>
    <PinPad value={pin} onChange={setPin} />
    <button className={next} disabled={pin.length < 6} onClick={() => { setAgain(""); setErr(null); setStep(2); }}>Next</button>
  </>);
  if (step === 2) return wrap(<>
    <h1 className="text-2xl">Type it again</h1>
    <p className="text-sm text-muted">So we know you remember it.</p>
    <PinPad value={again} onChange={setAgain} disabled={busy} />
    {err && <div className="text-red text-sm font-semibold">{err}</div>}
    <button className={next} disabled={busy || again.length < 6} onClick={async () => {
      if (again !== pin) { setErr("Those don’t match. Try again."); setAgain(""); return; }
      setBusy(true); setErr(null);
      const r = await acceptInvite(token, pin); setBusy(false);
      if (!r.ok) { setErr(r.error); setAgain(""); if (/easy|6 digits/.test(r.error)) { setPin(""); setStep(1); } return; }
      setStep(3);
    }}>{busy ? "Setting up…" : "Save my code"}</button>
    <button className="text-sm font-semibold text-muted min-h-10" onClick={() => { setPin(""); setAgain(""); setStep(1); }}>Start over</button>
  </>);
  if (step === 3) return wrap(<>
    <h1 className="text-2xl">You’re in</h1>
    <ul className="text-base flex flex-col gap-2 list-disc pl-5">
      <li><b>Today</b> shows what’s happening and what to bring.</li>
      <li><b>Lists</b> help you pack and get ready.</li>
      <li><b>Jobs</b> are things you can do to help out.</li>
    </ul>
    <p className="text-sm text-muted">More things unlock as you get older, or when a parent turns them on.</p>
    <button className={next} onClick={() => setStep(4)}>Next</button>
  </>);
  return wrap(<>
    <h1 className="text-2xl">One more thing</h1>
    <p className="text-base">Your parents can see what’s on your page and what you’ve ticked off. If you ever share your location, you’ll always be able to see it too. Nobody outside the family can see any of it.</p>
    <p className="text-base">Keep your code to yourself. If you forget it, a parent can make you a new one.</p>
    <button className={next} onClick={() => { router.replace("/kid"); router.refresh(); }}>Go to my page</button>
  </>);
}
