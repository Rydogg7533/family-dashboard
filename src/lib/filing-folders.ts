// The folders a document may be filed into (mirrors the Mac mini structure). Anything outside this list is refused.
export function filingFolders(year: string, vehicleShorts: string[]): string[] {
  const P = "Organized/Personal/Documents";
  const list = [
    `${P}/Finance/${year}/Receipts/`, `${P}/Finance/${year}/Dining/`, `${P}/Finance/${year}/Statements/`, `${P}/Finance/${year}/Bills/`,
    `${P}/Home/${year}/`, `${P}/Legal/`, `${P}/Investments/Et Al/`, `${P}/Family/`, `${P}/Health/${year}/`,
    ...vehicleShorts.map((s) => `${P}/Vehicles/${s}/${year}/`),
  ];
  for (const b of ["Veil Labs", "SHVR - Base-Drop Studio", "Et Al", "Pixel Empire LLC"]) list.push(`Organized/Business/${b}/01_Admin/${year}/`);
  return list;
}

// "Panda Express #0539" and "PANDA EXPRESS 0539" are the same vendor for a rule.
export function vendorKey(v: unknown): string {
  return String(v ?? "").toLowerCase().replace(/[#]\s*\d+/g, " ").replace(/\b\d{2,}\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}
export const toTemplate = (home: string) => home.replace(/\/(20\d\d)\//, "/{year}/");
export const fromTemplate = (t: string, year: string) => t.replace("{year}", year);
