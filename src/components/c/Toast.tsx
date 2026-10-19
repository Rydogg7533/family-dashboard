"use client";
import { useCallback, useEffect, useState } from "react";

// Tier-1 confirmation: saved at once, with Undo. One hook + one element per client page.
export function useToast() {
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);
  const show = useCallback((text: string, undo?: () => void) => setToast({ text, undo }), []);
  const el = toast ? (
    <div role="status" className="fixed left-0 right-0 bottom-[136px] z-40 pointer-events-none">
      <div className="max-w-md mx-auto px-5">
        <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-xl bg-fg text-bg px-4 py-3 text-sm shadow-lg">
          <span>{toast.text}</span>
          {toast.undo && <button className="font-bold min-h-8 px-2" onClick={() => { toast.undo?.(); setToast(null); }}>Undo</button>}
        </div>
      </div>
    </div>
  ) : null;
  return { show, el };
}
