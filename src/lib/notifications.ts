// F23 notification preferences (client-safe). Stored in localStorage now; part of person_settings.notification_prefs later.
export type Channel = "push" | "messages" | "today";
export type NotifType = { id: string; label: string; note: string; def: Channel };
export const NOTIF_TYPES: NotifType[] = [
  { id: "morning", label: "Morning summary", note: "One per person, at your morning time", def: "push" },
  { id: "confirm", label: "Y/N confirmations", note: "Answered by replying", def: "messages" },
  { id: "receipt", label: "Receipt nudge", note: "After a store; tap opens the camera", def: "push" },
  { id: "needed", label: "Needed-today record", note: "Check-in, appointment, return window; the morning of", def: "push" },
  { id: "money", label: "Money threshold", note: "Immediately", def: "push" },
  { id: "sitter", label: "Sitter night", note: "At your leave-by time; tap opens the sitter sheet", def: "push" },
  { id: "safety", label: "Safety", note: "Immediately", def: "push" },
  { id: "system", label: "System red", note: "Immediately", def: "push" },
  { id: "other", label: "Everything else", note: "Quietly on Today", def: "today" },
];
export const CHANNELS: { id: Channel; label: string }[] = [{ id: "push", label: "Push" }, { id: "messages", label: "Messages" }, { id: "today", label: "Today only" }];
export type NotifPrefs = { matrix: Record<string, Channel>; quietStart: string; quietEnd: string; morningTime: string; weeklyDay: string; weeklyTime: string; updatedBy?: string; updatedAt?: string };
export const NOTIF_KEY = "fd.notifications.v1";
export const DEFAULT_PREFS: NotifPrefs = { matrix: Object.fromEntries(NOTIF_TYPES.map((t) => [t.id, t.def])), quietStart: "21:00", quietEnd: "07:00", morningTime: "07:00", weeklyDay: "Sunday", weeklyTime: "18:00" };
export function loadPrefs(): NotifPrefs { try { const r = localStorage.getItem(NOTIF_KEY); if (r) return { ...DEFAULT_PREFS, ...JSON.parse(r) }; } catch {} return DEFAULT_PREFS; }
export function savePrefs(p: NotifPrefs) { try { localStorage.setItem(NOTIF_KEY, JSON.stringify(p)); } catch {} }
export function urlBase64ToUint8Array(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4); const base = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out;
}
