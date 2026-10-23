import { AskChat } from "@/components/AskChat";
import { hasAiKey } from "@/lib/ai";
import { getDisplayName } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Ask({ searchParams }: PageProps<"/ask">) {
  const { q, about } = await searchParams;
  // "Ask about this page" (from the + button) starts the question with the page it came from.
  const prefill = typeof q === "string" ? q : typeof about === "string" && about ? `About ${about}: ` : "";
  const who = (await getDisplayName()) || "Ryan";
  return <AskChat prefill={prefill} sample={!hasAiKey()} who={who} />;
}
