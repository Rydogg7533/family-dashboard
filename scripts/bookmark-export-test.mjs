import assert from "node:assert/strict"; import { exportHtml } from "./bookmark-export.mjs";
const cat = { tree: ["Pinned", "Money", "Money › Crypto & Markets"], entries: [{ url: "https://a.com/?x=1&y=2", title: "A <b> \"q\"", host: "a.com", folder: "Money › Crypto & Markets", also: ["Pinned"], status: "active", added: null }, { url: "https://gone.com", title: "gone", host: "gone.com", folder: "Pinned", also: [], status: "dead" }] };
const { html, count } = exportHtml(cat, "StewardOS (new)");
assert.equal(count, 2); assert.equal((html.match(/<A HREF/g) || []).length, 2);
assert.ok(html.includes("x=1&amp;y=2") && html.includes("A &lt;b&gt; &quot;q&quot;"));
assert.ok(html.indexOf("Pinned") < html.indexOf("Money") && html.includes("<H3>Crypto &amp; Markets</H3>") && !html.includes("gone.com"));
assert.equal((html.match(/<DL>/g) || []).length, (html.match(/<\/DL>/g) || []).length, "balanced");
console.log("PASS: bookmark-export");
