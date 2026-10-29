import Link from "next/link";
import { H1 } from "@/components/ui";
import { getVaultImport } from "@/lib/data-vault-import";
import { VaultImport } from "@/components/VaultImport";

export const dynamic = "force-dynamic";

// Settings › 1Password › Map your documents. The person points at a folder on their Mac; the Mac reads it,
// works out what each document is and whose, and brings the list back here to be checked. Creating the
// 1Password items and writing the links is the Mac's job, under the service role: the app only carries
// decisions. Decisions 2026-10-29 D27-D29.
export default async function VaultImportPage() {
  const { run, items, rows } = await getVaultImport();
  return (
    <>
      <Link href="/settings/vault" className="text-xs font-semibold text-accent">‹ 1Password</Link>
      <H1>Map your documents</H1>
      <VaultImport run={run} items={items} rows={rows} />
    </>
  );
}
