// Client-safe: the connections a person sets up, in the order the Today set-up cards offer them (onboarding Stage 4).
export const STEPS = ["push", "mail", "calendar", "location", "contacts"] as const;
export type StepKey = (typeof STEPS)[number];
export type ConnState = "connected" | "todo" | "needs" | "off";
export type Conn = { step: StepKey; label: string; state: ConnState; detail: string; href: string; help?: string };

export const STEP_LABEL: Record<StepKey, string> = { push: "Notifications", mail: "Mail", calendar: "Calendar", location: "Location (Overland)", contacts: "Contacts" };
export const STEP_HREF: Record<StepKey, string> = { push: "/settings/notifications", mail: "/mail", calendar: "/calendar", location: "/settings/location", contacts: "/settings/contacts" };
export const STEP_PITCH: Record<StepKey, string> = {
  push: "Allow notifications on this phone so alerts reach you.",
  mail: "Connect your mail so tasks, receipts and subscriptions can be found for you.",
  calendar: "Connect the household calendar so your schedule shows here.",
  location: "Connect Overland so your Day page can fill in the gaps. Takes about 3 minutes.",
  contacts: "Choose where your contacts live (Apple or Google).",
};

export const isStep = (s: string): s is StepKey => (STEPS as readonly string[]).includes(s);
