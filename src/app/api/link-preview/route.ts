import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv, getRequestUser } from "@/lib/supabase/server";
import { lookup } from "node:dns/promises";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Link card for a URL in a message (issue ec1c4e31), the way Messages shows one: site, title, description, image.
// Fetched from the server once per URL and cached in link_previews; the phone never contacts the linked site just
// by reading a thread. Public page metadata only. Private, loopback and link-local hosts are refused.
type Preview = { url: string; site: string | null; title: string | null; description: string | null; image: string | null; ok: boolean };
const WEEK = 7 * 24 * 3600 * 1000;
const MAX_BYTES = 512 * 1024;

function privateIp(ip: string) {
  if (ip.includes(":")) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith("::ffff:");
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}
async function safeHost(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (!u.hostname.includes(".") || u.hostname.endsWith(".local")) return false;
  try { const { address } = await lookup(u.hostname); return !privateIp(address); } catch { return false; }
}
const meta = (html: string, key: string) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i");
  const m = html.match(re) ?? html.match(re2);
  return m ? decode(m[1]).trim() || null : null;
};
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

async function fetchPreview(url: string): Promise<Preview> {
  const u = new URL(url);
  const empty: Preview = { url, site: u.hostname.replace(/^www\./, ""), title: null, description: null, image: null, ok: false };
  if (!(await safeHost(u))) return empty;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; StewardOS link preview; +https://stewardos.co)", accept: "text/html,application/xhtml+xml" } });
    if (!r.ok || !/text\/html|xhtml/.test(r.headers.get("content-type") ?? "")) return empty;
    const final = new URL(r.url || url);
    if (!(await safeHost(final))) return empty;
    const reader = r.body?.getReader();
    let html = "", got = 0;
    const dec = new TextDecoder();
    while (reader) { const { done, value } = await reader.read(); if (done) break; got += value.byteLength; html += dec.decode(value, { stream: true }); if (got > MAX_BYTES || /<\/head>/i.test(html)) break; }
    reader?.cancel().catch(() => {});
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
    const title = meta(html, "og:title") ?? meta(html, "twitter:title") ?? (titleTag ? decode(titleTag).trim() : null);
    const description = meta(html, "og:description") ?? meta(html, "twitter:description") ?? meta(html, "description");
    let image = meta(html, "og:image") ?? meta(html, "og:image:url") ?? meta(html, "twitter:image");
    if (image) { try { const iu = new URL(image, final); image = iu.protocol === "https:" ? iu.toString() : null; } catch { image = null; } }
    const site = meta(html, "og:site_name") ?? final.hostname.replace(/^www\./, "");
    return { url, site, title, description: description ? description.slice(0, 300) : null, image, ok: Boolean(title) };
  } catch { return empty; } finally { clearTimeout(t); }
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let url: URL;
  try { url = new URL(raw); } catch { return new NextResponse("Bad url", { status: 400 }); }
  if (url.protocol !== "https:" && url.protocol !== "http:") return new NextResponse("Bad url", { status: 400 });
  url.hash = "";
  const key = url.toString();
  const headers = { "Cache-Control": "private, max-age=3600" };
  if (!hasSupabaseEnv()) return NextResponse.json(await fetchPreview(key), { headers });
  const user = await getRequestUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const sb = await createClient();
  const { data: hit } = await sb.from("link_previews").select("url,site,title,description,image,ok,fetched_at").eq("url", key).maybeSingle();
  if (hit && Date.now() - new Date(hit.fetched_at).getTime() < WEEK) return NextResponse.json(hit, { headers });
  const p = await fetchPreview(key);
  await sb.from("link_previews").upsert({ ...p, fetched_at: new Date().toISOString() });
  return NextResponse.json(p, { headers });
}
