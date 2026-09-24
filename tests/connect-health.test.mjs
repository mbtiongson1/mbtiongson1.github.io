import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/demos/connect-health/connect-health.js", import.meta.url), "utf8");
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "connect-health.js" });
const api = sandbox.ConnectHealth;
assert.ok(api, "the browser script exposes a pure test surface");

const fixture = [
  {
    id: "g001", campus: "campus-01", age: "Adults", location: "Home Connect", locality: "locality-01", day: "Monday",
    collecting: false, members: 22, leaders: 0, capacity: 30, openSeats: 8, attendance: [],
  },
  {
    id: "g002", campus: "campus-02", age: "Youth", location: "Cafe", locality: "locality-02", day: "Saturday",
    collecting: false, members: 20, leaders: 1, capacity: 24, openSeats: 4,
    attendance: [{ week: "2026-08-16", state: "recorded", attendance: 1 }, { week: "2026-08-23", state: "recorded", attendance: 1 }],
  },
  {
    id: "g003", campus: "campus-01", age: "Young Adults", location: "Home Connect", locality: "locality-01", day: "Friday",
    collecting: false, members: 20, leaders: 2, capacity: 24, openSeats: 4,
    attendance: [{ week: "2026-08-16", state: "not-logged", attendance: 0 }, { week: "2026-08-23", state: "not-logged", attendance: 0 }],
  },
  {
    id: "g004", campus: "campus-02", age: "Seasoned", location: "Home Connect", locality: "locality-03", day: "Tuesday",
    collecting: false, members: 8, leaders: 2, capacity: null, openSeats: null, attendance: [],
  },
  {
    id: "g005", campus: "campus-02", age: "Adults", location: "Cafe", locality: "locality-03", day: "Thursday",
    collecting: true, members: 8, leaders: 2, capacity: 12, openSeats: 4,
    attendance: [{ week: "2026-08-23", state: "recorded", attendance: 1 }],
  },
].map(api.deriveGroup);

assert.deepEqual(fixture.map((group) => group.health.band), ["critical", "thin", "thin", "unknown", "watch"]);
assert.equal(api.filterGroups(fixture, { campus: "campus-01" }).length, 2, "campus filters narrow the same dataset");
assert.equal(api.filterGroups(fixture, { health: "thin" }).length, 2, "health filters use recomputed health bands");
assert.equal(api.filterGroups(fixture, { campus: "campus-02", meeting: "Cafe" }).length, 2, "multiple filters compose");
assert.equal(api.filterGroups(fixture, {}, "g003")[0].id, "g003", "group focus narrows to one local record");
assert.equal(api.sortQueue(fixture)[0].id, "g001", "the unled group leads the local queue");

assert.equal(JSON.stringify(api.modeState("creative")), JSON.stringify({ mode: "creative", creativeVisible: true, classicVisible: false }));
assert.equal(JSON.stringify(api.modeState("classic")), JSON.stringify({ mode: "classic", creativeVisible: false, classicVisible: true }));
assert.equal(JSON.stringify(api.modeState("unexpected")), JSON.stringify({ mode: "creative", creativeVisible: true, classicVisible: false }));

console.log("connect-health filters, focus, queue, and mode selection: ok");
