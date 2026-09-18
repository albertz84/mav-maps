import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Data = require("../js/data-utils.js");
const Routing = require("../js/routing.js");
const point = (x, y) => ({ lat: 29.74 + y / 111320, lng: -95.43 + x / (111320 * Math.cos(29.74 * Math.PI / 180)) });
const node = (id, x, y, level = 0) => ({ id, name: id, ...point(x, y), level, visibility: "community" });
function edge(id, a, b, extra = {}) {
  const geometry = [point(0, 0), point(0, 0)];
  geometry[0] = { lat: a.lat, lng: a.lng };
  geometry[1] = { lat: b.lat, lng: b.lng };
  return { id, from: a.id, to: b.id, type: "walkway", status: "open", visibility: "community",
    accessible: true, bidirectional: true, geometry, lengthMeters: Data.polylineLength(geometry), ...extra };
}
function crossing(extra = {}, level = 0) {
  const nodes = [node("a", -10, 0), node("b", 10, 0), node("c", 0, -10, level), node("d", 0, 10, level)];
  return { version: 1, nodes, edges: [edge("ab", nodes[0], nodes[1]), edge("cd", nodes[2], nodes[3], extra)] };
}
const graph = crossing({ bidirectional: false, instructionForward: "Continue" });
assert.equal(Routing.dijkstra(graph, "a", "d").ok, false);
Data.connectNearbyPaths(graph);
assert.equal(graph.nodes.length, 5);
assert.equal(graph.edges.length, 4);
assert.equal(Routing.dijkstra(graph, "a", "d").ok, true);
assert.equal(Routing.dijkstra(graph, "d", "a").ok, false);
assert.ok(graph.edges.filter((e) => e.instructionForward === "Continue").length === 2);
const saved = JSON.stringify(graph);
Data.connectNearbyPaths(graph);
assert.equal(JSON.stringify(graph), saved, "repair is idempotent");
for (const isolated of [crossing({ type: "tunnel" }), crossing({}, 1), crossing({ status: "closed" }), crossing({ visibility: "staff" })]) {
  Data.connectNearbyPaths(isolated);
  assert.equal(Routing.dijkstra(isolated, "a", "d").ok, false);
}
const near = crossing();
Object.assign(near.nodes[2], point(0, 1));
near.edges[1] = edge("cd", near.nodes[2], near.nodes[3]);
Data.connectNearbyPaths(near);
assert.equal(Routing.dijkstra(near, "a", "d").ok, true, "T endpoint one meter off path");
const ends = crossing();
Object.assign(ends.nodes[2], point(10, 1));
ends.edges[1] = edge("cd", ends.nodes[2], ends.nodes[3]);
const locations = [{ destinationNodeId: "c" }];
Data.connectNearbyPaths(ends, locations);
assert.equal(locations[0].destinationNodeId, "b");
assert.equal(Routing.dijkstra(ends, "a", "d").ok, true);
for (const g of [graph, near, ends]) for (const e of g.edges) {
  assert.ok(e.lengthMeters > 0);
  for (const [id, p] of [[e.from, e.geometry[0]], [e.to, e.geometry.at(-1)]]) {
    assert.ok(Data.haversineMeters(g.nodes.find((n) => n.id === id), p) < 0.001);
  }
}
console.log("✓ Crossings, near misses, merged assignments, one-way metadata, level/type/access exclusions, endpoints and idempotence");
