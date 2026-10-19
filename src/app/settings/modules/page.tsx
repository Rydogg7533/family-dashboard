import Link from "next/link";
import { H1 } from "@/components/ui";
import { ModulesSettings } from "@/components/ModulesSettings";

export default function ModulesPage() {
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>My dashboard</H1>
      <ModulesSettings />
    </>
  );
}
