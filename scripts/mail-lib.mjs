// Pure helpers for Mail (stage 1). No network. Turns a Gmail API "full" message into one plain-text row.
// Plain text only: HTML mail is flattened to text, so remote images and tracking pixels never load.

const b64 = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", copy: "©", zwnj: "", zwj: "" };
const decodeEntities = (s) => s.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => { try { return String.fromCodePoint(/^x/i.test(n) ? parseInt(n.slice(1), 16) : parseInt(n, 10)); } catch { return ""; } }).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);

export function htmlToText(html) {
  return decodeEntities(String(html)
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, "\n").replace(/<li[^>]*>/gi, "• ")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => { const txt = t.replace(/<[^>]+>/g, "").trim(); return txt && !href.startsWith("mailto:") && txt !== href ? `${txt} (${href})` : txt || href; })
    .replace(/<[^>]+>/g, ""))
    .replace(/[ \t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function walk(part, out) {
  if (!part) return;
  const mime = (part.mimeType || "").toLowerCase();
  if (part.filename && part.body?.attachmentId) out.files.push({ name: part.filename, mime, size: part.body.size ?? 0 });
  else if (mime === "text/plain" && part.body?.data) out.plain.push(b64(part.body.data));
  else if (mime === "text/html" && part.body?.data) out.html.push(b64(part.body.data));
  for (const p of part.parts || []) walk(p, out);
}

export function parseAddress(v) {
  const s = String(v || "").trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim(), addr: m[2].trim().toLowerCase() } : { name: "", addr: s.toLowerCase() };
}
export function parseAddressList(v) {
  if (!v) return [];
  const out = []; let cur = "", q = false, a = 0;
  for (const ch of String(v)) { if (ch === '"') q = !q; if (ch === "<") a++; if (ch === ">") a = Math.max(0, a - 1); if (ch === "," && !q && !a) { out.push(cur); cur = ""; } else cur += ch; }
  out.push(cur);
  return out.map(parseAddress).filter((x) => x.addr);
}

// msg: Gmail users.messages.get?format=full. folder: 'inbox' | 'draft'.
export function parseGmailFull(msg, folder, account) {
  const h = Object.fromEntries((msg.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
  const out = { plain: [], html: [], files: [] }; walk(msg.payload, out);
  let text = out.plain.join("\n\n").trim();
  if (!text && out.html.length) text = htmlToText(out.html.join("\n"));
  text = text.replace(/\r\n/g, "\n").slice(0, 200000);
  const from = parseAddress(h["from"]);
  const dateMs = msg.internalDate ? Number(msg.internalDate) : Date.parse(h["date"] || "");
  return {
    ext_id: msg.id, thread_id: msg.threadId || null, folder, rfc_message_id: (h["message-id"] || "").trim().replace(/^<|>$/g, "").slice(0, 300) || null,
    from_name: from.name || null, from_addr: from.addr || null,
    to_addrs: parseAddressList(h["to"]), cc_addrs: parseAddressList(h["cc"]),
    subject: (h["subject"] || "").slice(0, 500), snippet: decodeEntities(msg.snippet || "").slice(0, 300), body_text: text,
    sent_at: Number.isFinite(dateMs) ? new Date(dateMs).toISOString() : null,
    unread: (msg.labelIds || []).includes("UNREAD"), attachments: out.files.slice(0, 20),
    web_url: msg.threadId ? `https://mail.google.com/mail/u/${encodeURIComponent(account)}/#${folder === "draft" ? "drafts" : "inbox"}/${msg.threadId}` : null,
  };
}
