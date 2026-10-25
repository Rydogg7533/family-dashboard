"use client";
import { useEffect, useRef, useState } from "react";

// An interactive map (Leaflet 1.9.4 from cdnjs, pinned; OpenStreetMap tiles). Loaded only when a card is opened, so nothing is requested
// from OpenStreetMap until you ask to see a place. The circle is the area that counts as the place; each dot is one visit.
export type MapPoint = { lat: number; lon: number; label: string };
const LEAFLET = "1.9.4";
const BASE = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET}`;
type Leaflet = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let loading: Promise<Leaflet> | null = null;
function loadLeaflet(): Promise<Leaflet> {
  const w = window as unknown as { L?: Leaflet };
  if (w.L) return Promise.resolve(w.L);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[data-leaflet]`)) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = `${BASE}/leaflet.min.css`; l.setAttribute("data-leaflet", "1"); document.head.appendChild(l); }
    const s = document.createElement("script"); s.src = `${BASE}/leaflet.min.js`; s.async = true;
    s.onload = () => (w.L ? resolve(w.L) : reject(new Error("Leaflet did not start")));
    s.onerror = () => { loading = null; reject(new Error("Leaflet did not load")); };
    document.head.appendChild(s);
  });
  return loading;
}

export function PlaceMap({ lat, lon, radiusM = 100, points = [], height = 260 }: { lat: number; lon: number; radiusM?: number; points?: MapPoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // Depend on the contents, not on array identity: the parent rebuilds points on every render (each keystroke in a name box), which must not redraw the map.
  const sig = JSON.stringify([lat, lon, radiusM, points]);
  useEffect(() => {
    const [lat, lon, radiusM, points] = JSON.parse(sig) as [number, number, number, MapPoint[]];
    let map: Leaflet = null, dead = false;
    loadLeaflet().then((L) => {
      if (dead || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true }).setView([lat, lon], 17);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
      const circle = L.circle([lat, lon], { radius: radiusM, color: "#4f8fbf", weight: 2, fillOpacity: 0.08 }).addTo(map);
      const layers = [circle];
      for (const p of points) layers.push(L.circleMarker([p.lat, p.lon], { radius: 6, color: "#ffffff", weight: 2, fillColor: "#e0902a", fillOpacity: 1 }).bindTooltip(p.label).addTo(map));
      L.circleMarker([lat, lon], { radius: 4, color: "#4f8fbf", fillColor: "#4f8fbf", fillOpacity: 1 }).addTo(map);
      map.fitBounds(L.featureGroup(layers).getBounds().pad(0.25), { maxZoom: 18 });
      setTimeout(() => map?.invalidateSize(), 50);
    }).catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; try { map?.remove(); } catch { /* already gone */ } };
  }, [sig]);
  if (failed) return <div className="rounded-xl bg-soft px-3 py-4 text-xs text-muted">The map could not load. Use Open in Maps below.</div>;
  // "isolate" keeps Leaflet's own layers beneath the bottom tab bar and the + button.
  return <div className="isolate rounded-xl overflow-hidden border border-line"><div ref={ref} style={{ height }} role="img" aria-label="Map of this place" /></div>;
}

export const mapsLink = (lat: number, lon: number, name?: string | null) => `https://maps.apple.com/?ll=${lat},${lon}${name ? `&q=${encodeURIComponent(name)}` : ""}`;
