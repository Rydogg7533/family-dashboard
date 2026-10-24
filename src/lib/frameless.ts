// Pages that show without the app frame (top bar, tab bar, + button): the signed-out and first-run screens, the display modes and the legal pages.
const match = (list: string[], path: string) => list.some((p) => path === p || path.startsWith(p + "/"));
const AUTH = ["/login", "/setup", "/forgot-password", "/reset-password", "/auth", "/join"];
export const isAuthScreen = (path: string) => match(AUTH, path);
export const isFrameless = (path: string) => match([...AUTH, "/tv", "/kid", "/preonboard"], path) || path === "/privacy" || path === "/terms" || path === "/sitter" || path === "/sitter/pair";
