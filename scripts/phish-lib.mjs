// Phishing screen shared by the mail scripts. Pure, no network. It never opens links or attachments; it looks only at who sent the
// message and what the subject / display name claims. A suspicious message is never turned into a task, never filed as a record,
// and never has its attachments copied. It is moved to Dashboard/Suspicious (undoable) so a person can look.
// Not perfect: a false positive just lands in that folder; a miss is still possible, so tasks also never carry email links.
export const BRANDS = {
  apple: ["apple", "apple.com", "icloud.com", "me.com", "insideapple.apple", "id.apple.com", "post.gs-savings.apple"],
  google: ["fitbit.com", "google.com", "gmail.com", "youtube.com", "googlemail.com"],
  microsoft: ["microsoft.com", "outlook.com", "live.com", "office.com", "xbox.com", "microsoftonline.com"],
  amazon: ["aws.com", "amazon.com", "amazon.co.uk", "amazonaws.com", "amazon.ca"],
  paypal: ["paypal.com"],
  "wells fargo": ["wellsfargo.com", "wf.com", "wellsfargorewards.com", "wellsfargoemail.com", "wellsfargoadvisors.com"],
  "american express": ["americanexpress.com", "aexp.com"],
  amex: ["americanexpress.com", "aexp.com"],
  chase: ["chase.com", "jpmorgan.com", "jpmorganchase.com"],
  "us bank": ["usbank.com"],
  "u.s. bank": ["usbank.com"],
  comcast: ["comcastbusiness.com", "comcast.com", "comcast.net", "xfinity.com"],
  xfinity: ["comcastbusiness.com", "comcast.com", "comcast.net", "xfinity.com"],
  verizon: ["verizon.com", "verizonwireless.com", "vzw.com"],
  docusign: ["docusign.net", "docusign.com"],
  coinbase: ["coinbase.com"],
  netflix: ["netflix.com"],
  irs: ["irs.gov"],
  usps: ["usps.com", "usps.gov"],
  fedex: ["fedex.com"],
  ups: ["ups.com"],
  dhl: ["dhl.com"],
  "state farm": ["statefarm.com", "statefarmservice.com"],
  geico: ["geico.com"],
  experian: ["experian.com"],
  shopify: ["shopify.com", "shopifyemail.com", "myshopify.com", "shopifysvc.com"],
};
const onDomain = (domain, list) => list.some((d) => domain === d || domain.endsWith("." + d));   // "apple" matches anything ending in .apple // exact or a real subdomain; "evilapple.com" does not match "apple.com"
const FOLD = (s) => String(s || "").toLowerCase().replace(/[0|]/g, "o").replace(/[1!]/g, "l").replace(/rn/g, "m");
const words = (s) => ` ${String(s || "").toLowerCase().replace(/[^a-z0-9. ]+/g, " ")} `;

// e = { address, domain, name, subject, authFail, replyDomain }. Returns [] when nothing is odd, else reasons.
export function suspicion(e) {
  const domain = String(e.domain || (e.address || "").split("@")[1] || "").toLowerCase(), why = [];
  if (e.authFail) why.push("failed the sender check (SPF/DKIM/DMARC)");
  const claim = words(`${e.name || ""} ${e.subject || ""}`);
  for (const [brand, legit] of Object.entries(BRANDS)) {
    const mentioned = claim.includes(` ${brand} `) || claim.includes(` ${brand}.`) || (e.name && words(e.name).includes(` ${brand} `));
    if (mentioned && !onDomain(domain, legit)) {
      // Only a claim in the DISPLAY NAME is strong; a subject merely mentioning a brand is normal for stores and banks' partners.
      if (e.name && words(e.name).includes(` ${brand} `)) { why.push(`name says "${brand}" but the address is ${domain}`); break; }
    }
    // lookalike domain: the brand with swapped characters, or the brand inside an unrelated hyphenated domain
    const token = brand.replace(/[^a-z]/g, "");
    if (token.length >= 5 && !onDomain(domain, legit)) {
      const pieces = domain.split(".").slice(0, -1).join(".").split(/[-.]/).map(FOLD);      // purchase.com is not "chase"; wellsfargo-secure.com and paypa1.com are
      if (pieces.some((p) => p === token || (p.startsWith(token) && p.length <= token.length + 6))) { why.push(`domain ${domain} imitates ${brand}`); break; }
    }
  }
  if (e.replyDomain && domain && !onDomain(e.replyDomain, [domain.split(".").slice(-2).join(".")]) && /verify|suspend|locked|unusual activity|password/i.test(e.subject || "")) why.push(`urgent wording and replies go to ${e.replyDomain}`);
  return why;
}
// Authentication-Results can fold over several lines; fail anywhere means the sender is not who it claims.
export const authFailed = (headerBlock) => { const m = String(headerBlock || "").match(/^authentication-results:[^\r\n]*(?:\r?\n[ \t][^\r\n]*)*/im); return !!m && /\b(spf|dkim|dmarc)=(fail|softfail|permerror)\b/i.test(m[0]); };
export const replyDomainOf = (headerBlock) => { const m = String(headerBlock || "").match(/^reply-to:[^\r\n]*?@([a-z0-9.-]+)/im); return m ? m[1].toLowerCase() : ""; };
