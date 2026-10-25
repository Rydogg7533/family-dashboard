// Pure parser for Amazon order emails (no network, no files). Tested by amazon-orders-test.mjs.
// The "Ordered N items" digest from auto-confirm@amazon.com is plain text like:
//   ... Order # A View or edit order Order # A View or edit order Grand Total: 118.39 USD Arriving ... Order # B View or edit order Grand Total: 39.75 USD ...
// An order number can be listed once per shipment; the Grand Total follows the order it belongs to (an inference from the layout).
// Item names and prices are NOT in this text (they are images), so only order number, total and shipment count come out.

const TOKEN = /Order\s*#\s*(\d{3}-\d{7}-\d{7})|(?:Grand Total|Order Total):?\s*\$?\s*([\d,]+\.\d{2})/gi;

export function parseAmazonOrders(text) {
  const out = []; let cur = null;
  for (const m of String(text ?? "").matchAll(TOKEN)) {
    if (m[1]) {
      if (cur && cur.order === m[1]) cur.listed++;
      else { if (cur) out.push(cur); cur = { order: m[1], listed: 1, total: null }; }
    } else if (cur && cur.total === null) {
      cur.total = Math.round(parseFloat(m[2].replace(/,/g, "")) * 100) / 100;
      out.push(cur); cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// The household's day, not UTC: an order placed at 6 pm in Utah is dated that day even though the email is stamped after midnight UTC.
export const denverDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date(d));
