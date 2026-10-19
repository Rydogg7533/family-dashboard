import { AskChat } from "@/components/AskChat";
import { hasAiKey } from "@/lib/ai";
import { getDisplayName } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Ask({ searchParams }: PageProps<"/ask">) {
  const { q } = await searchParams;
  const prefill = typeof q === "string" ? q : "";
  const who = (await getDisplayName()) || "Ryan";
  return <AskChat prefill={prefill} sample={!hasAiKey()} who={who} />;
}
