// The agent's countUnnamed (plain JS, used every 10 min on the Mac mini) must give the same groups as the app's groupStops.
import assert from "node:assert/strict";
import { countUnnamed } from "./location-agent.mjs";
import { groupStops } from "../src/lib/place-candidates.ts";
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const centers = [[40.2855, -111.678], [33.806, -117.915], [40.2969, -111.6946], [37.11, -113.55]];
for (let round = 0; round < 20; round++) {
  const stops = [];
  for (let i = 0; i < 150; i++) {
    const c = centers[Math.floor(rnd() * centers.length)];
    const start = Date.parse("2026-10-20T00:00:00Z") + Math.floor(rnd() * 5 * 86400000), dur = Math.floor(rnd() * 40) * 60000;
    stops.push({ id: "s" + i, started_at: new Date(start).toISOString(), ended_at: new Date(start + dur).toISOString(), lat: c[0] + (rnd() - 0.5) * 0.004, lon: c[1] + (rnd() - 0.5) * 0.004, address: null });
  }
  const a = countUnnamed(stops).sort((x, y) => x - y), b = groupStops(stops).map((g) => g.stops.length).sort((x, y) => x - y);
  assert.deepEqual(a, b, `round ${round}`);
}
console.log("place-groups-parity-test ok");
