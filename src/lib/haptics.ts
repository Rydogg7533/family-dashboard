// Client-safe. A light "tick" for the contacts index, like Apple Contacts.
// Android Chrome: navigator.vibrate. iPhone Safari has no vibrate API; the only web route is toggling a hidden
// <input type="checkbox" switch> (iOS 17.4+ gives a small haptic when a switch changes). That is a workaround, not a
// documented feature: it may not tick inside a Home Screen app or while a finger is moving, and it can stop working in a
// future iOS. Both calls are wrapped so nothing breaks where they do nothing.
export function tick(switchLabel: HTMLLabelElement | null) {
  try { navigator.vibrate?.(5); } catch { /* not supported */ }
  try { switchLabel?.click(); } catch { /* nothing to do */ }
}
