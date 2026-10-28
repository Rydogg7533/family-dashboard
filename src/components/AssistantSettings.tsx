"use client";
import { useState } from "react";
import { saveAssistantPrefs, type AssistantPrefs } from "@/app/settings/assistant/actions";

// Settings › Assistant: this person's own choices (D7 app, D14 voice, D15 wake word). Each field saves on its
// own; nothing here changes anyone else.
const APPS: { id: string; label: string }[] = [
  { id: "claude", label: "Claude" }, { id: "chatgpt", label: "ChatGPT" }, { id: "gemini", label: "Gemini" }, { id: "other", label: "Other" }, { id: "none", label: "None" },
];
const VOICES = ["marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"];

export function AssistantSettings({ initial }: { initial: AssistantPrefs }) {
  const [p, setP] = useState<AssistantPrefs>(initial);
  const [note, setNote] = useState<string | null>(null);
  async function save(patch: Partial<AssistantPrefs>, what: string) {
    const next = { ...p, ...patch }; setP(next);
    const r = await saveAssistantPrefs(patch);
    setNote(r.ok ? `${what} saved` : r.error ?? "Could not save");
    setTimeout(() => setNote(null), 3000);
  }
  const field = "w-full min-h-10 px-3 rounded-xl border border-line bg-bg text-sm";

  return (
    <div className="flex flex-col gap-4">
      <section className="card">
        <h2 className="font-semibold mb-1">Talking to Ask</h2>
        <p className="text-xs text-muted mb-3">Tap the mic on the Ask box to talk. While a voice session is open, the audio goes to OpenAI, which does the listening and speaking; the answers still come from this household&apos;s own assistant and nothing from your records is sent. A session ends by itself after 20 seconds of quiet, at five minutes, when you leave the app, or when you say &ldquo;bye&rdquo;.</p>
        <label className="flex items-center justify-between gap-3 min-h-11">
          <span className="text-sm">Show the mic on Ask</span>
          <input type="checkbox" checked={p.voice_enabled} onChange={(e) => save({ voice_enabled: e.target.checked }, "Voice")} className="w-5 h-5 accent-[var(--accent)]" />
        </label>
        <label className="block mt-2">
          <span className="text-xs text-muted">Voice</span>
          <select value={p.voice_name ?? ""} onChange={(e) => save({ voice_name: e.target.value || null }, "Voice")} className={field}>
            <option value="">Default</option>
            {VOICES.map((v) => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
          </select>
        </label>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-1">Your wake word</h2>
        <p className="text-xs text-muted mb-2">The name you will say to start talking without tapping, on a device that is listening for it (the kitchen tablet or the Mac mini). Two syllables or more, not an everyday word. Saved now; the listener is coming.</p>
        <input value={p.wake_word ?? ""} onChange={(e) => setP({ ...p, wake_word: e.target.value })} onBlur={() => save({ wake_word: p.wake_word }, "Wake word")} placeholder="e.g. Steward" className={field} aria-label="Wake word" />
      </section>

      <section className="card">
        <h2 className="font-semibold mb-1">For questions outside the family</h2>
        <p className="text-xs text-muted mb-2">Ask answers only what touches the family&apos;s records. Anything else gets a button that opens the assistant you already use, with your question carried over.</p>
        <div className="flex flex-wrap gap-2">
          {APPS.map((a) => (
            <button key={a.id} type="button" onClick={() => save({ assistant_app: a.id }, "Assistant app")}
              className={`min-h-10 px-4 rounded-full border text-sm font-semibold ${p.assistant_app === a.id ? "bg-accent text-white border-accent" : "border-line"}`}>{a.label}</button>
          ))}
        </div>
        {p.assistant_app === "other" && (
          <label className="block mt-3">
            <span className="text-xs text-muted">Link that opens it with the question, {"{q}"} where the question goes</span>
            <input value={p.assistant_url ?? ""} onChange={(e) => setP({ ...p, assistant_url: e.target.value })} onBlur={() => save({ assistant_url: p.assistant_url }, "Link")} placeholder="https://…?q={q}" inputMode="url" className={field} aria-label="Assistant link" />
          </label>
        )}
      </section>

      {note && <div className="text-xs font-semibold text-green px-1">{note}</div>}
    </div>
  );
}
