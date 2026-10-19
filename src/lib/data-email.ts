// Email tasks (F1, F15 item 4): reply drafts live in the dashboard until every attachment is present.
// The mail draft is created only when complete (or on "Create anyway", which is logged). Nothing is sent here.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export type DraftAttachment = {
  name: string;                    // "Declarations page 2026"
  status: "attached" | "missing";
  path: string | null;             // where it was found (Organized path), never contents
  looked_in: string[];             // where Claude looked when missing
};
export type Draft = {
  id: string;
  task_id: string;
  to: string;                      // display name only
  subject: string;
  text: string;
  attachments: DraftAttachment[];
  complete: boolean;               // every attachment attached (or "create anyway" chosen)
  create_anyway: boolean;
  mail_draft_ref: string | null;   // id in the mail app once created
  requested_by: string;            // whose reply this is ("For Ryan")
  account: string;                 // which mailbox
  origin_href: string;             // "Open in Gmail" link ("#" until the mini agent writes the message URL)
  updated_at: string;
};

const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();

export const sampleDrafts: Draft[] = [
  {
    id: "d1", task_id: "t1", to: "[Insurance agent]", subject: "Re: Renewal: deductible and declarations page",
    text: "Hi [Agent],\n\nThanks for the renewal summary. Let's keep the $1,000 deductible on both vehicles as it is.\n\nThe current declarations page is attached. Let me know if you need anything else before the renewal date.\n\nThanks,\nRyan",
    attachments: [
      { name: "Declarations page (current policy)", status: "attached", path: "Organized/Personal/Documents/Vehicles/Insurance/declarations-2026.pdf", looked_in: [] },
      { name: "Sienna registration (copy)", status: "missing", path: null, looked_in: ["Organized/Personal/Documents/Vehicles", "iCloud Drive/Documents", "email attachments (90 days)", "1Password item names"] },
    ],
    complete: false, create_anyway: false, mail_draft_ref: null, requested_by: "Ryan", account: "rross15253@gmail.com", origin_href: "#", updated_at: h(2),
  },
];

export async function getDraftForTask(taskId: string): Promise<Draft | null> {
  if (!hasSupabaseEnv()) return sampleDrafts.find((d) => d.task_id === taskId) ?? null;
  const sb = await createClient();
  const { data } = await sb.from("drafts").select("*").eq("task_id", taskId).maybeSingle();
  return (data as Draft) ?? null;
}

export function draftIsComplete(d: Pick<Draft, "attachments" | "create_anyway">) {
  return d.create_anyway || d.attachments.every((a) => a.status === "attached");
}
