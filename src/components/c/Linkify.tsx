"use client";
import { useEffect, useState } from "react";

// Message text with every URL tappable, plus a Messages-style card for the first link (issue ec1c4e31).
// Links open in a new tab; in-app paths stay in place. The card is fetched through /api/link-preview, which is
// the only thing that ever contacts the linked site. No preview data → the plain link stands alone.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"'）)]+[^\s<>"'.,;:!?）)])/gi;
const APP = typeof window !== "undefined" ? window.location.origin : "";

export function linksIn(text: string | null | undefined): string[] {
  if (!text) return [];
  return Array.from(new Set((text.match(URL_RE) ?? []).map((m) => (m.startsWith("www.") ? `https://${m}` : m))));
}

export function Linkify({ text, mine, preview = true }: { text: string; mine?: boolean; preview?: boolean }) {
  const parts = text.split(URL_RE);
  const urls = linksIn(text);
  const cls = mine ? "underline decoration-white/60 text-white" : "underline text-accent";
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return p;
        const href = p.startsWith("www.") ? `https://${p}` : p;
        const internal = APP && href.startsWith(APP);
        return <a key={i} href={internal ? href.slice(APP.length) || "/" : href} target={internal ? undefined : "_blank"} rel={internal ? undefined : "noopener noreferrer"} className={`${cls} break-all`} onClick={(e) => e.stopPropagation()}>{p}</a>;
      })}
      {preview && urls[0] && !(APP && urls[0].startsWith(APP)) && <LinkCard url={urls[0]} mine={mine} />}
    </>
  );
}

type Preview = { site: string | null; title: string | null; description: string | null; image: string | null; ok: boolean };

export function LinkCard({ url, mine }: { url: string; mine?: boolean }) {
  const [p, setP] = useState<Preview | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live) setP(d && d.ok ? d : null); }).catch(() => { if (live) setP(null); });
    return () => { live = false; };
  }, [url]);
  if (!p) return null;
  let host = p.site ?? ""; try { host = host || new URL(url).hostname.replace(/^www\./, ""); } catch {}
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      className={`block mt-2 -mx-1.5 -mb-1 rounded-[12px] overflow-hidden border no-underline ${mine ? "border-white/30 bg-white/10 text-white" : "border-line bg-bg text-fg"}`}>
      {p.image && <img src={p.image} alt="" loading="lazy" className="w-full max-h-44 object-cover block" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
      <div className="px-3 py-2">
        <div className="text-sm font-semibold leading-snug line-clamp-2">{p.title}</div>
        {p.description && <div className={`text-xs mt-0.5 line-clamp-2 ${mine ? "text-white/80" : "text-muted"}`}>{p.description}</div>}
        <div className={`text-[11px] mt-1 uppercase tracking-wide ${mine ? "text-white/70" : "text-muted"}`}>{host}</div>
      </div>
    </a>
  );
}
