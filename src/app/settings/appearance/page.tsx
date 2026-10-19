import Link from "next/link";
import { H1 } from "@/components/ui";
import { AppearanceSettings } from "@/components/AppearanceSettings";

export default function AppearancePage() {
  return (
    <>
      <H1 right={<Link href="/settings" className="font-semibold text-accent">Settings ›</Link>}>Look and feel</H1>
      <AppearanceSettings />
    </>
  );
}
