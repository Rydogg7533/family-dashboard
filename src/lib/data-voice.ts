// Slice C data: voice agent (F21). Screens only in v1; sample calls, no platform wired.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

import type { CallStatus } from "@/lib/c-shared";
export type { CallStatus } from "@/lib/c-shared";
export { CALL_LABEL } from "@/lib/c-shared";
export type VoiceCall = {
  id: string; purpose: string; who: string; number_note: string; on_behalf_of: string; status: CallStatus;
  limits: { may_state: string[]; accept: string; max_dollars: number | null; if_asked_more: string };
  outcome: string | null; summary: string | null; duration_min: number | null; cost_note: string | null; recorded: boolean;
  requested_at: string; case_href: string | null;
};

const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();

const sampleCalls: VoiceCall[] = [
  { id: "v1", purpose: "Missing coffee from Amazon order", who: "Amazon customer service", number_note: "1-888-···-7538", on_behalf_of: "Ryan", status: "awaiting_approval",
    limits: { may_state: ["Name", "Order number", "Item and price", "Delivery date"], accept: "Refund of $[PRICE] to the card, or a replacement by Friday", max_dollars: 40, if_asked_more: "Say Ryan will call back; text Ryan the question" },
    outcome: null, summary: null, duration_min: null, cost_note: "≈ $1–2 (5–10 min)", recorded: false, requested_at: h(1), case_href: "/shop/cases" },
  { id: "v2", purpose: "Reschedule [Child 1]'s dentist cleaning", who: "[Dentist], Orem", number_note: "801-···-4410", on_behalf_of: "Melissa", status: "needs_you",
    limits: { may_state: ["Child's name", "Current appointment"], accept: "Any weekday after 3:30 pm in the next 3 weeks", max_dollars: null, if_asked_more: "Ask Melissa by text" },
    outcome: null, summary: "Office offered Tue 2:00 pm only (outside the limit). Agent said Melissa will confirm. Texted Melissa: “Tue 2 pm ok? Y/N”.", duration_min: 4, cost_note: "$0.70", recorded: false, requested_at: h(3), case_href: null },
  { id: "v3", purpose: "Confirm beach house cleaner for the 30th", who: "[Cleaning company]", number_note: "···-2201", on_behalf_of: "Ryan", status: "done",
    limits: { may_state: ["Name", "Address of the beach house", "Dates"], accept: "Confirmation of the existing booking; no new charges", max_dollars: 0, if_asked_more: "Decline and report" },
    outcome: "Confirmed for the 30th, 10 am. No changes.", summary: "Agent introduced itself as an AI assistant calling for Ryan, confirmed the booking, asked for an email confirmation (promised).", duration_min: 3, cost_note: "$0.50", recorded: true, requested_at: h(26), case_href: null },
  { id: "v4", purpose: "Ask [ISP] for a lower rate", who: "[ISP] retention line", number_note: "1-800-···-1100", on_behalf_of: "Ryan", status: "declined",
    limits: { may_state: ["Name", "Account last-4"], accept: "Any lower monthly price, same speed, no new contract", max_dollars: null, if_asked_more: "Decline" },
    outcome: "Declined by Ryan: will handle via chat from the Mac mini instead (bill negotiation plan).", summary: null, duration_min: null, cost_note: null, recorded: false, requested_at: h(50), case_href: null },
];

export async function getVoiceCalls(): Promise<VoiceCall[]> {
  if (!hasSupabaseEnv()) return sampleCalls;
  const sb = await createClient();
  const { data } = await sb.from("voice_calls").select("*").order("requested_at", { ascending: false }).limit(30);
  if (!data?.length) return sampleCalls;
  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), purpose: String(r.purpose), who: String(r.callee), number_note: String(r.number_note ?? ""), on_behalf_of: String(r.on_behalf_of ?? ""), status: r.status as CallStatus,
    limits: (r.limits as VoiceCall["limits"]) ?? { may_state: [], accept: "", max_dollars: null, if_asked_more: "" }, outcome: (r.outcome as string) ?? null, summary: (r.summary as string) ?? null,
    duration_min: (r.duration_min as number) ?? null, cost_note: (r.cost_note as string) ?? null, recorded: Boolean(r.recorded), requested_at: String(r.requested_at), case_href: (r.case_href as string) ?? null,
  }));
}
