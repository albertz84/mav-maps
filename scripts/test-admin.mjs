#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const Routing = require("../js/routing.js");
const Data = require("../js/data-utils.js");

const nodes = [
  { id: "a", name: "A", lat: 29.7400, lng: -95.4300, level: 0, type: "intersection", accessible: true, visibility: "public" },
  { id: "b", name: "B", lat: 29.7401, lng: -95.4300, level: 0, type: "intersection", accessible: true, visibility: "public" },
  { id: "c", name: "C", lat: 29.7402, lng: -95.4300, level: 0, type: "entrance", accessible: true, visibility: "public" },
  { id: "d", name: "D", lat: 29.7401, lng: -95.4301, level: 1, type: "elevator", accessible: true, visibility: "public" },
  { id: "isolated", name: "Isolated", lat: 29.7410, lng: -95.4310, level: 0, type: "other", accessible: true, visibility: "public", intentionallyIsolated: true }
];

function edge(id, from, to, lengthMeters, extra = {}) {
  const start = nodes.find((node) => node.id === from);
  const end = nodes.find((node) => node.id === to);
  return {
    id, from, to, name: id, type: "walkway", bidirectional: true, accessible: true,
    visibility: "public", status: "open", lengthMeters,
    geometry: [{ lat: start.lat, lng: start.lng }, { lat: end.lat, lng: end.lng }],
    instructionForward: `forward ${id}`, instructionReverse: `reverse ${id}`,
    ...extra
  };
}

const network = {
  version: 1,
  nodes,
  edges: [
    edge("ab", "a", "b", 10),
    edge("bc", "b", "c", 10),
    edge("ac-long", "a", "c", 35),
    edge("bd-stairs", "b", "d", 4, { type: "stairs", accessible: false }),
    edge("cd-elevator", "c", "d", 12, { type: "elevator" })
  ]
};

const shortest = Routing.dijkstra(network, "a", "c");
assert.equal(shortest.ok, true);
assert.deepEqual(shortest.edgeIds, ["ab", "bc"]);
assert.equal(shortest.totalDistance, 20);
assert.deepEqual(shortest.nodeIds, ["a", "b", "c"]);

const reverse = Routing.dijkstra(network, "c", "a");
assert.equal(reverse.ok, true);
assert.deepEqual(reverse.edgeIds, ["bc", "ab"]);
assert.deepEqual(reverse.geometry[0], network.edges[1].geometry[1]);
assert.equal(reverse.instructions[0].instruction, "reverse bc");

const oneWayNetwork = Data.clone(network);
oneWayNetwork.edges.find((item) => item.id === "ab").bidirectional = false;
oneWayNetwork.edges.find((item) => item.id === "ac-long").status = "closed";
assert.equal(Routing.dijkstra(oneWayNetwork, "a", "c").ok, true);
assert.equal(Routing.dijkstra(oneWayNetwork, "c", "a").ok, false, "one-way edge must not be traversed backward");

const closedNetwork = Data.clone(network);
closedNetwork.edges.forEach((item) => { if (["bc", "ac-long", "cd-elevator"].includes(item.id)) item.status = "closed"; });
assert.equal(Routing.dijkstra(closedNetwork, "a", "c").ok, false, "closed edges must be excluded");

const normalStairs = Routing.dijkstra(network, "a", "d");
assert.deepEqual(normalStairs.edgeIds, ["ab", "bd-stairs"]);
const accessible = Routing.dijkstra(network, "a", "d", { accessibleOnly: true });
assert.deepEqual(accessible.edgeIds, ["ab", "bc", "cd-elevator"]);

const noRoute = Routing.dijkstra(network, "a", "isolated");
assert.equal(noRoute.ok, false);
assert.match(noRoute.error, /No route/);

const weighted = Data.clone(network);
weighted.edges.find((item) => item.id === "ab").costMultiplier = 10;
assert.deepEqual(Routing.dijkstra(weighted, "a", "c").edgeIds, ["ac-long"]);

assert.ok(Data.polylineLength(network.edges[0].geometry) > 10);
assert.ok(Data.pointToSegmentMeters(nodes[1], nodes[0], nodes[2]).distance < 0.05);

const invalidLocations = [{ id: 1, name: "Broken", category: "facility", building: "Test", lat: 29.74, lng: -95.43, tags: [], parentId: 999, destinationNodeId: "missing" }];
const validation = Data.validateEditorData(invalidLocations, network);
assert.ok(validation.errors >= 2);
assert.ok(validation.issues.some((item) => item.code === "location-parent"));
assert.ok(validation.issues.some((item) => item.code === "location-node"));

const stable = Data.stableNetwork({ version: 1, nodes: [nodes[1], nodes[0]], edges: [network.edges[1], network.edges[0]] });
assert.deepEqual(stable.nodes.map((item) => item.id), ["a", "b"]);
assert.deepEqual(stable.edges.map((item) => item.id), ["ab", "bc"]);
assert.deepEqual(JSON.parse(JSON.stringify(stable)), stable, "exported network must round-trip without data loss");

const locations = JSON.parse(await readFile(new URL("../data/locations.json", import.meta.url), "utf8"));
const routingFile = JSON.parse(await readFile(new URL("../data/routing-network.json", import.meta.url), "utf8"));
assert.ok(Array.isArray(locations) && locations.length > 0);
assert.deepEqual(Data.normalizeNetwork(routingFile), { version: 1, nodes: [], edges: [] });

console.log("✓ Dijkstra shortest-path, reverse geometry, and instructions");
console.log("✓ One-way, closed-edge, accessible, stairs, and no-route behavior");
console.log("✓ Cost multipliers, geometry helpers, validation, and JSON round-trip");
console.log(`✓ Admin source data loads ${locations.length} locations and an empty non-fabricated route network`);
