(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MavRouting = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function buildAdjacency(network, options = {}) {
    const accessibleOnly = Boolean(options.accessibleOnly);
    const nodes = new Map((network?.nodes || []).map((node) => [String(node.id), node]));
    const adjacency = new Map([...nodes.keys()].map((id) => [id, []]));

    for (const edge of network?.edges || []) {
      const from = String(edge.from);
      const to = String(edge.to);
      if (!nodes.has(from) || !nodes.has(to) || edge.status === "closed") continue;
      if (accessibleOnly && (edge.accessible === false || edge.type === "stairs")) continue;

      const length = Number(edge.lengthMeters);
      const multiplier = Number(edge.costMultiplier ?? 1);
      if (!Number.isFinite(length) || length < 0 || !Number.isFinite(multiplier) || multiplier <= 0) {
        continue;
      }

      adjacency.get(from).push({
        nodeId: to,
        edgeId: String(edge.id),
        weight: length * multiplier,
        forward: true
      });
      if (edge.bidirectional !== false) {
        adjacency.get(to).push({
          nodeId: from,
          edgeId: String(edge.id),
          weight: length * multiplier,
          forward: false
        });
      }
    }
    return { nodes, adjacency };
  }

  function dijkstra(network, startId, destinationId, options = {}) {
    const start = String(startId ?? "");
    const destination = String(destinationId ?? "");
    const { nodes, adjacency } = buildAdjacency(network, options);
    if (!nodes.has(start)) return { ok: false, error: `Start node “${start}” does not exist.` };
    if (!nodes.has(destination)) {
      return { ok: false, error: `Destination node “${destination}” does not exist.` };
    }
    if (start === destination) {
      return { ok: true, nodeIds: [start], edgeIds: [], traversals: [], totalDistance: 0, geometry: [] };
    }

    const distances = new Map([...nodes.keys()].map((id) => [id, Infinity]));
    const previous = new Map();
    const unvisited = new Set(nodes.keys());
    distances.set(start, 0);

    while (unvisited.size) {
      let current = null;
      let currentDistance = Infinity;
      for (const nodeId of unvisited) {
        const distance = distances.get(nodeId);
        if (distance < currentDistance) {
          current = nodeId;
          currentDistance = distance;
        }
      }
      if (current === null || !Number.isFinite(currentDistance)) break;
      unvisited.delete(current);
      if (current === destination) break;

      for (const step of adjacency.get(current) || []) {
        if (!unvisited.has(step.nodeId)) continue;
        const candidate = currentDistance + step.weight;
        if (candidate < distances.get(step.nodeId)) {
          distances.set(step.nodeId, candidate);
          previous.set(step.nodeId, { previousNodeId: current, ...step });
        }
      }
    }

    if (!previous.has(destination)) {
      return { ok: false, error: "No route exists between those endpoints." };
    }

    const traversals = [];
    const nodeIds = [destination];
    let cursor = destination;
    while (cursor !== start) {
      const step = previous.get(cursor);
      if (!step) return { ok: false, error: "The route graph is internally inconsistent." };
      traversals.push({ edgeId: step.edgeId, from: step.previousNodeId, to: cursor, forward: step.forward });
      cursor = step.previousNodeId;
      nodeIds.push(cursor);
    }
    traversals.reverse();
    nodeIds.reverse();

    const edgeMap = new Map((network.edges || []).map((edge) => [String(edge.id), edge]));
    const geometry = [];
    let totalDistance = 0;
    const instructions = [];
    traversals.forEach((traversal, index) => {
      const edge = edgeMap.get(traversal.edgeId);
      const points = (edge.geometry || []).map((point) => ({ lat: point.lat, lng: point.lng }));
      if (!traversal.forward) points.reverse();
      if (index > 0) points.shift();
      geometry.push(...points);
      totalDistance += Number(edge.lengthMeters) || 0;
      instructions.push({
        edgeId: traversal.edgeId,
        name: edge.name || traversal.edgeId,
        instruction: traversal.forward ? edge.instructionForward || "" : edge.instructionReverse || "",
        distanceMeters: Number(edge.lengthMeters) || 0,
        forward: traversal.forward
      });
    });

    return {
      ok: true,
      nodeIds,
      edgeIds: traversals.map((item) => item.edgeId),
      traversals,
      instructions,
      totalDistance,
      weightedCost: distances.get(destination),
      geometry
    };
  }

  return { buildAdjacency, dijkstra };
});
