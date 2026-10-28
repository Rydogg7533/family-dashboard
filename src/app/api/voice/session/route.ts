import { NextResponse } from "next/server";
import { toolCtx } from "@/lib/tools/run";

export const dynamic = "force-dynamic";

// Voice on the Ask box (D14, 2026-10-28). OpenAI Realtime does the listening and the talking; the household's
// assistant stays the only brain. The model here gets ONE tool, ask(transcript), which the browser answers by
// calling the same askAction that typed questions use. Every write, tier and household rule goes through the
// same loop as typing, so the eval covers voice by construction. OpenAI receives the audio of a session and the
// sentence ask() returns; never a record.
//
// This route mints a short-lived client secret for the signed-in member. The standard key stays on the server.
// Model and voice are one place to change: VOICE_MODEL and VOICE_VOICE in the environment.

export const VOICE_MODEL = process.env.VOICE_MODEL || "gpt-realtime-2.1";
const VOICE_DEFAULT = process.env.VOICE_VOICE || "marin";

const INSTRUCTIONS = `You are the voice of a family's household assistant. You do not know anything about this family yourself; the assistant does. For every question, request or answer the person gives, call the tool ask with their words exactly as they said them, and say its reply aloud as it is, with nothing added, nothing summarised and nothing invented. Do not answer from your own knowledge, do not make small talk, do not describe what you are doing, and do not offer other things you could do.

When the reply ends with "OK?", it is asking the person to agree to a change. Wait. When they answer, pass their answer to ask as well ("yes", "no", or whatever they said). When the reply says something needs the button on the screen, say so and stop.

If the person is silent, stay silent. Keep your own words to the minimum: the reply from ask is the whole answer. Speak at a natural, unhurried pace, in the language the person used.`;

export async function POST(req: Request) {
  const c = await toolCtx();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Voice is not set up on this household's server yet." }, { status: 404 });

  let voice = VOICE_DEFAULT;
  try { const b = await req.json(); if (typeof b?.voice === "string" && /^[a-z]+$/.test(b.voice)) voice = b.voice; } catch { /* no body */ }

  const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: VOICE_MODEL,
        instructions: INSTRUCTIONS,
        tools: [{
          type: "function", name: "ask",
          description: "The household assistant. Pass what the person said, word for word. Returns the sentence to say aloud.",
          parameters: { type: "object", properties: { text: { type: "string", description: "What the person said, verbatim" } }, required: ["text"] },
        }],
        tool_choice: "auto",
        audio: {
          input: { transcription: { model: "gpt-realtime-whisper" }, turn_detection: { type: "server_vad", silence_duration_ms: 700, interrupt_response: true, create_response: true } },
          output: { voice },
        },
      },
    }),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    console.error("voice session:", r.status, detail);
    return NextResponse.json({ error: "Could not start a voice session.", detail }, { status: 502 });
  }
  const data = await r.json();
  return NextResponse.json({ value: data.value, expires_at: data.expires_at, model: VOICE_MODEL, voice });
}
