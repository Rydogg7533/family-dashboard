// Thread avatars in the Messages list, like the Messages app: a photo when we have one, otherwise initials on a soft
// disc. Groups show two overlapping discs. Photos are served by /api/avatar (signed, members only).
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

export function Disc({ name, src, size = 44, className = "" }: { name: string; src?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (src) return <img src={src} alt="" width={size} height={size} className={`rounded-full object-cover shrink-0 ${className}`} style={style} />;
  const h = hue(name);
  return (
    <span aria-hidden className={`rounded-full shrink-0 flex items-center justify-center font-bold text-white ${className}`}
      style={{ ...style, background: `linear-gradient(160deg, hsl(${h} 45% 62%), hsl(${h} 45% 48%))` }}>{initials(name)}</span>
  );
}

// members: the people other than the viewer. One → a disc; several → two discs, the second tucked behind.
export function ThreadAvatar({ members, photos = {}, size = 44 }: { members: string[]; photos?: Record<string, string | null>; size?: number }) {
  const [a, b] = members;
  if (!a) return <Disc name="?" size={size} />;
  if (!b) return <Disc name={a} src={photos[a]} size={size} />;
  const s = Math.round(size * 0.68);
  return (
    <span className="relative shrink-0 block" style={{ width: size, height: size }}>
      <Disc name={b} src={photos[b]} size={s} className="absolute top-0 right-0 ring-2 ring-bg" />
      <Disc name={a} src={photos[a]} size={s} className="absolute bottom-0 left-0 ring-2 ring-bg" />
    </span>
  );
}
