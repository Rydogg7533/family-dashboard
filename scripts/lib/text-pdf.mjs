// A receipt email that carries its total in the body and no attachment still has to leave a document behind, or the
// charge has a number in Money and nothing to open (Ryan, 2026-10-29: "I want a receipt for every charge in each card
// month and year"). This writes that document: a plain-text PDF, by hand.
//
// Why text and not a rendered page. Rendering the email as HTML would fetch its remote images, and in marketing mail
// those images ARE the sender's tracking pixel -- so every document made would tell the sender the mail had been
// opened again, from the Mac mini, possibly months later. Text fetches nothing. It also needs no browser on the hub,
// no dependency, and it cannot execute anything the mail contains.
//
// The bytes are deterministic: no creation date, no object ids that depend on the clock. The same email rendered twice
// gives the same sha256, which is what lets email-receipts.mjs skip a document it has already made.

const PAGE_W = 612, PAGE_H = 792, MARGIN = 54;   // US Letter, 3/4 inch margins
const SIZE = 10, LEAD = 13, WRAP = 95;           // Helvetica 10pt: ~95 characters fit across the text column
const LINES_PER_PAGE = Math.floor((PAGE_H - MARGIN * 2) / LEAD);

// WinAnsiEncoding covers Latin-1. Anything outside it (emoji, CJK, the odd currency sign) is replaced rather than
// written raw, which would otherwise produce mojibake in a reader.
const FOLD = [[/[‘’ʼ]/g, "'"], [/[“”]/g, '"'], [/[–—]/g, "-"], [/…/g, "..."],
  [/ /g, " "], [/[•●]/g, "-"], [/€/g, "EUR"], [/£/g, "GBP"], [/→/g, "->"]];
function latin1(s) {
  let out = String(s);
  for (const [re, to] of FOLD) out = out.replace(re, to);
  return out.replace(/[^\x09\x0a\x20-\xff]/g, "");
}
const esc = (s) => latin1(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

// One long line becomes several, broken on spaces where it can be and mid-word where it cannot (a URL, a long
// reference number). Tabs become spaces so the column does not jump.
export function wrap(text, width = WRAP) {
  const out = [];
  for (const raw of String(text ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")) {
    let line = raw.replace(/\s+$/, "");
    if (!line.length) { out.push(""); continue; }
    while (line.length > width) {
      let cut = line.lastIndexOf(" ", width);
      if (cut < width * 0.5) cut = width;          // no sensible space: break the word
      out.push(line.slice(0, cut).replace(/\s+$/, ""));
      line = line.slice(cut).replace(/^\s+/, "");
    }
    out.push(line);
  }
  return out;
}

// lines: already-wrapped strings, or anything with newlines -- it is wrapped here either way.
// A line may be { text, bold: true } for the heading rows.
export function textPdf(lines) {
  const flat = [];
  for (const l of Array.isArray(lines) ? lines : [lines]) {
    const bold = !!(l && typeof l === "object" && l.bold);
    const text = l && typeof l === "object" ? String(l.text ?? "") : String(l ?? "");
    for (const w of wrap(text)) flat.push({ text: w, bold });
  }
  const pages = [];
  for (let i = 0; i < Math.max(flat.length, 1); i += LINES_PER_PAGE) pages.push(flat.slice(i, i + LINES_PER_PAGE));

  // Object numbering: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, then per page a page object and its stream.
  const FONT = 3, BOLD = 4, FIRST = 5;
  const objs = [];
  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${FIRST + i * 2} 0 R`).join(" ")}] >>`;
  objs[FONT] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objs[BOLD] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
  pages.forEach((page, i) => {
    const pageObj = FIRST + i * 2, streamObj = pageObj + 1;
    let body = "BT\n";
    let y = PAGE_H - MARGIN - SIZE;
    let font = "";
    for (const ln of page) {
      const want = ln.bold ? "/F2" : "/F1";
      if (want !== font) { body += `${want} ${SIZE} Tf\n`; font = want; }
      body += `1 0 0 1 ${MARGIN} ${y} Tm\n(${esc(ln.text)}) Tj\n`;
      y -= LEAD;
    }
    body += "ET";
    objs[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${FONT} 0 R /F2 ${BOLD} 0 R >> >> /Contents ${streamObj} 0 R >>`;
    objs[streamObj] = `<< /Length ${Buffer.byteLength(body, "latin1")} >>\nstream\n${body}\nendstream`;
  });

  // Serialise, tracking each object's byte offset for the cross-reference table.
  const parts = ["%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"];
  let at = Buffer.byteLength(parts[0], "latin1");
  const offset = [];
  for (let n = 1; n < objs.length; n++) {
    if (!objs[n]) continue;
    offset[n] = at;
    const chunk = `${n} 0 obj\n${objs[n]}\nendobj\n`;
    parts.push(chunk);
    at += Buffer.byteLength(chunk, "latin1");
  }
  const count = objs.length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) xref += `${String(offset[n] ?? 0).padStart(10, "0")} 00000 ${offset[n] ? "n" : "f"} \n`;
  parts.push(`${xref}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`);
  return Buffer.from(parts.join(""), "latin1");
}

// The document a body-only receipt email becomes: who it is from, when, the subject, then the mail itself.
// The header lines are what makes it recognisable as evidence months later; the note at the end says where it
// came from, so nobody mistakes a rendered email for a document the vendor issued.
export function emailPdf({ from, address, date, subject, account, body }) {
  return textPdf([
    { text: subject || "(no subject)", bold: true },
    "",
    { text: `From:    ${from ? `${from} <${address}>` : address || "unknown sender"}`, bold: false },
    `Date:    ${date || "unknown"}`,
    `Mailbox: ${account || ""}`,
    "",
    "".padEnd(WRAP, "-"),
    "",
    body && body.trim().length ? body : "(this message had no text body)",
    "",
    "".padEnd(WRAP, "-"),
    "Made by StewardOS from the email itself, because the sender attached no receipt. The text above is the message as it arrived; images and formatting are not included.",
  ]);
}
