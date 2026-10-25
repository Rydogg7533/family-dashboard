import assert from "node:assert/strict";
import { buildCandidates, groupStops, suggestName, checkPlaceName, mapName, normName, sameBusiness, cityOf, contactSuggestion, eventsForPlaces } from "../src/lib/place-candidates.ts";
// Denver is UTC-6 in October (MDT). 2026-10-22 18:00Z = 12:00 local.
const mk = (id, startZ, mins, lat = 40.2969, lon = -111.6946, address = null) => ({ id, started_at: startZ, ended_at: new Date(Date.parse(startZ) + mins * 60000).toISOString(), lat, lon, address });
const a = mk("a", "2026-10-22T18:00:00Z", 30, 40.2969, -111.6946, "800 N State St, Orem");
const b = mk("b", "2026-10-24T19:00:00Z", 45, 40.29695, -111.69455, "800 N State St, Orem");
const far = mk("c", "2026-10-22T20:00:00Z", 20, 40.31, -111.70);
const short = mk("d", "2026-10-22T21:00:00Z", 3);
assert.equal(groupStops([a, b, far, short]).length, 2);
const c = buildCandidates([a, b, far, short], [], []);
assert.equal(c.length, 2); assert.equal(c[0].visits, 2); assert.equal(c[0].minutes, 75);
assert.ok(!c.some((x) => x.ids.includes("d")));

// Loose matching of vendor and map names.
assert.equal(normName("Panda Express #0539"), "panda express");
assert.equal(normName("The Home Depot, Inc."), "home depot");
assert.ok(sameBusiness("Panda Express #0539", "Panda Express"));
assert.ok(sameBusiness("THE HOME DEPOT #4710", "Home Depot"));
assert.ok(sameBusiness("Wal-Mart", "Walmart Supercenter"));
assert.ok(sameBusiness("Costco Wholesale #123", "Costco"));
assert.ok(!sameBusiness("AAA California Roadside Service", "Panda Express"));
assert.ok(!sameBusiness("Express Oil Change", "Panda Express"));       // "express" is generic
assert.ok(!sameBusiness("Taco Bell", "Bell Tower Park"));               // "bell" is under 4 letters
assert.ok(!sameBusiness(null, "Costco"));
assert.ok(sameBusiness("Chevron", "Chevron"));                          // short brands match exactly

// A receipt alone never names a place any more; it only backs up the map's name.
assert.equal(suggestName([a], [{ merchant: "Home Depot", date: "2026-10-22" }], []), null);
const hd = mk("h", "2026-10-22T18:00:00Z", 30, 40.2969, -111.6946, "The Home Depot, 800 N State St, Orem");
const r1 = suggestName([hd], [{ merchant: "HOME DEPOT #4710", date: "2026-10-22" }], []);
assert.equal(r1.name, "The Home Depot"); assert.match(r1.reason, /receipt/);
const r2 = suggestName([hd], [{ merchant: "AAA Roadside", date: "2026-10-22" }], []);
assert.equal(r2.name, "The Home Depot"); assert.match(r2.reason, /OpenStreetMap/); assert.ok(!/receipt/.test(r2.reason));

// Calendar wins.
const ev = [{ date: "2026-10-22", start_time: "11:30:00", end_time: "12:45:00", title: "Dentist", place: null }];
assert.equal(suggestName([a], [], ev).name, "Dentist");                                    // street-only spot: the calendar names it
assert.match(suggestName([hd], [], ev).reason, /OpenStreetMap/);                          // the map says Home Depot, the plan said Dentist: the calendar does not name it

// Home: needs 3 overnight stays, no existing Home, and not a hotel.
const n = (i) => mk("n" + i, `2026-10-${20 + i}T06:00:00Z`, 600);   // 00:00-10:00 local, covers 3 am
assert.equal(suggestName([mk("x", "2026-10-21T04:00:00Z", 1500), mk("y", "2026-10-22T04:00:00Z", 1500), mk("z", "2026-10-23T04:00:00Z", 1500)], [], []).name, "Home");   // 22:00 evening to next evening also counts
assert.equal(suggestName([n(1), n(2)], [], []), null);
assert.equal(suggestName([n(1), n(2), n(3)], [], []).name, "Home");
assert.equal(suggestName([n(1), n(2), n(3)], [], [], { hasHome: true }), null);
const hotel = (i) => mk("o" + i, `2026-10-${20 + i}T06:00:00Z`, 600, 40.2969, -111.6946, "800 N State St, Anaheim Hotel, Anaheim");
assert.equal(suggestName([hotel(1), hotel(2), hotel(3)], [], []), null);

// Same name elsewhere gets the city.
const pe = mk("p", "2026-10-22T18:00:00Z", 30, 40.2969, -111.6946, "Peet's Coffee, 800 N State St, Orem");
assert.equal(suggestName([pe], [], []).name, "Peet's Coffee");
const named = [{ name: "Peet's Coffee", lat: 33.6, lon: -117.7 }];
assert.equal(suggestName([pe], [], [], { named, lat: 40.2969, lon: -111.6946 }).name, "Peet's Coffee (Orem)");
const near = [{ name: "Peet's Coffee", lat: 40.2970, lon: -111.6946 }];
assert.equal(suggestName([pe], [], [], { named: near, lat: 40.2969, lon: -111.6946 }).name, "Peet's Coffee");   // same spot, no suffix
assert.equal(cityOf("Peet's Coffee, 800 N State St, Orem"), "Orem");

