"use client";
import { useEffect, useLayoutEffect } from "react";

// Anything that changes what the person is about to see -- size, position, scroll -- has to run before the browser
// paints, or the first frame shows the wrong thing and the correction reads as a glitch (Ryan, 2026-10-28: the Ask
// sheet opened shaky). useLayoutEffect does that; it does not exist on the server, so it falls back to useEffect there.
export const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;
