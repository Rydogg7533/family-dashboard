// Browser side of voice on the Ask box (D14). Ported from MedRepDesk's useVoiceAgent: a WebRTC call to
// OpenAI Realtime with a data channel for events. The one difference that matters: the model has a single
// tool, ask(text), and this file answers it by handing the text to whoever owns the thread (AskChat), which
// runs the normal askAction. Nothing here touches records.
//
// Event names: the GA API renamed the assistant transcript events (response.output_audio_transcript.*);
// the older names are handled too, so a model pin in either generation works.

export type VoiceStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";
export type VoiceEvents = {
  onStatus: (s: VoiceStatus) => void;
  onUser: (text: string) => void;                 // what the person said (final transcript)
  onAssistant: (text: string) => void;            // what the voice said (final)
  onAsk: (text: string) => Promise<string>;       // the tool: returns the sentence to speak
  onError: (message: string) => void;
};

export class VoiceSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private startedAt = 0;
  private closed = false;
  constructor(private ev: VoiceEvents) {}

  async connect(voice?: string) {
    this.ev.onStatus("connecting");
    try {
      const tok = await fetch("/api/voice/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voice }) });
      if (!tok.ok) { const j = await tok.json().catch(() => ({})); throw new Error(j.error ?? `Voice session failed (${tok.status}).`); }
      const { value, model } = (await tok.json()) as { value: string; model: string };

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const pc = new RTCPeerConnection();
      this.pc = pc;
      this.stream.getTracks().forEach((t) => pc.addTrack(t, this.stream!));
      pc.ontrack = (e) => { const a = new Audio(); a.srcObject = e.streams[0]; a.autoplay = true; a.play().catch(() => {}); this.audio = a; };

      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.onopen = () => { this.startedAt = Date.now(); this.ev.onStatus("listening"); };
      dc.onclose = () => { if (!this.closed) this.ev.onStatus("idle"); };
      dc.onmessage = (m) => { try { void this.handle(JSON.parse(m.data)); } catch { /* ignore */ } };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdp = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`, { method: "POST", headers: { Authorization: `Bearer ${value}`, "Content-Type": "application/sdp" }, body: offer.sdp });
      if (!sdp.ok) throw new Error("Could not reach the voice service.");
      await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
    } catch (e) {
      this.close();
      const err = e as Error & { name?: string };
      this.ev.onError(err?.name === "NotAllowedError" ? "Microphone access was denied. Allow it in the browser settings." : err?.name === "NotFoundError" ? "No microphone found." : err?.message || "Voice did not start.");
      this.ev.onStatus("error");
    }
  }

  private send(obj: unknown) { if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(obj)); }

  private async handle(msg: { type: string; transcript?: string; call_id?: string; name?: string; arguments?: string; error?: { message?: string } }) {
    switch (msg.type) {
      case "input_audio_buffer.speech_started": this.ev.onStatus("listening"); break;
      case "input_audio_buffer.speech_stopped": this.ev.onStatus("thinking"); break;
      case "conversation.item.input_audio_transcription.completed": { const t = msg.transcript?.trim(); if (t) this.ev.onUser(t); break; }
      case "response.output_audio.delta": case "response.audio.delta": this.ev.onStatus("speaking"); break;
      case "response.output_audio_transcript.done": case "response.audio_transcript.done": { const t = msg.transcript?.trim(); if (t) this.ev.onAssistant(t); break; }
      case "response.done": this.ev.onStatus("listening"); break;
      case "response.function_call_arguments.done": {
        if (msg.name !== "ask") break;
        let text = "";
        try { text = String((JSON.parse(msg.arguments ?? "{}") as { text?: string }).text ?? ""); } catch { /* empty */ }
        this.ev.onStatus("thinking");
        const reply = await this.ev.onAsk(text).catch((e: Error) => `That did not work: ${e.message}`);
        this.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: msg.call_id, output: JSON.stringify({ say: reply }) } });
        this.send({ type: "response.create" });
        break;
      }
      case "error": this.ev.onError(msg.error?.message ?? "Voice session error."); break;
      default: break;
    }
  }

  /** Seconds the call lasted, for the usage line. */
  close(): number {
    this.closed = true;
    const secs = this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0;
    try { this.dc?.close(); } catch { /* ignore */ }
    try { this.pc?.close(); } catch { /* ignore */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null; }
    this.dc = null; this.pc = null; this.stream = null; this.audio = null; this.startedAt = 0;
    return secs;
  }
}