// Map name basics.
assert.equal(mapName("800 N State St, Orem"), null);
assert.equal(mapName("Veterans Memorial Highway, Orem"), null);
assert.equal(mapName(null), null);
assert.equal(suggestName([a], [], []), null);
assert.equal(checkPlaceName("  Costco  ").value, "Costco"); assert.equal(checkPlaceName("").ok, false); assert.equal(checkPlaceName("x".repeat(61)).ok, false);

// A day at many spots: an unrelated receipt names none of them.
const many = [mk("m1", "2026-10-20T16:00:00Z", 20, 40.30, -111.70), mk("m2", "2026-10-20T18:00:00Z", 20, 40.31, -111.71), mk("m3", "2026-10-20T20:00:00Z", 20, 40.32, -111.72)];
const cs = buildCandidates(many, [{ merchant: "AAA California Roadside Service", date: "2026-10-20" }], []);
assert.ok(cs.every((x) => x.suggestion === null));

// Contact addresses.
const house = mk("k1", "2026-10-22T18:00:00Z", 30, 40.2000, -111.6000, "Family Center Drive, Orem");   // street-only in the map
const sarah = { cardId: "c1", name: "Sarah Smith", lastName: "Smith", org: null, label: "home", lat: 40.20010, lon: -111.60005, address: "315 E Juanita, Glendora, CA 91741", validUntil: null };
const rs = suggestName([house], [], [], { contacts: [sarah], lat: 40.2000, lon: -111.6000 });
assert.equal(rs.name, "Sarah Smith's home"); assert.match(rs.reason, /contact card/);
assert.equal(suggestName([house], [], [], { contacts: [{ ...sarah, lat: 40.2010 }], lat: 40.2000, lon: -111.6000 }), null);          // ~110 m away: no match
const old = { ...sarah, validUntil: "2026-10-23T00:00:00Z" };                                                                       // closed after the visit
assert.match(suggestName([house], [], [], { contacts: [old], lat: 40.2000, lon: -111.6000 }).reason, /older address/);
const later = mk("k2", "2026-10-25T18:00:00Z", 30, 40.2000, -111.6000, null);                                                         // visit after the address was closed
assert.equal(suggestName([later], [], [], { contacts: [old], lat: 40.2000, lon: -111.6000 }), null);
const work = { ...sarah, label: "work", org: "Acme Dental" };
assert.equal(contactSuggestion([house], [work], 40.2000, -111.6000).name, "Acme Dental");
const tom = { ...sarah, cardId: "c2", name: "Tom Smith" };
assert.equal(contactSuggestion([house], [sarah, tom], 40.2000, -111.6000).name, "Smith family home");
const bob = { ...sarah, cardId: "c3", name: "Bob Jones", lastName: "Jones" };
assert.equal(contactSuggestion([house], [sarah, bob], 40.2000, -111.6000), null);                                                   // different families at one address: ambiguous
assert.equal(contactSuggestion([house], [sarah, { ...sarah }], 40.2000, -111.6000).name, "Sarah Smith's home");                    // two rows, one card
// A contact outranks the map name; the calendar outranks a contact.
const pe2 = { ...pe, lat: 40.2000, lon: -111.6000 };
assert.equal(suggestName([pe2], [], [], { contacts: [sarah], lat: 40.2000, lon: -111.6000 }).name, "Sarah Smith's home");
const ev2 = [{ date: "2026-10-22", start_time: "11:30:00", end_time: "12:45:00", title: "Dentist", place: null }];
assert.equal(suggestName([house], [], ev2, { contacts: [sarah], lat: 40.2000, lon: -111.6000 }).name, "Dentist");
const ev3 = [{ date: "2026-10-22", start_time: "11:30", end_time: "12:45", title: "Lunch", place: "Home Depot" }];
assert.equal(suggestName([hd], [], ev3).name, "Home Depot");                                // plan and map agree

// Google events to the shape the rules read.
const g = (o) => ({ title: "Dentist", location: null, allDay: false, date: "2026-10-22", endDate: "2026-10-22", start: "14:00", end: "15:00", attendees: [], ...o });
assert.equal(eventsForPlaces([g({})]).length, 1);
assert.equal(eventsForPlaces([g({ allDay: true })]).length, 0);
assert.equal(eventsForPlaces([g({ endDate: "2026-10-24" })]).length, 0);                                    // multi-day (a trip)
assert.equal(eventsForPlaces([g({ title: "Focus time" })]).length, 0);
assert.equal(eventsForPlaces([g({ title: "Standup", location: "https://zoom.us/j/1" })]).length, 0);
assert.equal(eventsForPlaces([g({ title: "Call with Sam" })]).length, 0);
assert.equal(eventsForPlaces([g({ attendees: [{ email: "me@x.com", status: "declined" }] })], "me@x.com").length, 0);
assert.equal(eventsForPlaces([g({ attendees: [{ email: "me@x.com", status: "accepted" }] })], "me@x.com").length, 1);
assert.equal(eventsForPlaces([g({ title: "Soccer", location: "Orem Rec Center, 500 N State St" })])[0].place, "Orem Rec Center");
assert.equal(eventsForPlaces([g({ title: "Soccer", location: "500 N State St, Orem" })])[0].place, null);   // an address is not a name; the title is used
console.log("place-candidates-test ok");
