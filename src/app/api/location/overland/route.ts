// Overland (iOS) → the person's own private location rows (F3). Slice C.
//
// Overland posts batches of GeoJSON points:
//   {"locations":[{"type":"Feature","geometry":{"type":"Point","coordinates":[lon,lat]},
//                  "properties":{"timestamp":"2026-10-18T14:02:11Z","speed":0,"motion":["stationary"],
//                                "battery_level":0.82,"horizontal_accuracy":10,"altitude":1400,...}}],
//    "current": {...}, "trip": {...}}
// and expects {"result":"ok"} back (anything else makes it retry the batch).
//
// Auth: "Authorization: Bearer <token>" where <token> is a per-person row in device_tokens (kind='overland').
// The row names the person, so the points are inserted with person = that profile id and never anyone else's.
// Sample mode (no Supabase env): any token is accepted and the batch is logged, nothing stored.
// Raw points are kept 30 days (see migration 0004 and scripts/location-agent.md), then only learned Places remain.
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type OverlandPoint = { geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> };
type OverlandBody = { locations?: OverlandPoint[] };

function hasServiceEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!token) return NextResponse.json({ result: "error", error: "missing bearer token" }, { status: 401 });

  let body: OverlandBody;
  try { body = (await req.json()) as OverlandBody; } catch { return NextResponse.json({ result: "error", error: "bad json" }, { status: 400 }); }
  const points = Array.isArray(body.locations) ? body.locations : [];

  const rows = points.flatMap((p) => {
    const c = p.geometry?.coordinates; const pr = p.properties ?? {};
    if (!c || c.length < 2 || typeof pr.timestamp !== "string") return [];
    const motion = Array.isArray(pr.motion) ? (pr.motion as string[]) : [];
    return [{
      recorded_at: pr.timestamp as string, lon: Number(c[0]), lat: Number(c[1]),
      accuracy_m: typeof pr.horizontal_accuracy === "number" ? pr.horizontal_accuracy : null,
      speed: typeof pr.speed === "number" ? pr.speed : null,
      motion, battery: typeof pr.battery_level === "number" ? pr.battery_level : null,
      source: "overland",
    }];
  });

  if (!hasServiceEnv()) {
    // Sample mode: accept anything, log the shape, store nothing.
    console.log(`[overland] sample mode · token ${token.slice(0, 4)}… · ${rows.length} point(s) · ${rows[0]?.recorded_at ?? "-"} → ${rows.at(-1)?.recorded_at ?? "-"}`);
    return NextResponse.json({ result: "ok", sample: true, received: rows.length });
  }

  // Service role: the token row decides the person; RLS keeps browsers out of other people's rows.
  const sb = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: tok } = await sb.from("device_tokens").select("id, person, revoked_at").eq("kind", "overland").eq("token", token).maybeSingle();
  if (!tok || tok.revoked_at) return NextResponse.json({ result: "error", error: "unknown or revoked token" }, { status: 403 });

  if (rows.length) {
    const { error } = await sb.from("locations").insert(rows.map((r) => ({ ...r, person: tok.person, status: "raw" })));
    if (error) return NextResponse.json({ result: "error", error: error.message }, { status: 500 });
  }
  await sb.from("device_tokens").update({ last_seen_at: new Date().toISOString() }).eq("id", tok.id);
  await sb.from("system_status").upsert({ key: "sync_location", state: "ok", summary: `Overland: ${rows.length} points received`, updated_at: new Date().toISOString() }).then(() => {}, () => {});
  return NextResponse.json({ result: "ok", received: rows.length });
}

export async function GET() {
  return NextResponse.json({ result: "ok", endpoint: "POST Overland batches here with Authorization: Bearer <device token>" });
}
