// Ask, client-safe part. No server imports here (AskChat is a client component).

// The model is told to answer in a line or two. When it runs on anyway, the first two sentences stay as the
// answer and the rest sits behind a More toggle, so the thread never fills with reference text (2026-10-27).
export function splitAnswer(text: string): { head: string; more: string | null } {
  const plain = text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^\s*Source:.*$/gim, "").trim();
  const parts = plain.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/);
  if (parts.length <= 2 || plain.length <= 220) return { head: plain, more: null };
  const head = parts.slice(0, 2).join(" ");
  const more = parts.slice(2).join(" ").trim();
  return { head, more: more || null };
}
