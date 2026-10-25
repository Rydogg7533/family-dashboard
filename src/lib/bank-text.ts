// Display-only cleanup of raw bank descriptions ("Purchase, Authorized On, 10/21 Tst*sanchos Tacos, San Clemente, Ca, Sx9636, Card 8709").
// The stored text is never changed; this only decides what the screen shows. Client-safe, pure.
export function cleanBankText(raw: string | null | undefined): string {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/^(recurring\s+)?(purchase|payment)\b,?\s*(authorized on,?\s*)?\d{1,2}\/\d{1,2}\s*/i, "");   // "Purchase, Authorized On, 10/21 "
  s = s.replace(/,?\s*card\s+\d{4}\s*$/i, "");                                                              // ", Card 8709"
  s = s.replace(/,?\s*[SP]x\d{3,}\s*$/i, "");                                                               // ", Sx9636" / ", Px2164"
  s = s.replace(/,\s*$/, "").trim();
  return s || String(raw ?? "").trim();
}
