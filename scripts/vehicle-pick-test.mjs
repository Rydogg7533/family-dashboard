// The vehicle pick is used before the paper's hint, by both the planner and the filing step.
import assert from "node:assert/strict";
import { matchVehicle, vehicleFor } from "../src/lib/match-vehicle.ts";
const vs = [
  { id: "1", name: "2018 Toyota Sienna", short: "Sienna", make: "Toyota", model: "Sienna", year: 2018, details: null },
  { id: "2", name: "2020 Ford F-150", short: "F-150", make: "Ford", model: "F-150", year: 2020, details: null },
];
assert.equal(matchVehicle("2018 Toyota Sienna", vs)?.id, "1");
assert.equal(matchVehicle("2020 Ford F-150", vs)?.id, "2");
const pick = "2020 Ford F-150", hint = "Sienna";
assert.equal(vehicleFor(pick ?? hint, "Yes, file it", vs)?.id, "2");   // the pick wins over the paper's hint
assert.equal(vehicleFor(null ?? hint, "Yes, file it", vs)?.id, "1");   // no pick: the hint
assert.equal(vehicleFor(null, "Yes, file it", vs), null);              // neither: still asks
console.log("vehicle-pick-test ok");
