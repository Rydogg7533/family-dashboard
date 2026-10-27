// Payment cards (D-2026-10-27): server reader with a sample fallback. Types and label helpers are in payment-cards.ts.
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { PaymentCard } from "@/lib/payment-cards";
export { cardKind, cardLabel, paidWithLabel, knownPaymentLabels, samplePaymentCards, type PaymentCard } from "@/lib/payment-cards";
import { samplePaymentCards } from "@/lib/payment-cards";

export async function getPaymentCards(): Promise<PaymentCard[]> {
  if (!hasSupabaseEnv()) return samplePaymentCards;
  const sb = await createClient();
  const { data } = await sb.from("payment_cards").select("*").order("created_at");
  return (data as PaymentCard[]) ?? [];
}

