// The one record of who reads a file when "AI" reads it (Ryan, 2026-10-30). Client-safe: no server imports.
// Every notice that says where a file goes takes the company from here; none types a company name. ai.ts takes the endpoint from here.
// "cloud" = the file is sent to the company below. "local" = a model on the Mac mini reads it and no AI company receives it.
// Region or country is deliberately absent: it is shown only if a person sets one, never claimed.
export type Runtime = "cloud" | "local";
export const AI_PROVIDER: { company: string; runtime: Runtime; endpoint: string } = {
  company: "Anthropic",
  runtime: "cloud",
  endpoint: "https://api.anthropic.com",
};

// "sent to Anthropic" for a cloud provider; "read on your Mac" for a local one.
export const sentTo = (p = AI_PROVIDER) => (p.runtime === "local" ? "read on your Mac" : `sent to ${p.company}`);
// The short privacy line that sits under an AI upload. A local provider has no warning to give.
export function aiUploadNote(alsoSay = "", p = AI_PROVIDER): string {
  if (p.runtime === "local") return "Read on your Mac, then stored in your app.";
  return `Read by AI (the file is ${sentTo(p)}), so it is not private.${alsoSay ? ` ${alsoSay}` : ""}`;
}
