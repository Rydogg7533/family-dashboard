"use client";
// Tier 1 toast: "Saved · Undo". Pass a message and an undo handler; it hides itself.
import { useEffect, useState } from "react";

export type ToastState = { id: number; text: string; undo?: () => void } | null;

export function Toast({ toast, onDone }: { toast: ToastState; onDone: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) { setVisible(false); return; }
    setVisible(true);
    const t = setTimeout(() => { setVisible(false); onDone(); }, 5000);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  if (!toast || !visible) return null;
  return (
    <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-[calc(96px+env(safe-area-inset-bottom))] z-50 max-w-[calc(100%-40px)] flex items-center gap-3 rounded-full bg-fg text-bg px-4 py-2.5 text-sm font-semibold shadow-lg">
      <span className="truncate">{toast.text}</span>
      {toast.undo && <button className="text-accent underline-offset-2 underline shrink-0" onClick={() => { toast.undo?.(); setVisible(false); onDone(); }}>Undo</button>}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const show = (text: string, undo?: () => void) => setToast({ id: Date.now(), text, undo });
  const clear = () => setToast(null);
  return { toast, show, clear };
}
