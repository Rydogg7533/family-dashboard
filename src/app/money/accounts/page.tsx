import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Accounts and cards are setup data, so they live under Settings (D-2026-10-27). Old links land there.
export default function AccountsRedirect() { redirect("/settings/money/accounts"); }
