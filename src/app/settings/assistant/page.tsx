import Link from "next/link";
import { H1 } from "@/components/ui";
import { AssistantSettings } from "@/components/AssistantSettings";
import { getAssistantPrefs } from "./actions";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const prefs = await getAssistantPrefs();
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>Assistant</H1>
      <AssistantSettings initial={prefs} />
    </>
  );
}
