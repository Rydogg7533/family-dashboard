// Pages that show without the app frame (top bar, tab bar, + button): the signed-out and first-run screens, the display modes and the legal pages.
const PREFIXES = ["/login", "/setup", "/forgot-password", "/reset-password", "/auth", "/tv", "/kid"];
export const isFrameless = (path: string) => PREFIXES.some((p) => path === p || path.startsWith(p + "/")) || path === "/privacy" || path === "/terms";
