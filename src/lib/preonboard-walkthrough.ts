// Instructions + screenshot slots for the "Walkthrough" tab. Each screenshot references a static file under
// /public/preonboard-assets/<file>; until Ryan adds the real image, PreonboardWalkthrough shows a labeled
// placeholder box instead of a broken image. See claude/stewardos-preonboard-screenshot-list-2026-10-24.md
// for exactly what to capture for each one.

export type WalkthroughStep = {
  id: string;
  title: string;
  body: string;          // plain instructions, one or two short paragraphs
  screenshot: string;     // filename under /preonboard-assets/
  screenshotAlt: string;
  relatesTo: string[];    // checklist item keys this step helps with
};

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: "mac-check",
    title: "Check your Mac",
    body: "Click the Apple logo in the top-left corner, then \"About This Mac.\" You'll see the chip (needs to say Apple M1, M2, M3, or M4 — not \"Intel\") and the macOS version (needs to be 14 or higher, named Sonoma or newer).",
    screenshot: "hub-about-this-mac.png",
    screenshotAlt: "The About This Mac window showing the chip name and macOS version",
    relatesTo: ["hub_model", "hub_macos"],
  },
  {
    id: "mac-storage",
    title: "Check free disk space",
    body: "In the same About This Mac window, click \"Storage.\" Make sure at least 40 GB shows as available.",
    screenshot: "hub-disk-space.png",
    screenshotAlt: "The Storage tab showing used and available space",
    relatesTo: ["hub_space"],
  },
  {
    id: "mac-energy",
    title: "Keep the Mac awake",
    body: "Open System Settings › Energy (or Battery on a laptop). Turn off \"Prevent automatic sleeping\" issues by setting sleep to Never, and turn on \"Start up automatically after a power failure.\" This keeps your dashboard's background jobs running.",
    screenshot: "hub-energy-settings.png",
    screenshotAlt: "The Energy settings panel with sleep disabled and auto-restart enabled",
    relatesTo: ["hub_always_on"],
  },
  {
    id: "phone-ios",
    title: "Check each iPhone's iOS version",
    body: "On each phone: Settings › General › About. Look for the \"Software Version\" line — it needs to read 16.4 or higher.",
    screenshot: "phone-ios-version.png",
    screenshotAlt: "iPhone Settings > General > About showing the Software Version line",
    relatesTo: ["phone_ios", "phone_count"],
  },
  {
    id: "github",
    title: "Create a free GitHub account",
    body: "Go to github.com/signup and create a free account. You'll use this later to hold your own private copy of the StewardOS code.",
    screenshot: "github-signup.png",
    screenshotAlt: "The GitHub sign-up page",
    relatesTo: ["acct_github"],
  },
  {
    id: "supabase",
    title: "Create a free Supabase account",
    body: "Go to supabase.com and sign up (GitHub sign-in is fine). This becomes your own private database — nobody else, including us, can see what's in it.",
    screenshot: "supabase-signup.png",
    screenshotAlt: "The Supabase sign-up / new project page",
    relatesTo: ["acct_supabase"],
  },
  {
    id: "vercel",
    title: "Create a free Vercel account",
    body: "Go to vercel.com and choose \"Continue with GitHub\" using the account you just made. This is where your dashboard actually runs.",
    screenshot: "vercel-signup.png",
    screenshotAlt: "The Vercel sign-in page with Continue with GitHub",
    relatesTo: ["acct_vercel"],
  },
  {
    id: "anthropic",
    title: "Create an Anthropic Console account and set a spend limit",
    body: "Go to console.anthropic.com, create an account, add a card under Billing, and set a monthly spend limit you're comfortable with. This powers the assistant's answers; most households spend $10–40/month.",
    screenshot: "anthropic-console-billing.png",
    screenshotAlt: "The Anthropic Console billing page with a spend limit set",
    relatesTo: ["acct_anthropic"],
  },
  {
    id: "google",
    title: "Have a Google account ready",
    body: "Any Gmail account works, or a Workspace account you administer. You don't need to connect it yet — that happens after your dashboard is live — just make sure you can sign into one.",
    screenshot: "google-account-check.png",
    screenshotAlt: "myaccount.google.com showing a signed-in Google account",
    relatesTo: ["acct_google"],
  },
];
