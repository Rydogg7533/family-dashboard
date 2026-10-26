// Appearance settings (F8.A). Pure CSS variables; stored per person (localStorage now, profile row later).
export type Appearance = {
  theme: "auto" | "light" | "dark";
  accent: string;           // hex
  textSize: "s" | "m" | "l" | "xl";
  density: "comfortable" | "compact";
  cardStyle: "bordered" | "filled" | "flat";
  radius: "square" | "soft" | "round";
  font: "plex" | "system" | "serif" | "rounded" | "mono" | "humanist";
  background: "plain" | "gradient" | "mesh" | "photo";
  backgroundDim: number;    // 0..80 (%)
  photoUrl?: string;
  greetingName: string;
  firstLine: "date" | "weather" | "quote" | "none";
  reduceMotion: boolean;
  preset?: string;
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "auto", accent: "#1F6FA3", textSize: "m", density: "comfortable", cardStyle: "filled", radius: "soft",
  font: "plex", background: "plain", backgroundDim: 40, greetingName: "", firstLine: "date", reduceMotion: false,
};

export const ACCENTS = [
  { name: "Harbor", hex: "#1F6FA3" }, { name: "Forest", hex: "#176B45" }, { name: "Plum", hex: "#6B3FA0" },
  { name: "Clay", hex: "#B5553A" }, { name: "Slate", hex: "#4A5568" }, { name: "Teal", hex: "#1A7F86" },
  { name: "Rose", hex: "#B23A62" }, { name: "Ink", hex: "#16181D" },
];

export const FONTS: Record<Appearance["font"], { name: string; display: string; body: string; link?: string }> = {
  plex: { name: "Manrope + IBM Plex Sans", display: "Manrope, system-ui, sans-serif", body: "'IBM Plex Sans', system-ui, sans-serif", link: "https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&display=swap" },
  system: { name: "System font", display: "system-ui, -apple-system, sans-serif", body: "system-ui, -apple-system, sans-serif" },
  serif: { name: "Fraunces + Source Serif", display: "Fraunces, Georgia, serif", body: "'Source Serif 4', Georgia, serif", link: "https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Source+Serif+4:wght@400;600&display=swap" },
  rounded: { name: "Nunito", display: "Nunito, system-ui, sans-serif", body: "Nunito, system-ui, sans-serif", link: "https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800&display=swap" },
  humanist: { name: "Work Sans + Inter", display: "'Work Sans', system-ui, sans-serif", body: "Inter, system-ui, sans-serif", link: "https://fonts.googleapis.com/css2?family=Work+Sans:wght@600;700&family=Inter:wght@400;500;600&display=swap" },
  mono: { name: "Space Grotesk + JetBrains Mono", display: "'Space Grotesk', system-ui, sans-serif", body: "'JetBrains Mono', ui-monospace, monospace", link: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap" },
};

export const PRESETS: Record<string, Partial<Appearance>> = {
  Classic: { ...DEFAULT_APPEARANCE },
  Night: { theme: "dark", accent: "#6FB1E0", cardStyle: "filled", background: "gradient" },
  Ocean: { accent: "#1A7F86", font: "rounded", background: "mesh", radius: "round", cardStyle: "filled" },
  Paper: { accent: "#B5553A", font: "serif", cardStyle: "flat", background: "plain", radius: "soft" },
  Kids: { accent: "#6B3FA0", font: "rounded", textSize: "l", radius: "round", cardStyle: "filled", background: "mesh" },
  Large: { textSize: "xl", density: "comfortable", font: "system", cardStyle: "bordered" },
};

export const STORAGE_KEY = "fd.appearance.v1";

export function loadAppearance(): Appearance {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) }; } catch {}
  return DEFAULT_APPEARANCE;
}
export function saveAppearance(a: Appearance) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)); } catch {} }

const sizes = { s: "14px", m: "15px", l: "17px", xl: "19px" };
const radii = { square: "4px", soft: "14px", round: "22px" };

export function applyAppearance(a: Appearance) {
  const r = document.documentElement;
  r.dataset.theme = a.theme;
  r.dataset.cardStyle = a.cardStyle;
  r.dataset.density = a.density;
  r.dataset.background = a.background;
  r.style.setProperty("--accent-user", a.accent);
  r.style.setProperty("--base-size", sizes[a.textSize]);
  r.style.setProperty("--radius", radii[a.radius]);
  r.style.setProperty("--font-display", FONTS[a.font].display);
  r.style.setProperty("--font-body", FONTS[a.font].body);
  r.style.setProperty("--bg-dim", String(a.backgroundDim / 100));
  r.style.setProperty("--bg-photo", a.background === "photo" && a.photoUrl ? `url("${a.photoUrl}")` : "none");
  r.style.setProperty("--motion", a.reduceMotion ? "0s" : "0.18s");
  const link = FONTS[a.font].link;
  const id = "fd-font-link";
  let el = document.getElementById(id) as HTMLLinkElement | null;
  if (link) { if (!el) { el = document.createElement("link"); el.id = id; el.rel = "stylesheet"; document.head.appendChild(el); } if (el.href !== link) el.href = link; }
  else if (el) el.remove();
}
