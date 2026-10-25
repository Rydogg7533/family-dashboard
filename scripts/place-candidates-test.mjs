import assert from "node:assert/strict";
import { buildCandidates, groupStops, suggestName, checkPlaceName, mapName } from "../src/lib/place-candidates.ts";
// Denver is UTC-6 in October (MDT). 2026-10-22 18:00Z = 12:00 local.
const mk = (id, startZ, mins, lat = 40.2969, lon = -111.6946, address = null) => ({ id, started_at: startZ, ended_at: new Date(Date.parse(startZ) + mins * 60000).toISOString(), lat, lon, address });
const a = mk("a", "2026-10-22T18:00:00Z", 30, 40.2969, -111.6946, "800 N State St, Orem");
const b = mk("b", "2026-10-24T19:00:00Z", 45, 40.29695, -111.69455, "800 N State St, Orem");   // ~7 m away: same place
const far = mk("c", "2026-10-22T20:00:00Z", 20, 40.31, -111.70);                                   // ~1.6 km: different place
const short = mk("d", "2026-10-22T21:00:00Z", 3);                                                  // under 8 min: a pause, never a place
const groups = groupStops([a, b, far, short]);
assert.equal(groups.length, 2); assert.equal(groups[0].stops.length, 2);
const c = buildCandidates([a, b, far, short], [], []);
assert.equal(c.length, 2); assert.equal(c[0].visits, 2); assert.equal(c[0].address, "800 N State St, Orem"); assert.equal(c[0].minutes, 75);
assert.ok(!c.some((x) => x.ids.includes("d")));
// A receipt on a visit day names it; two different merchants on visit days do not.
assert.deepEqual(suggestName([a], [{ merchant: "Home Depot", date: "2026-10-22" }], []).name, "Home Depot");
assert.equal(suggestName([a, b], [{ merchant: "Home Depot", date: "2026-10-22" }, { merchant: "Costco", date: "2026-10-24" }], []), null);
assert.equal(suggestName([a], [{ merchant: "Costco", date: "2026-10-01" }], []), null);               // not a visit day
assert.equal(suggestName([a], [{ merchant: "Home Depot", date: "2026-10-22" }, { merchant: "home depot", date: "2026-10-22" }], []).name.toLowerCase(), "home depot"); // same merchant twice is one
// A calendar event overlapping the visit wins over a receipt.
const ev = [{ date: "2026-10-22", start_time: "11:30:00", end_time: "12:45:00", title: "Dentist", place: null }];
assert.equal(suggestName([a], [{ merchant: "Home Depot", date: "2026-10-22" }], ev).name, "Dentist");
// Home is offered only with two overnight stays; one is not enough.
const n1 = mk("n1", "2026-10-21T06:00:00Z", 600), n2 = mk("n2", "2026-10-22T06:00:00Z", 600);   // 00:00-10:00 local
assert.equal(suggestName([n1], [], null ?? []), null);
assert.equal(suggestName([n1, n2], [], []).name, "Home");
assert.equal(checkPlaceName("  Costco  ").value, "Costco"); assert.equal(checkPlaceName("").ok, false); assert.equal(checkPlaceName("x".repeat(61)).ok, false);
// OpenStreetMap's name from the stored address: a business or landmark, never a house number or a bare street.
assert.equal(mapName("Peet's Coffee, 800 N State St, Orem, Utah"), "Peet's Coffee");
assert.equal(mapName("800 N State St, Orem"), null);
assert.equal(mapName("Veterans Memorial Highway, Orem"), null);
assert.equal(mapName("Family Center Drive, Orem"), null);
assert.equal(mapName("San Clemente Beach Trail, San Clemente"), "San Clemente Beach Trail");
assert.equal(mapName(null), null);
const pe = mk("p", "2026-10-22T18:00:00Z", 30, 40.2969, -111.6946, "Peet's Coffee, 800 N State St, Orem");
assert.equal(suggestName([pe], [], []).name, "Peet's Coffee");
assert.match(suggestName([pe], [], []).reason, /OpenStreetMap/);
assert.equal(suggestName([pe], [{ merchant: "Home Depot", date: "2026-10-22" }], []).name, "Home Depot");   // a receipt outranks the map name
assert.equal(suggestName([a], [], []), null);   // address is a street only: no suggestion
// A receipt cannot name every place visited that day: a day at many spots offers no receipt name unless the map's name for the spot agrees.
const many = [mk("m1", "2026-10-20T16:00:00Z", 20, 40.30, -111.70), mk("m2", "2026-10-20T18:00:00Z", 20, 40.31, -111.71), mk("m3", "2026-10-20T20:00:00Z", 20, 40.32, -111.72)];
const aaa = [{ merchant: "AAA California Roadside Service", date: "2026-10-20" }];
const cs = buildCandidates(many, aaa, []);
assert.equal(cs.length, 3); assert.ok(cs.every((x) => x.suggestion === null));          // three spots that day: no receipt name
const panda = [{ merchant: "Panda Express #0539", date: "2026-10-20" }];
const withName = [{ ...many[0], address: "Panda Express, 100 Main St, Orem" }, many[1], many[2]];
const c2 = buildCandidates(withName, panda, []);
assert.equal(c2.find((x) => x.ids.includes("m1")).suggestion.name, "Panda Express #0539");   // both agree
assert.equal(c2.find((x) => x.ids.includes("m2")).suggestion, null);                         // the other spots stay unnamed
// One or two spots that day and one merchant: still offered.
assert.equal(buildCandidates([many[0]], panda, [])[0].suggestion.name, "Panda Express #0539");
console.log("place-candidates-test ok");
