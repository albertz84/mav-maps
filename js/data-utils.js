(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MavDataUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CAMPUS_BOUNDS = { north: 29.748, south: 29.734, east: -95.422, west: -95.44 };
  const CATEGORIES = ["classroom", "restroom", "office", "facility", "sports", "parking", "dining"];
  const ACCESS_VISIBILITIES = ["public", "community", "staff", "hidden"];
  const MARKER_MODES = ["always", "zoom-dependent", "search-only", "event-only", "hidden"];
  const NODE_TYPES = [
    "intersection", "bend", "entrance", "gate", "crosswalk", "tunnel-entrance",
    "tunnel-exit", "stairs", "elevator", "room", "landmark", "other"
  ];
  const EDGE_TYPES = [
    "walkway", "sidewalk", "crosswalk", "tunnel", "corridor", "stairs",
    "elevator", "parking-path", "ramp", "other"
  ];
  const EDGE_STATUSES = ["open", "closed", "restricted"];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function inCampusBounds(point) {
    return Number.isFinite(point?.lat) && Number.isFinite(point?.lng) &&
      point.lat >= CAMPUS_BOUNDS.south && point.lat <= CAMPUS_BOUNDS.north &&
      point.lng >= CAMPUS_BOUNDS.west && point.lng <= CAMPUS_BOUNDS.east;
  }

  function haversineMeters(a, b) {
    const radius = 6371008.8;
    const radians = (degrees) => (degrees * Math.PI) / 180;
    const dLat = radians(b.lat - a.lat);
    const dLng = radians(b.lng - a.lng);
    const lat1 = radians(a.lat);
    const lat2 = radians(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * radius * Math.asin(Math.sqrt(h));
  }

  function polylineLength(geometry) {
    if (!Array.isArray(geometry) || geometry.length < 2) return 0;
    return geometry.slice(1).reduce((sum, point, index) => sum + haversineMeters(geometry[index], point), 0);
  }

  function toPlanar(point, origin) {
    const latScale = 111320;
    const lngScale = 111320 * Math.cos((origin.lat * Math.PI) / 180);
    return { x: (point.lng - origin.lng) * lngScale, y: (point.lat - origin.lat) * latScale };
  }

  function pointToSegmentMeters(point, start, end) {
    const p = toPlanar(point, point);
    const a = toPlanar(start, point);
    const b = toPlanar(end, point);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const denominator = dx * dx + dy * dy;
    const t = denominator ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / denominator)) : 0;
    const closest = { x: a.x + t * dx, y: a.y + t * dy };
    return { distance: Math.hypot(p.x - closest.x, p.y - closest.y), t };
  }

  function segmentIntersection(a, b, c, d) {
    const origin = a;
    const p = toPlanar(a, origin);
    const p2 = toPlanar(b, origin);
    const q = toPlanar(c, origin);
    const q2 = toPlanar(d, origin);
    const r = { x: p2.x - p.x, y: p2.y - p.y };
    const s = { x: q2.x - q.x, y: q2.y - q.y };
    const cross = (u, v) => u.x * v.y - u.y * v.x;
    const denominator = cross(r, s);
    if (Math.abs(denominator) < 1e-9) return null;
    const qp = { x: q.x - p.x, y: q.y - p.y };
    const t = cross(qp, s) / denominator;
    const u = cross(qp, r) / denominator;
    if (t <= 1e-5 || t >= 0.99999 || u <= 1e-5 || u >= 0.99999) return null;
    return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, t, u };
  }

  function slug(value) {
    return String(value || "item").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 52) || "item";
  }

  function uniqueStringId(prefix, label, records) {
    const existing = new Set(records.map((record) => String(record.id)));
    const base = `${prefix}-${slug(label || "new")}`;
    if (!existing.has(base)) return base;
    let suffix = 2;
    while (existing.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }

  function nextLocationId(locations) {
    return locations.reduce((max, item) => Number.isInteger(Number(item.id)) ? Math.max(max, Number(item.id)) : max, 0) + 1;
  }

  function normalizeLocation(location) {
    const markerDisplay = location.markerDisplay ||
      (location.visibility === null ? "zoom-dependent" : location.visibility) || "zoom-dependent";
    return {
      ...clone(location),
      accessVisibility: location.accessVisibility || "public",
      markerDisplay,
      tags: Array.isArray(location.tags) ? location.tags : [],
      directions: Array.isArray(location.directions) ? location.directions : ["walking"]
    };
  }

  function normalizeNetwork(network) {
    return {
      version: Number(network?.version) || 1,
      nodes: Array.isArray(network?.nodes) ? clone(network.nodes) : [],
      edges: Array.isArray(network?.edges) ? clone(network.edges).map((edge) => ({
        ...edge,
        lengthMeters: Number.isFinite(Number(edge.lengthMeters)) ? Number(edge.lengthMeters) : polylineLength(edge.geometry)
      })) : []
    };
  }

  function issue(severity, code, message, entityType, entityId) {
    return { severity, code, message, entityType, entityId: entityId == null ? null : String(entityId) };
  }

  function connectedComponents(network) {
    const graph = new Map((network.nodes || []).map((node) => [String(node.id), new Set()]));
    (network.edges || []).forEach((edge) => {
      const from = String(edge.from); const to = String(edge.to);
      if (graph.has(from) && graph.has(to) && edge.status !== "closed") {
        graph.get(from).add(to); graph.get(to).add(from);
      }
    });
    const seen = new Set();
    const components = [];
    for (const id of graph.keys()) {
      if (seen.has(id)) continue;
      const component = [];
      const stack = [id]; seen.add(id);
      while (stack.length) {
        const current = stack.pop(); component.push(current);
        for (const neighbor of graph.get(current)) if (!seen.has(neighbor)) { seen.add(neighbor); stack.push(neighbor); }
      }
      components.push(component);
    }
    return components;
  }

  function validateEditorData(locations, rawNetwork) {
    const network = normalizeNetwork(rawNetwork);
    const issues = [];
    const locationIds = new Set();
    const locationMap = new Map();
    for (const location of locations || []) {
      const id = String(location.id ?? "");
      if (!id || !String(location.name || "").trim() || !String(location.category || "").trim()) {
        issues.push(issue("error", "location-required", "Location is missing an ID, name, or category.", "location", id));
      }
      if (locationIds.has(id)) issues.push(issue("error", "location-duplicate-id", `Duplicate location ID: ${id}.`, "location", id));
      locationIds.add(id); locationMap.set(id, location);
      if (!CATEGORIES.includes(location.category)) issues.push(issue("error", "location-category", `Invalid category for ${location.name || id}.`, "location", id));
      if (!Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lng))) {
        issues.push(issue("error", "location-coordinate", `${location.name || id} has invalid coordinates.`, "location", id));
      } else if (!inCampusBounds({ lat: Number(location.lat), lng: Number(location.lng) })) {
        issues.push(issue("warning", "location-bounds", `${location.name || id} is outside the expected campus bounds.`, "location", id));
      }
      if (location.parentId != null && location.parentId !== "" && !locationMap.has(String(location.parentId)) && !(locations || []).some((item) => String(item.id) === String(location.parentId))) {
        issues.push(issue("error", "location-parent", `${location.name || id} references missing parent ${location.parentId}.`, "location", id));
      }
      for (const field of ["arrivalNodeId", "destinationNodeId"]) {
        if (location[field] && !(network.nodes || []).some((node) => String(node.id) === String(location[field]))) {
          issues.push(issue("error", "location-node", `${location.name || id} references missing node ${location[field]}.`, "location", id));
        }
      }
      const display = location.markerDisplay || location.visibility;
      if (display === "search-only" && !String(location.name || "").trim() && !(location.tags || []).length) {
        issues.push(issue("error", "location-search", `Search-only location ${id} has no searchable text.`, "location", id));
      }
    }

    for (const location of locations || []) {
      const visited = new Set([String(location.id)]);
      let parent = location.parentId;
      while (parent != null && parent !== "") {
        if (visited.has(String(parent))) {
          issues.push(issue("error", "location-parent-cycle", `Circular parent chain involving ${location.name || location.id}.`, "location", location.id));
          break;
        }
        visited.add(String(parent));
        parent = locationMap.get(String(parent))?.parentId;
      }
    }

    const nodeIds = new Set();
    const nodeMap = new Map();
    const degree = new Map();
    for (const node of network.nodes) {
      const id = String(node.id ?? "");
      if (!id) issues.push(issue("error", "node-required", "Routing node is missing an ID.", "node", id));
      if (nodeIds.has(id)) issues.push(issue("error", "node-duplicate-id", `Duplicate node ID: ${id}.`, "node", id));
      nodeIds.add(id); nodeMap.set(id, node); degree.set(id, 0);
      if (!Number.isFinite(Number(node.lat)) || !Number.isFinite(Number(node.lng))) issues.push(issue("error", "node-coordinate", `${node.name || id} has invalid coordinates.`, "node", id));
      else if (!inCampusBounds({ lat: Number(node.lat), lng: Number(node.lng) })) issues.push(issue("warning", "node-bounds", `${node.name || id} is outside expected campus bounds.`, "node", id));
      if (!Number.isInteger(Number(node.level))) issues.push(issue("error", "node-level", `${node.name || id} has an invalid level.`, "node", id));
    }
    for (let i = 0; i < network.nodes.length; i += 1) {
      for (let j = i + 1; j < network.nodes.length; j += 1) {
        const a = network.nodes[i]; const b = network.nodes[j];
        if (Number(a.level) === Number(b.level) && haversineMeters(a, b) < 0.75) {
          issues.push(issue("warning", "node-near-duplicate", `${a.name || a.id} and ${b.name || b.id} are nearly duplicate nodes.`, "node", a.id));
        }
      }
    }

    const edgeIds = new Set();
    const connections = new Set();
    for (const edge of network.edges) {
      const id = String(edge.id ?? "");
      if (!id) issues.push(issue("error", "edge-required", "Routing edge is missing an ID.", "edge", id));
      if (edgeIds.has(id)) issues.push(issue("error", "edge-duplicate-id", `Duplicate edge ID: ${id}.`, "edge", id));
      edgeIds.add(id);
      const from = String(edge.from ?? ""); const to = String(edge.to ?? "");
      if (!nodeMap.has(from) || !nodeMap.has(to)) issues.push(issue("error", "edge-node", `${edge.name || id} references a missing endpoint node.`, "edge", id));
      if (from === to) issues.push(issue("error", "edge-loop", `${edge.name || id} starts and ends at the same node.`, "edge", id));
      if (nodeMap.has(from)) degree.set(from, (degree.get(from) || 0) + 1);
      if (nodeMap.has(to)) degree.set(to, (degree.get(to) || 0) + 1);
      const key = edge.bidirectional === false ? `${from}>${to}` : [from, to].sort().join("<>");
      if (connections.has(key)) issues.push(issue("warning", "edge-duplicate-connection", `${edge.name || id} duplicates another node connection.`, "edge", id));
      connections.add(key);
      if (!Array.isArray(edge.geometry) || edge.geometry.length < 2 || edge.geometry.some((point) => !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng)))) {
        issues.push(issue("error", "edge-geometry", `${edge.name || id} has invalid geometry.`, "edge", id));
      } else {
        const start = edge.geometry[0]; const end = edge.geometry[edge.geometry.length - 1];
        if (nodeMap.has(from) && haversineMeters(start, nodeMap.get(from)) > 0.75) issues.push(issue("error", "edge-start", `${edge.name || id} geometry does not meet its start node.`, "edge", id));
        if (nodeMap.has(to) && haversineMeters(end, nodeMap.get(to)) > 0.75) issues.push(issue("error", "edge-end", `${edge.name || id} geometry does not meet its end node.`, "edge", id));
        if (polylineLength(edge.geometry) < 0.5) issues.push(issue("error", "edge-short", `${edge.name || id} has near-zero length.`, "edge", id));
      }
      if (typeof edge.bidirectional !== "boolean") issues.push(issue("error", "edge-direction", `${edge.name || id} has invalid directionality.`, "edge", id));
      if (edge.type === "stairs" && edge.accessible !== false) issues.push(issue("warning", "edge-stairs-accessible", `${edge.name || id} is stairs but is marked accessible.`, "edge", id));
      const fromNode = nodeMap.get(from); const toNode = nodeMap.get(to);
      if (fromNode && toNode && Number(fromNode.level) !== Number(toNode.level) && !["stairs", "elevator", "ramp", "other"].includes(edge.type)) {
        issues.push(issue("error", "edge-level", `${edge.name || id} changes levels without a vertical connector type.`, "edge", id));
      }
      if (edge.status === "closed" && edge.visibility === "public") issues.push(issue("warning", "edge-closed-public", `${edge.name || id} is closed but public.`, "edge", id));
    }
    for (const node of network.nodes) {
      if ((degree.get(String(node.id)) || 0) === 0 && node.intentionallyIsolated !== true) issues.push(issue("warning", "node-isolated", `${node.name || node.id} is isolated.`, "node", node.id));
    }

    for (let i = 0; i < network.edges.length; i += 1) {
      for (let j = i + 1; j < network.edges.length; j += 1) {
        const a = network.edges[i]; const b = network.edges[j];
        if ([a.from, a.to].some((id) => String(id) === String(b.from) || String(id) === String(b.to))) continue;
        const ga = a.geometry || []; const gb = b.geometry || [];
        let crossing = null;
        for (let ai = 1; ai < ga.length && !crossing; ai += 1) for (let bi = 1; bi < gb.length && !crossing; bi += 1) crossing = segmentIntersection(ga[ai - 1], ga[ai], gb[bi - 1], gb[bi]);
        if (crossing) issues.push(issue("warning", "edge-crossing", `${a.name || a.id} crosses ${b.name || b.id} without a junction.`, "edge", a.id));
      }
    }

    const components = connectedComponents(network);
    if (components.length > 1) issues.push(issue("warning", "graph-components", `Routing graph has ${components.length} disconnected components.`, "graph", null));
    for (const location of locations || []) {
      if (location.accessVisibility === "public" && (location.destinationNodeId || location.arrivalNodeId)) {
        const nodeId = String(location.destinationNodeId || location.arrivalNodeId);
        const publicEdges = network.edges.filter((edge) => String(edge.from) === nodeId || String(edge.to) === nodeId);
        if (publicEdges.length && publicEdges.every((edge) => edge.visibility !== "public")) issues.push(issue("warning", "location-nonpublic-route", `${location.name} is public but connects only to nonpublic edges.`, "location", location.id));
      }
    }

    const accessibleGraph = new Map(network.nodes.map((node) => [String(node.id), new Set()]));
    network.edges.forEach((edge) => {
      if (edge.status === "closed" || edge.accessible === false || edge.type === "stairs") return;
      const from = String(edge.from); const to = String(edge.to);
      if (accessibleGraph.has(from) && accessibleGraph.has(to)) {
        accessibleGraph.get(from).add(to);
        if (edge.bidirectional !== false) accessibleGraph.get(to).add(from);
      }
    });
    for (const location of locations || []) {
      const nodeId = String(location.destinationNodeId || location.arrivalNodeId || "");
      const node = nodeMap.get(nodeId);
      if (nodeId && node?.accessible !== false && (degree.get(nodeId) || 0) > 0 && (accessibleGraph.get(nodeId)?.size || 0) === 0) {
        issues.push(issue("warning", "location-accessible-route", `${location.name} is assigned to an accessible node with no accessible open path.`, "location", location.id));
      }
    }

    return {
      issues,
      errors: issues.filter((item) => item.severity === "error").length,
      warnings: issues.filter((item) => item.severity === "warning").length,
      componentCount: components.length,
      counts: { locations: (locations || []).length, nodes: network.nodes.length, edges: network.edges.length }
    };
  }

  function stableLocations(locations) {
    return clone(locations).sort((a, b) => Number(a.id) - Number(b.id) || String(a.id).localeCompare(String(b.id)));
  }

  function stableNetwork(network) {
    const normalized = normalizeNetwork(network);
    normalized.nodes.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    normalized.edges.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return normalized;
  }

  return {
    CAMPUS_BOUNDS, CATEGORIES, ACCESS_VISIBILITIES, MARKER_MODES, NODE_TYPES, EDGE_TYPES,
    EDGE_STATUSES, clone, inCampusBounds, haversineMeters, polylineLength, pointToSegmentMeters,
    segmentIntersection, slug, uniqueStringId, nextLocationId, normalizeLocation, normalizeNetwork,
    connectedComponents, validateEditorData, stableLocations, stableNetwork
  };
});
