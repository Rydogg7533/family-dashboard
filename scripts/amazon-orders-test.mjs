import assert from "node:assert/strict";
import { parseAmazonOrders, denverDate } from "./amazon-orders-lib.mjs";

const digest = "Thanks for your order! Ordered Shipped Arriving Wednesday Ryan - OREM, UT Order # 111-1111111-1111111 View or edit order Arriving Monday Ryan - OREM, UT Order # 111-1111111-1111111 View or edit order Grand Total: 118.39 USD Arriving October 20 Ryan - OREM, UT Order # 222-2222222-2222222 View or edit order Grand Total: 39.75 USD ©2026 Amazon.com";
assert.deepEqual(parseAmazonOrders(digest), [{ order: "111-1111111-1111111", listed: 2, total: 118.39 }, { order: "222-2222222-2222222", listed: 1, total: 39.75 }]);
// one order, thousands separator, "Order Total" wording, dollar sign
assert.deepEqual(parseAmazonOrders("Order # 333-3333333-3333333 Order Total: $1,234.50"), [{ order: "333-3333333-3333333", listed: 1, total: 1234.5 }]);
// an order with no total stays visible with total null (reported, never written)
assert.deepEqual(parseAmazonOrders("Order # 444-4444444-4444444 View or edit order"), [{ order: "444-4444444-4444444", listed: 1, total: null }]);
// a total with no order before it is ignored
assert.deepEqual(parseAmazonOrders("Grand Total: 5.00 USD"), []);
assert.deepEqual(parseAmazonOrders(""), []);
assert.deepEqual(parseAmazonOrders(null), []);
// Denver date: 00:21 UTC on the 11th is the evening of the 10th in Utah (daylight time)
assert.equal(denverDate("2026-10-11T00:21:00Z"), "2026-10-10");
assert.equal(denverDate("2026-10-11T18:00:00Z"), "2026-10-11");
console.log("amazon-orders-test: all checks passed");
