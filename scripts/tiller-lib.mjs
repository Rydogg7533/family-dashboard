// Pure helpers for the Tiller sync (no network, no files). Tested by tiller-sync-test.mjs.

export const toDate = (v) => {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

// "-$12.34", "($12.34)", "1,234.50", "12.34-" → number, or null when it is not a number.
export function parseAmount(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.includes("-");
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

// Tiller shows money going OUT as negative. The app stores a purchase as a positive number, so the sign flips.
// A refund or deposit becomes negative. (-0 is normalised to 0.)
export const appAmount = (tillerAmount) => (tillerAmount === 0 ? 0 : -tillerAmount);

export function last4(accountNumber, name) {
  const d = String(accountNumber ?? "").replace(/\D/g, "");
  if (d) return d.slice(-4);
  const m = String(name ?? "").match(/(\d{4})\)?\s*$/);
  return m ? m[1] : "";
}

export function accountSlug(name, l4) {
  let base = String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (l4) base = base.replace(new RegExp(`-?${l4}$`), "");
  base = base.slice(0, 40).replace(/-+$/, "") || "account";
  return l4 ? `${base}-${l4}` : base;
}

// The accounts table only allows credit, checking, savings, payment_app, business. Anything else (a loan) → null = skipped and reported.
export function guessKind({ type = "", klass = "", name = "" }) {
  const s = `${type} ${name}`.toLowerCase();
  if (/loan|mortgage/.test(s)) return null;
  if (/saving/.test(s)) return "savings";
  if (/check|cash management/.test(s)) return "checking";
  if (/credit|card|visa|mastercard|amex|american express|blue cash|discover/.test(s)) return "credit";
  if (/liab/i.test(klass)) return "credit";
  return null;
}

export const cleanMerchant = (description, full) => {
  const s = String(description ?? "").replace(/\s+/g, " ").trim() || String(full ?? "").replace(/\s+/g, " ").trim();
  return s || "(no description)";
};
