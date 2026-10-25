import assert from "node:assert/strict";
import { retentionBefore } from "../scripts/location-agent.mjs";
const cutoff = "2026-10-22T12:00:00.000Z";
// Normal: stops reach well past the cutoff, nothing waiting: delete up to the cutoff.
assert.equal(retentionBefore({ cutoff, oldestRaw: null, lastStopEnd: "2026-10-25T10:00:00+00:00" }), cutoff);
// No stops yet: delete nothing.
assert.equal(retentionBefore({ cutoff, oldestRaw: null, lastStopEnd: null }), null);
// A stalled upload arrives late: unprocessed raw points older than the cutoff hold the line at their start.
assert.equal(retentionBefore({ cutoff, oldestRaw: "2026-10-20T08:00:00+00:00", lastStopEnd: "2026-10-25T10:00:00+00:00" }), "2026-10-20T08:00:00.000Z");
// Processing has not caught up: stops end before the cutoff, so deletion stops there.
assert.equal(retentionBefore({ cutoff, oldestRaw: null, lastStopEnd: "2026-10-21T00:00:00+00:00" }), "2026-10-21T00:00:00.000Z");
// Unprocessed points newer than the cutoff do not matter.
assert.equal(retentionBefore({ cutoff, oldestRaw: "2026-10-24T00:00:00+00:00", lastStopEnd: "2026-10-25T10:00:00+00:00" }), cutoff);
// Garbage in, nothing deleted.
assert.equal(retentionBefore({ cutoff: "nope", oldestRaw: null, lastStopEnd: "2026-10-25T10:00:00+00:00" }), null);
console.log("location-retention-test ok");
