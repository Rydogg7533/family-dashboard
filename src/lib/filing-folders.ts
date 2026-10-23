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
