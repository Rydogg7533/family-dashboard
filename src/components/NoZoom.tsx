"use client";
import { useEffect } from "react";

// This is an app, not a web page: no pinch zoom and no double-tap zoom, so the layout never shifts or slides sideways.
// iOS Safari ignores the viewport setting for pinch, so the gesture events are stopped here as well.
export function NoZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    return () => { document.removeEventListener("gesturestart", stop); document.removeEventListener("gesturechange", stop); };
  }, []);
  return null;
}
