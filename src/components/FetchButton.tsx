"use client";
import { useEffect, useRef, useState } from "react";
import { requestFetch, fetchStatus } from "@/app/fetch/actions";

// A file that lives only on the hub. One tap asks the hub for a copy; the button shows where it is in the
// pull (waiting, hub has it, ready) and becomes Open when the copy lands. About a minute, usually less.
export function FetchButton({ path, register, refId }: { path: string; register: string; refId: string }) {
  const [state, setState] = useState<"idle" | "asking" | "waiting" | "picked" | "ready" | "error">("idle");
  const [id, setId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const poll = async (rid: string, n: number) => {
    const s = await fetchStatus(rid);
    if (s.state === "ready") { setState("ready"); return; }
    if (s.state === "error") { setState("error"); setErr(s.error ?? "The hub could not fetch it."); return; }
    setState(s.state);
    if (n >= 40) { setState("error"); setErr("The hub has not answered in two minutes. It may be asleep or offline; try again later."); return; }
    timer.current = window.setTimeout(() => void poll(rid, n + 1), 3000);
  };

  const start = async () => {
    setState("asking"); setErr(null);
    const r = await requestFetch(path, register, refId);
    if (!r.ok) { setState("error"); setErr(r.error); return; }
    setId(r.id);
    if (r.reused) { setState("ready"); return; }
    setState("waiting");
    timer.current = window.setTimeout(() => void poll(r.id, 0), 2000);
  };

  if (state === "ready" && id) return <a href={`/api/fetch/${id}`} target="_blank" rel="noopener" className="shrink-0 min-h-9 px-3 rounded-full bg-accent text-white text-xs font-semibold inline-flex items-center">Open</a>;
  if (state === "error") return <button type="button" onClick={start} title={err ?? ""} className="shrink-0 min-h-9 px-3 rounded-full border border-red text-red text-xs font-semibold inline-flex items-center">Retry</button>;
  if (state !== "idle") return <span className="shrink-0 min-h-9 px-3 rounded-full bg-soft text-muted text-xs font-semibold inline-flex items-center">{state === "picked" ? "Hub has it…" : "Fetching…"}</span>;
  return <button type="button" onClick={start} className="shrink-0 min-h-9 px-3 rounded-full border border-line text-xs font-semibold inline-flex items-center">Fetch from hub</button>;
}
