"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { applyAppearance, DEFAULT_APPEARANCE, loadAppearance, saveAppearance, type Appearance } from "@/lib/appearance";

const Ctx = createContext<{ a: Appearance; set: (p: Partial<Appearance>) => void; reset: () => void }>({ a: DEFAULT_APPEARANCE, set: () => {}, reset: () => {} });

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [a, setA] = useState<Appearance>(DEFAULT_APPEARANCE);
  useEffect(() => { const l = loadAppearance(); setA(l); applyAppearance(l); }, []);
  const set = (p: Partial<Appearance>) => setA((prev) => { const n = { ...prev, ...p }; saveAppearance(n); applyAppearance(n); return n; });
  const reset = () => { setA(DEFAULT_APPEARANCE); saveAppearance(DEFAULT_APPEARANCE); applyAppearance(DEFAULT_APPEARANCE); };
  return <Ctx.Provider value={{ a, set, reset }}>{children}</Ctx.Provider>;
}
export const useAppearance = () => useContext(Ctx);
