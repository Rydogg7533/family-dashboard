// Pre-onboarding checklist content: what a prospective household needs ready before they start the real
// setup wizard. Pulled from stewardos-requirements.md and the Stage 0/1 account-creation steps in
// stewardos-onboarding.md. Client-safe (no server imports) so both the public checklist and the walkthrough
// tab can import it directly.

export type ItemKind = "check" | "check_text";
export type ChecklistItem = {
  key: string;
  label: string;
  kind: ItemKind;
  placeholder?: string;      // for check_text: what to type (e.g. "e.g. Mac mini M2, 2023")
  helper?: string;           // one line shown under the item
};
export type ChecklistSection = { id: string; title: string; intro?: string; items: ChecklistItem[] };

export const SECTIONS: ChecklistSection[] = [
  {
    id: "hub",
    title: "The hub (your Mac)",
    intro: "StewardOS runs on an Apple Silicon Mac that stays on. A Mac mini works well; a MacBook works if it stays open and plugged in.",
    items: [
      { key: "hub_model", kind: "check_text", label: "I have an Apple Silicon Mac (M1 or later, 2020+)", placeholder: "e.g. Mac mini M2, 2023", helper: "Apple menu › About This Mac shows the chip and year." },
      { key: "hub_macos", kind: "check_text", label: "It's running macOS 14 (Sonoma) or newer", placeholder: "e.g. macOS 15.1", helper: "Apple menu › About This Mac shows the version." },
      { key: "hub_space", kind: "check", label: "It has at least 40 GB of free disk space" },
      { key: "hub_always_on", kind: "check", label: "It can stay powered on and awake (sleep off, auto-restart after a power failure on)", helper: "System Settings › Energy / Battery." },
    ],
  },
  {
    id: "phones",
    title: "Phones",
    intro: "Both parents need an iPhone for the dashboard and push notifications.",
    items: [
      { key: "phone_count", kind: "check", label: "Both parents have an iPhone" },
      { key: "phone_ios", kind: "check_text", label: "Both are on iOS 16.4 or newer", placeholder: "e.g. 18.1 and 18.1", helper: "Settings › General › About on each phone." },
    ],
  },
  {
    id: "accounts",
    title: "Accounts to create (free, a few minutes each)",
    intro: "These are your own accounts, in your own name. StewardOS never sees what's in them.",
    items: [
      { key: "acct_github", kind: "check", label: "GitHub account created", helper: "Free. Holds your own private copy of the code." },
      { key: "acct_supabase", kind: "check", label: "Supabase account created", helper: "Free tier. This is your database." },
      { key: "acct_vercel", kind: "check", label: "Vercel account created (sign in with GitHub)", helper: "Free tier. This is where your dashboard is hosted." },
      { key: "acct_anthropic", kind: "check", label: "Anthropic Console account created, with a card on file and a spend limit you're comfortable with", helper: "Expect roughly $10–40/month depending on use." },
      { key: "acct_google", kind: "check", label: "A Google account (Gmail + Calendar) you can set up — a personal account, or a Workspace account you admin", helper: "This step happens after your dashboard is live, but having the account ready saves time." },
    ],
  },
  {
    id: "household",
    title: "Household basics",
    items: [
      { key: "hh_parents", kind: "check_text", label: "Both parents' names and emails", placeholder: "e.g. Ryan ryan@..., Melissa melissa@...", helper: "Used for the two logins." },
      { key: "hh_kids", kind: "check_text", label: "Children's names and birth years (optional)", placeholder: "e.g. Ava 2019, Noah 2021" },
      { key: "hh_tz", kind: "check_text", label: "Your time zone", placeholder: "e.g. America/Denver" },
    ],
  },
  {
    id: "readiness",
    title: "Readiness",
    intro: "StewardOS is self-hosted: everything runs in accounts you own, and the setup wizard walks you through each click.",
    items: [
      { key: "ready_terminal", kind: "check", label: "I'm willing to paste a line of text into the Mac's Terminal app when the wizard asks" },
      { key: "ready_selfhosted", kind: "check", label: "I understand this runs in my own accounts, not a shared service — and I'm fine paying the small monthly cost of those accounts" },
      { key: "ready_time", kind: "check", label: "I can set aside about 60–90 minutes in one sitting to finish the first stage of setup" },
    ],
  },
];

export const ALL_KEYS: string[] = SECTIONS.flatMap((s) => s.items.map((i) => i.key));

export type Answer = { checked: boolean; value?: string; updatedAt: string };
export type Answers = Record<string, Answer>;

export function progress(answers: Answers): { done: number; total: number; ready: boolean } {
  const total = ALL_KEYS.length;
  const done = ALL_KEYS.filter((k) => answers[k]?.checked).length;
  return { done, total, ready: done === total };
}
