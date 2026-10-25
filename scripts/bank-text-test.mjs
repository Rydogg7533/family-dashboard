// Needs Node 22.18+. Offline.
import assert from "node:assert/strict";
import { cleanBankText } from "../src/lib/bank-text.ts";
assert.equal(cleanBankText("Purchase, Authorized On, 10/21 Tst*sanchos Tacos, San Clemente, Ca, Sx9636, Card 8709"), "Tst*sanchos Tacos, San Clemente, Ca");
assert.equal(cleanBankText("Purchase, Authorized On, 10/23 Ebay Commerce Inc., San Jose, Ca, Px2164, Card 8709"), "Ebay Commerce Inc., San Jose, Ca");
assert.equal(cleanBankText("Purchase, Authorized On, 10/21 Walmart.com x6278, Bentonville, Ar, Px8400, Card 8709"), "Walmart.com x6278, Bentonville, Ar");
assert.equal(cleanBankText("Purchase, Authorized On, 10/20 Amazon Mktpl*2z23w, Amzn.com/bill Wa, Sx5375, Card 8709"), "Amazon Mktpl*2z23w, Amzn.com/bill Wa");
assert.equal(cleanBankText("Recurring Payment Authorized On 10/05 Netflix.com Los Gatos CA Sx1234 Card 8709"), "Netflix.com Los Gatos CA");   // the same shape without commas
assert.equal(cleanBankText("State Farm Billg Payments, Xx1020 Ql9qbx"), "State Farm Billg Payments, Xx1020 Ql9qbx");               // already clean: untouched
assert.equal(cleanBankText("  Costco   Wholesale  "), "Costco Wholesale");
assert.equal(cleanBankText(""), "");
assert.equal(cleanBankText(null), "");
assert.equal(cleanBankText("Purchase, Authorized On, 10/21 Card 8709"), "Purchase, Authorized On, 10/21 Card 8709");                 // nothing left after cleaning: keep the original
console.log("bank-text: all checks passed");
