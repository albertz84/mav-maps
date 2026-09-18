(() => {
  "use strict";

  const Data = window.MavDataUtils;
  const Routing = window.MavRouting;
  const CAMPUS_CENTER = { lat: 29.74075, lng: -95.43035 };
  const DRAFT_KEY = "mavmaps-admin-draft-v1";
  const HISTORY_LIMIT = 50;
  const CATEGORY_COLORS = {
    classroom: "#4F46E5", restroom: "#0D9488", office: "#DC2626",
    facility: "#D97706", sports: "#16A34A", parking: "#6B7280", dining: "#EA580C"
  };
  const MODE_LABELS = {
    freehand: "Freehand path mode",
    select: "Select mode", "add-location": "Add Location mode", "add-node": "Add Node mode",
    "draw-path": "Draw Path mode", "route-test": "Route Test mode"
  };
  const MODE_HINTS = {
    freehand: "Hold and drag to trace a walkway, then release to save. Use Select to pan or zoom.",
    select: "Click a location, routing node, or path to edit it.",
    "add-location": "Click the map to capture coordinates and create a location.",
    "add-node": "Click the map to create a routing node.",
    "draw-path": "Click a node or the map to start; add vertices, then press Enter or Finish path.",
    "route-test": "Choose endpoints in the Route panel, or click routing nodes on the map."
  };

  const elements = {
    shell: document.querySelector(".admin-shell"), workspace: document.querySelector(".workspace"),
    map: document.querySelector("#admin-map"), mapLoading: document.querySelector("#map-loading"),
    toastRegion: document.querySelector("#toast-region"), sidebar: document.querySelector("#admin-sidebar"),
    sidebarToggle: document.querySelector("#sidebar-toggle"), modeButtons: [...document.querySelectorAll(".mode-button")],
    activeMode: document.querySelector("#active-mode-label"), operationHint: document.querySelector("#operation-hint"),
    counts: document.querySelector("#count-summary"), saveState: document.querySelector("#save-state"),
    undo: document.querySelector("#undo-button"), redo: document.querySelector("#redo-button"),
    delete: document.querySelector("#delete-button"), cancel: document.querySelector("#cancel-button"),
    finishPath: document.querySelector("#finish-path-button"), resetView: document.querySelector("#reset-view-button"),
    tabs: [...document.querySelectorAll(".sidebar-tab")], panels: [...document.querySelectorAll("[data-panel-content]")],
    search: document.querySelector("#admin-search"), entityFilter: document.querySelector("#entity-filter"),
    categoryFilter: document.querySelector("#category-filter"), selectionSummary: document.querySelector("#selection-summary"),
    recordList: document.querySelector("#record-list"), editor: document.querySelector("#editor-container"),
    layerInputs: [...document.querySelectorAll("[data-layer]")], mapType: document.querySelector("#map-type-select"),
    routeForm: document.querySelector("#route-form"), routeStart: document.querySelector("#route-start"),
    routeDestination: document.querySelector("#route-destination"), routeAccessible: document.querySelector("#route-accessible"),
    reverseRoute: document.querySelector("#reverse-route-button"), clearRoute: document.querySelector("#clear-route-button"),
    routeResult: document.querySelector("#route-result"), validate: document.querySelector("#validate-button"),
    validationSummary: document.querySelector("#validation-summary"), validationList: document.querySelector("#validation-list"),
    draftBanner: document.querySelector("#draft-banner"), draftTime: document.querySelector("#draft-time"),
    restoreDraft: document.querySelector("#restore-draft-button"), discardDraft: document.querySelector("#discard-draft-button"),
    saveDraft: document.querySelector("#save-draft-button"), draftStatus: document.querySelector("#draft-status"),
    importMode: document.querySelector("#import-mode"), importFile: document.querySelector("#import-file")
  };

  const state = {
    freehandStroke: null,
    map: null, AdvancedMarkerElement: null, CollisionBehavior: null,
    locations: [], network: { version: 1, nodes: [], edges: [] },
    sourceLoadedAt: 0, dirty: false, mode: "select", selected: null, pending: null,
    assignmentField: null, drawing: null, snapCandidate: null, lastPointer: null,
    overlays: { locations: new Map(), nodes: new Map(), edges: new Map(), labels: [], temporary: [] },
    overlayListeners: [], previewPolyline: null, routePolyline: null,
    layers: { locations: true, nodes: true, edges: true, nodeLabels: false, edgeLabels: false, restricted: false },
    undoStack: [], redoStack: [], edgeEditBase: null, suppressPathSync: false,
    validation: null, routeResult: null, importKind: null, autosaveTimer: null
  };

  function showToast(message, type = "info", duration = 3800) {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastRegion.append(toast);
    window.setTimeout(() => toast.remove(), duration);
  }

  function showMapMessage(title, message) {
    elements.mapLoading.innerHTML = "";
    const strong = document.createElement("strong"); strong.textContent = title;
    const span = document.createElement("span"); span.textContent = message;
    elements.mapLoading.append(strong, span); elements.mapLoading.hidden = false;
  }

  function hideMapMessage() { elements.mapLoading.hidden = true; }
  function isTypingTarget(target) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable; }
  function getLocationDisplay(location) { return location.markerDisplay || (location.visibility === null ? "zoom-dependent" : location.visibility) || "zoom-dependent"; }
  function getAccessVisibility(record) { return record.accessVisibility || (Data.ACCESS_VISIBILITIES.includes(record.visibility) ? record.visibility : "public"); }
  function snapshotData() { return { locations: Data.clone(state.locations), network: Data.clone(state.network) }; }
  function snapshotsEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function restoreSnapshot(snapshot) {
    state.locations = Data.clone(snapshot.locations);
    state.network = Data.normalizeNetwork(snapshot.network);
    state.selected = null; state.pending = null; state.drawing = null; state.assignmentField = null;
    clearRoute(); renderAll(); renderEditorState(); markDirty();
  }

  function recordHistory(before, label) {
    const after = snapshotData();
    if (snapshotsEqual(before, after)) return;
    state.undoStack.push({ label, snapshot: before });
    if (state.undoStack.length > HISTORY_LIMIT) state.undoStack.shift();
    state.redoStack = [];
    updateHistoryButtons(); markDirty(); scheduleDraftSave();
  }

  function mutate(label, callback) {
    const before = snapshotData(); callback(); recordHistory(before, label);
    renderAll(); renderEditorState();
  }

  function undo() {
    const action = state.undoStack.pop(); if (!action) return;
    state.redoStack.push({ label: action.label, snapshot: snapshotData() });
    restoreSnapshot(action.snapshot); updateHistoryButtons(); showToast(`Undid: ${action.label}`);
  }

  function redo() {
    const action = state.redoStack.pop(); if (!action) return;
    state.undoStack.push({ label: action.label, snapshot: snapshotData() });
    restoreSnapshot(action.snapshot); updateHistoryButtons(); showToast(`Redid: ${action.label}`);
  }

  function updateHistoryButtons() {
    elements.undo.disabled = state.undoStack.length === 0;
    elements.redo.disabled = state.redoStack.length === 0;
    elements.undo.title = state.undoStack.length ? `Undo ${state.undoStack.at(-1).label} (Ctrl/Cmd + Z)` : "Nothing to undo";
    elements.redo.title = state.redoStack.length ? `Redo ${state.redoStack.at(-1).label} (Ctrl/Cmd + Shift + Z)` : "Nothing to redo";
  }

  function markDirty() {
    state.dirty = true;
    elements.saveState.textContent = "Unsaved changes";
    elements.saveState.className = "save-state is-dirty";
  }

  function markSourceLoaded() {
    state.dirty = false;
    elements.saveState.textContent = "Source loaded";
    elements.saveState.className = "save-state is-saved";
  }

  async function loadProjectApiKey() {
    const response = await fetch("index.html", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not read the public map configuration from index.html.");
    const html = await response.text();
    const key = html.match(/apiKey\s*:\s*["']([^"']+)["']/)?.[1]?.trim();
    const mapId = html.match(/mapId\s*:\s*["']([^"']+)["']/)?.[1]?.trim() || "DEMO_MAP_ID";
    if (!key || key === "YOUR_API_KEY_HERE") throw new Error("Add the Google Maps API key to index.html before opening the editor.");
    return { key, mapId };
  }

  function loadGoogleMaps(apiKey) {
    return new Promise((resolve, reject) => {
      if (window.google?.maps) { resolve(); return; }
      const callback = "__mavMapsAdminReady";
      const params = new URLSearchParams({ key: apiKey, v: "weekly", loading: "async", libraries: "marker", callback });
      window[callback] = () => { delete window[callback]; resolve(); };
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`; script.async = true;
      script.onerror = () => { delete window[callback]; reject(new Error("Google Maps JavaScript API failed to load.")); };
      document.head.append(script);
    });
  }

  async function loadSourceData() {
    const [locationResponse, routingResponse] = await Promise.all([
      fetch("data/locations.json", { cache: "no-store" }),
      fetch("data/routing-network.json", { cache: "no-store" }).catch(() => null)
    ]);
    if (!locationResponse.ok) throw new Error(`Location data failed to load (${locationResponse.status}).`);
    const locations = await locationResponse.json();
    if (!Array.isArray(locations)) throw new TypeError("data/locations.json must contain an array.");
    let network = { version: 1, nodes: [], edges: [] };
    if (routingResponse?.ok) {
      try { network = await routingResponse.json(); }
      catch (error) { showToast(`Routing JSON could not be parsed; using an empty network. ${error.message}`, "warning", 7000); }
    }
    state.locations = locations;
    state.network = Data.normalizeNetwork(network);
    state.sourceLoadedAt = Date.now();
  }

  async function initializeMap(mapId) {
    const [{ Map }, { AdvancedMarkerElement, CollisionBehavior }] = await Promise.all([
      google.maps.importLibrary("maps"), google.maps.importLibrary("marker")
    ]);
    state.AdvancedMarkerElement = AdvancedMarkerElement; state.CollisionBehavior = CollisionBehavior;
    state.map = new Map(elements.map, {
      center: CAMPUS_CENTER, zoom: 17, mapId, mapTypeId: "satellite", mapTypeControl: false,
      zoomControl: true, streetViewControl: false, fullscreenControl: false, rotateControl: false,
      cameraControl: false, scaleControl: true, clickableIcons: false, gestureHandling: "greedy", tilt: 0
    });
    state.map.addListener("click", handleMapClick);
    state.map.addListener("mousemove", handleMapMouseMove);
    bindFreehandDrawing();
    renderAll(); hideMapMessage();
  }

  // A transparent input surface keeps tracing from dragging the base map.
  // Google's projection converts screen points at the current zoom to coordinates.
  function bindFreehandDrawing() {
    const surface = document.querySelector("#freehand-surface");
    const overlay = new google.maps.OverlayView();
    let projection = null;
    overlay.onAdd = () => {};
    overlay.onRemove = () => { projection = null; };
    overlay.draw = () => { projection = overlay.getProjection(); };
    overlay.setMap(state.map);

    function pointFromEvent(event) {
      const rect = elements.map.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      const position = projection?.fromContainerPixelToLatLng(new google.maps.Point(x, y));
      return position ? { x, y, position: position.toJSON() } : null;
    }

    surface.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || state.freehandStroke || state.drawing?.readyToSave) return;
      const point = pointFromEvent(event);
      if (!point) return;
      event.preventDefault();
      surface.setPointerCapture(event.pointerId);
      state.lastPointer = null;
      // Reuse the click tool's start-node creation and snapping.
      addMapPointToDrawing(point.position);
      elements.operationHint.textContent = MODE_HINTS.freehand;
      state.freehandStroke = { pointerId: event.pointerId, last: point, travel: 0 };
    });

    surface.addEventListener("pointermove", (event) => {
      const stroke = state.freehandStroke;
      if (!stroke || event.pointerId !== stroke.pointerId) return;
      const point = pointFromEvent(event);
      if (!point) return;
      const distance = Math.hypot(point.x - stroke.last.x, point.y - stroke.last.y);
      // Sampling every six pixels avoids storing every tiny hand movement.
      if (distance < 6) return;
      stroke.travel += distance;
      stroke.last = point;
      state.drawing.points.push(point.position);
      setSnapCandidate(nearestNode(point.position, snapThresholdMeters()));
      if (state.previewPolyline) state.previewPolyline.setPath(state.drawing.points);
    });

    surface.addEventListener("pointerup", (event) => {
      const stroke = state.freehandStroke;
      if (!stroke || event.pointerId !== stroke.pointerId) return;
      const point = pointFromEvent(event);
      state.freehandStroke = null;
      if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
      if (point) {
        stroke.travel += Math.hypot(point.x - stroke.last.x, point.y - stroke.last.y);
        if (Data.haversineMeters(state.drawing.points.at(-1), point.position) > 0.01) state.drawing.points.push(point.position);
      }
      if (stroke.travel < 12 || Data.polylineLength(state.drawing.points) < 0.5) {
        cancelCurrentOperation(false);
        showToast("Stroke too short. Hold and drag to trace a walkway.");
        return;
      }
      setSnapCandidate(null);
      finishDrawing();
      renderAll();
    });

    const cancelStroke = () => { if (state.freehandStroke) cancelCurrentOperation(false); };
    surface.addEventListener("pointercancel", cancelStroke);
    surface.addEventListener("lostpointercapture", cancelStroke);
    window.addEventListener("blur", cancelStroke);
  }

  function clearOverlayListeners() {
    state.overlayListeners.forEach((listener) => google.maps.event.removeListener(listener));
    state.overlayListeners = [];
  }

  function clearOverlays() {
    clearOverlayListeners();
    state.overlays.locations.forEach((marker) => { marker.map = null; });
    state.overlays.nodes.forEach((marker) => { marker.map = null; });
    state.overlays.edges.forEach((polyline) => polyline.setMap(null));
    state.overlays.labels.forEach((marker) => { marker.map = null; });
    state.overlays.temporary.forEach((overlay) => overlay.setMap ? overlay.setMap(null) : (overlay.map = null));
    state.overlays = { locations: new Map(), nodes: new Map(), edges: new Map(), labels: [], temporary: [] };
  }

  function visibleByAccess(record) { return state.layers.restricted || !["staff", "hidden", "restricted"].includes(getAccessVisibility(record)) && record.visibility !== "restricted"; }

  function markerContent(type, record, selected = false, temporary = false) {
    const div = document.createElement("div");
    if (type === "location") {
      div.className = `admin-location-marker${selected ? " selected" : ""}${temporary ? " temporary" : ""}${visibleByAccess(record) ? "" : " restricted"}`;
      div.style.setProperty("--marker-color", CATEGORY_COLORS[record.category] || "#7f1d1d");
      const span = document.createElement("span"); span.textContent = String(record.category || "L").slice(0, 1).toUpperCase(); div.append(span);
    } else {
      div.className = `admin-node-marker${selected ? " selected" : ""}${temporary ? " temporary" : ""}`;
      const span = document.createElement("span"); span.textContent = record.level ? String(record.level) : "•"; div.append(span);
    }
    return div;
  }

  function addLocationMarker(location) {
    if (!state.layers.locations || !visibleByAccess(location)) return;
    const selected = state.selected?.type === "location" && String(state.selected.id) === String(location.id);
    const marker = new state.AdvancedMarkerElement({
      map: state.map, position: { lat: Number(location.lat), lng: Number(location.lng) },
      title: `${location.name} (${location.id})`, content: markerContent("location", location, selected),
      gmpClickable: true, gmpDraggable: selected, zIndex: selected ? 3000 : 1000
    });
    state.overlayListeners.push(marker.addListener("click", () => {
      if (state.mode === "draw-path") return;
      selectRecord("location", location.id);
    }));
    if (selected) bindLocationDrag(marker, location);
    state.overlays.locations.set(String(location.id), marker);
  }

  function addNodeMarker(node) {
    if (!state.layers.nodes || !visibleByAccess(node)) return;
    const selected = state.selected?.type === "node" && String(state.selected.id) === String(node.id);
    const marker = new state.AdvancedMarkerElement({
      map: state.map, position: { lat: Number(node.lat), lng: Number(node.lng) },
      title: `${node.name || node.id} · ${node.type} · level ${node.level}`,
      content: markerContent("node", node, selected), gmpClickable: true, gmpDraggable: selected, zIndex: selected ? 4000 : 2000
    });
    state.overlayListeners.push(marker.addListener("click", () => handleNodeMarkerClick(node)));
    if (selected) bindNodeDrag(marker, node);
    state.overlays.nodes.set(String(node.id), marker);
    if (state.layers.nodeLabels) addLabel(node.name || node.id, node, 1900);
  }

  function edgeStyle(edge, selected = false) {
    let color = "#2563eb"; let opacity = 0.88; let icons = null;
    if (edge.type === "crosswalk") icons = [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2 }, offset: "0", repeat: "10px" }];
    if (["tunnel", "corridor"].includes(edge.type)) { color = "#7c3aed"; icons = [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2 }, offset: "0", repeat: "13px" }]; }
    if (edge.type === "stairs") color = "#d97706";
    if (edge.status === "closed" || edge.status === "restricted") { color = "#64748b"; opacity = 0.55; icons = [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2 }, offset: "0", repeat: "9px" }]; }
    return { strokeColor: selected ? "#dc2626" : color, strokeOpacity: icons ? 0 : opacity, strokeWeight: selected ? 7 : 4, icons, zIndex: selected ? 1500 : 500 };
  }

  function addEdgePolyline(edge) {
    if (!state.layers.edges || !visibleByAccess(edge)) return;
    const selected = state.selected?.type === "edge" && String(state.selected.id) === String(edge.id);
    const polyline = new google.maps.Polyline({
      map: state.map, path: edge.geometry || [], clickable: true, editable: selected, draggable: false,
      geodesic: false, ...edgeStyle(edge, selected)
    });
    state.overlayListeners.push(polyline.addListener("click", (event) => {
      if (state.mode === "draw-path") return;
      selectRecord("edge", edge.id, event.latLng?.toJSON());
    }));
    if (selected) bindEditableEdge(polyline, edge);
    state.overlays.edges.set(String(edge.id), polyline);
    if (state.layers.edgeLabels && edge.geometry?.length) addLabel(edge.name || edge.id, edge.geometry[Math.floor(edge.geometry.length / 2)], 700);
  }

  function addLabel(text, position, zIndex) {
    const content = document.createElement("div"); content.className = "map-label"; content.textContent = text;
    const marker = new state.AdvancedMarkerElement({ map: state.map, position, content, zIndex });
    state.overlays.labels.push(marker);
  }

  function renderPending() {
    if (state.pending?.record) {
      const type = state.pending.type;
      const record = state.pending.record;
      const marker = new state.AdvancedMarkerElement({ map: state.map, position: record, title: `Temporary ${type}`, content: markerContent(type, record, false, true), zIndex: 6000 });
      state.overlays.temporary.push(marker);
    }
    if (state.drawing?.pendingNodes) {
      state.drawing.pendingNodes.forEach((node) => {
        const marker = new state.AdvancedMarkerElement({ map: state.map, position: node, title: "Unsaved path endpoint", content: markerContent("node", node, false, true), zIndex: 6000 });
        state.overlays.temporary.push(marker);
      });
    }
    renderDrawingPreview();
  }

  function renderAll() {
    document.querySelector("#freehand-surface").hidden = !state.map || state.mode !== "freehand" || Boolean(state.drawing?.readyToSave);
    if (!state.map) { renderEditorState(); return; }
    clearOverlays();
    state.network.edges.forEach(addEdgePolyline);
    state.locations.forEach(addLocationMarker);
    state.network.nodes.forEach(addNodeMarker);
    renderPending();
    if (state.snapCandidate) state.overlays.nodes.get(String(state.snapCandidate.id))?.content?.classList.add("snap");
    if (state.routeResult?.geometry?.length) drawRoutePolyline(state.routeResult.geometry);
  }

  function renderDrawingPreview(pointer = state.lastPointer) {
    if (state.previewPolyline) { state.previewPolyline.setMap(null); state.previewPolyline = null; }
    if (!state.drawing?.points?.length) return;
    const path = [...state.drawing.points];
    if (pointer && !state.drawing.readyToSave) path.push(pointer);
    state.previewPolyline = new google.maps.Polyline({
      map: state.map, path, clickable: false, strokeColor: "#a855f7", strokeOpacity: 0,
      strokeWeight: 4, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2 }, offset: "0", repeat: "11px" }], zIndex: 5000
    });
  }

  function bindLocationDrag(marker, location) {
    let before = null;
    state.overlayListeners.push(marker.addListener("dragstart", () => { before = snapshotData(); }));
    state.overlayListeners.push(marker.addListener("drag", (event) => {
      if (!event.latLng) return;
      location.lat = event.latLng.lat(); location.lng = event.latLng.lng();
      updateCoordinateFields(location.lat, location.lng);
    }));
    state.overlayListeners.push(marker.addListener("dragend", (event) => {
      if (!event.latLng || !before) return;
      location.lat = event.latLng.lat(); location.lng = event.latLng.lng();
      recordHistory(before, `move location ${location.name}`); renderEditorState(); renderAll();
    }));
  }

  function bindNodeDrag(marker, node) {
    let before = null;
    state.overlayListeners.push(marker.addListener("dragstart", () => { before = snapshotData(); }));
    state.overlayListeners.push(marker.addListener("drag", (event) => {
      if (!event.latLng) return;
      moveNodeInData(node.id, event.latLng.toJSON(), true); updateCoordinateFields(node.lat, node.lng);
    }));
    state.overlayListeners.push(marker.addListener("dragend", (event) => {
      if (!event.latLng || !before) return;
      moveNodeInData(node.id, event.latLng.toJSON(), true);
      const connectedId = connectSavedNode(node.id);
      state.selected = { type: "node", id: connectedId };
      recordHistory(before, `move node ${node.name || node.id}`); renderEditorState(); renderAll();
    }));
  }

  function bindEditableEdge(polyline, edge) {
    state.edgeEditBase = snapshotData();
    const path = polyline.getPath();
    const sync = () => syncEdgeGeometryFromPolyline(polyline, edge);
    ["insert_at", "remove_at", "set_at"].forEach((eventName) => state.overlayListeners.push(path.addListener(eventName, sync)));
    state.overlayListeners.push(polyline.addListener("mousedown", () => { state.edgeEditBase = snapshotData(); }));
    state.overlayListeners.push(polyline.addListener("mouseup", () => {
      if (!state.edgeEditBase) return;
      recordHistory(state.edgeEditBase, `reshape path ${edge.name || edge.id}`);
      state.edgeEditBase = snapshotData(); renderEditorState();
    }));
    state.overlayListeners.push(polyline.addListener("rightclick", (event) => {
      if (!Number.isInteger(event.vertex) || path.getLength() <= 2) return;
      const before = snapshotData(); path.removeAt(event.vertex);
      recordHistory(before, `remove vertex from ${edge.name || edge.id}`);
      state.edgeEditBase = snapshotData(); renderEditorState();
    }));
  }

  function syncEdgeGeometryFromPolyline(polyline, edge) {
    if (state.suppressPathSync) return;
    edge.geometry = polyline.getPath().getArray().map((point) => point.toJSON());
    if (edge.geometry.length < 2) { edge.lengthMeters = 0; renderEdgeLength(edge); return; }
    const fromNode = findNode(edge.from); const toNode = findNode(edge.to);
    if (fromNode) moveNodeInData(fromNode.id, edge.geometry[0], false, edge.id);
    if (toNode) moveNodeInData(toNode.id, edge.geometry.at(-1), false, edge.id);
    edge.lengthMeters = Data.polylineLength(edge.geometry); renderEdgeLength(edge);
    markDirty(); scheduleDraftSave();
  }

  function moveNodeInData(nodeId, position, updateMap = false, excludedEdgeId = null) {
    const node = findNode(nodeId); if (!node) return;
    node.lat = Number(position.lat); node.lng = Number(position.lng);
    state.network.edges.forEach((edge) => {
      if (!edge.geometry?.length || String(edge.id) === String(excludedEdgeId)) return;
      let changed = false;
      if (String(edge.from) === String(nodeId)) { edge.geometry[0] = { lat: node.lat, lng: node.lng }; changed = true; }
      if (String(edge.to) === String(nodeId)) { edge.geometry[edge.geometry.length - 1] = { lat: node.lat, lng: node.lng }; changed = true; }
      if (changed) {
        edge.lengthMeters = Data.polylineLength(edge.geometry);
        if (updateMap) state.overlays.edges.get(String(edge.id))?.setPath(edge.geometry);
      }
    });
    if (updateMap) state.overlays.nodes.get(String(nodeId)).position = { lat: node.lat, lng: node.lng };
  }

  function updateCoordinateFields(lat, lng) {
    const latInput = elements.editor.querySelector('[name="lat"]');
    const lngInput = elements.editor.querySelector('[name="lng"]');
    if (latInput) latInput.value = Number(lat).toFixed(8);
    if (lngInput) lngInput.value = Number(lng).toFixed(8);
  }

  function renderEdgeLength(edge) {
    const output = elements.editor.querySelector("[data-edge-length]");
    if (output) output.textContent = `${Number(edge.lengthMeters || 0).toFixed(1)} m`;
  }

  function findLocation(id) { return state.locations.find((item) => String(item.id) === String(id)); }
  function findNode(id) { return state.network.nodes.find((item) => String(item.id) === String(id)); }
  function findEdge(id) { return state.network.edges.find((item) => String(item.id) === String(id)); }
  function getRecord(type, id) { return type === "location" ? findLocation(id) : type === "node" ? findNode(id) : findEdge(id); }

  function handleNodeMarkerClick(node) {
    if (state.assignmentField) { assignNodeToLocation(node); return; }
    if (state.mode === "draw-path") { addNodeToDrawing(node); return; }
    if (state.mode === "route-test") { assignRouteEndpointByMap(node); return; }
    selectRecord("node", node.id);
  }

  function handleMapClick(event) {
    const point = event.latLng?.toJSON(); if (!point) return;
    if (state.assignmentField) { showToast("Click an existing routing node, or cancel node assignment.", "warning"); return; }
    if (state.mode === "add-location") beginNewLocation(point);
    else if (state.mode === "add-node") beginNewNode(point);
    else if (state.mode === "draw-path") addMapPointToDrawing(point);
    else if (state.mode === "select") { deselect(); }
  }

  function handleMapMouseMove(event) {
    state.lastPointer = event.latLng?.toJSON() || null;
    if (state.mode !== "draw-path" || !state.drawing?.points?.length || state.drawing.readyToSave) return;
    const candidate = nearestNode(state.lastPointer, snapThresholdMeters());
    setSnapCandidate(candidate);
    renderDrawingPreview(candidate || state.lastPointer);
  }

  function setSnapCandidate(candidate) {
    const previousMarker = state.snapCandidate && state.overlays.nodes.get(String(state.snapCandidate.id));
    previousMarker?.content?.classList.remove("snap");
    state.snapCandidate = candidate;
    const nextMarker = candidate && state.overlays.nodes.get(String(candidate.id));
    nextMarker?.content?.classList.add("snap");
  }

  function snapThresholdMeters() {
    const zoom = state.map?.getZoom() || 18;
    return Math.max(2.5, Math.min(14, 8 * 2 ** (18 - zoom)));
  }

  function nearestNode(point, threshold = Infinity) {
    let best = null; let distance = threshold;
    state.network.nodes.forEach((node) => {
      const current = Data.haversineMeters(point, node);
      if (current < distance) { best = node; distance = current; }
    });
    return best;
  }

  function nearestEdgePoint(point, threshold = Infinity, excludedEdgeId = null) {
    let best = null;
    state.network.edges.forEach((edge) => {
      if (String(edge.id) === String(excludedEdgeId)) return;
      const geometry = edge.geometry || [];
      for (let index = 1; index < geometry.length; index += 1) {
        const result = Data.pointToSegmentMeters(point, geometry[index - 1], geometry[index]);
        if (result.distance < threshold && (!best || result.distance < best.distance)) {
          best = { edge, segmentIndex: index - 1, ...result,
            point: { lat: geometry[index - 1].lat + (geometry[index].lat - geometry[index - 1].lat) * result.t,
              lng: geometry[index - 1].lng + (geometry[index].lng - geometry[index - 1].lng) * result.t } };
        }
      }
    });
    return best;
  }

  function setMode(mode) {
    if (!MODE_LABELS[mode]) return;
    if (state.pending || state.drawing) cancelCurrentOperation(false);
    state.mode = mode; state.assignmentField = null;
    if (mode !== "select") {
      state.selected = null;
      elements.editor.hidden = true;
      elements.recordList.hidden = false;
      updateSelectionControls();
    }
    elements.shell.dataset.mode = mode;
    elements.modeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.mode === mode));
    elements.activeMode.textContent = MODE_LABELS[mode]; elements.operationHint.textContent = MODE_HINTS[mode];
    elements.finishPath.hidden = mode !== "draw-path";
    if (mode === "route-test") activatePanel("route");
    else if (mode !== "select") activatePanel("data");
    renderAll();
  }

  function beginNewLocation(point) {
    if (state.pending) cancelCurrentOperation(false);
    const record = {
      id: Data.nextLocationId(state.locations), name: "", building: "", floor: 0, category: "facility",
      description: "", lat: point.lat, lng: point.lng, tags: [], visibility: "zoom-dependent",
      markerDisplay: "zoom-dependent", minZoom: 18, directions: ["walking"], accessVisibility: "public",
      parentId: null, arrivalNodeId: null, destinationNodeId: null
    };
    state.pending = { type: "location", record };
    openLocationEditor(record, true); renderAll(); elements.operationHint.textContent = "Complete the location form, then save or cancel.";
  }

  function beginNewNode(point) {
    if (state.pending) cancelCurrentOperation(false);
    const id = Data.uniqueStringId("node", "new", state.network.nodes);
    const record = { id, name: "", lat: point.lat, lng: point.lng, level: 0, type: "intersection", accessible: true, visibility: "community" };
    state.pending = { type: "node", record };
    openNodeEditor(record, true); renderAll(); elements.operationHint.textContent = "Complete the routing-node form, then save or cancel.";
  }

  function selectRecord(type, id, clickPoint = null) {
    const record = getRecord(type, id); if (!record) return;
    state.selected = { type, id: record.id, clickPoint }; state.pending = null; state.assignmentField = null;
    setMode("select");
    if (type === "location") openLocationEditor(record, false);
    else if (type === "node") openNodeEditor(record, false);
    else openEdgeEditor(record);
    renderAll(); updateSelectionControls();
  }

  function deselect() {
    state.selected = null; state.assignmentField = null; state.edgeEditBase = null;
    elements.editor.hidden = true; elements.recordList.hidden = false;
    renderAll(); renderSelectionSummary(); updateSelectionControls();
  }

  function focusRecord(type, id) {
    const record = getRecord(type, id); if (!record || !state.map) return;
    let point = record;
    if (type === "edge") point = record.geometry?.[Math.floor((record.geometry?.length || 1) / 2)];
    if (point?.lat != null) { state.map.panTo({ lat: Number(point.lat), lng: Number(point.lng) }); state.map.setZoom(Math.max(state.map.getZoom() || 17, 19)); }
  }

  function updateSelectionControls() { elements.delete.disabled = !state.selected; }

  function cancelCurrentOperation(showNotice = true) {
    const stroke = state.freehandStroke;
    state.freehandStroke = null;
    const surface = document.querySelector("#freehand-surface");
    if (stroke && surface.hasPointerCapture(stroke.pointerId)) surface.releasePointerCapture(stroke.pointerId);
    const hadOperation = Boolean(state.pending || state.drawing || state.assignmentField);
    state.pending = null; state.drawing = null; state.assignmentField = null; setSnapCandidate(null); state.lastPointer = null;
    if (state.previewPolyline) { state.previewPolyline.setMap(null); state.previewPolyline = null; }
    if (hadOperation && showNotice) showToast("Current operation canceled.");
    if (state.selected) {
      const record = getRecord(state.selected.type, state.selected.id);
      if (record) state.selected.type === "location" ? openLocationEditor(record, false) : state.selected.type === "node" ? openNodeEditor(record, false) : openEdgeEditor(record);
    } else { elements.editor.hidden = true; elements.recordList.hidden = false; }
    elements.operationHint.textContent = MODE_HINTS[state.mode]; renderAll();
  }

  function deleteSelected() {
    if (!state.selected) return;
    const { type, id } = state.selected; const record = getRecord(type, id); if (!record) return;
    if (type === "node") {
      const connected = state.network.edges.filter((edge) => String(edge.from) === String(id) || String(edge.to) === String(id));
      const message = connected.length
        ? `Delete “${record.name || record.id}” and its ${connected.length} connected path${connected.length === 1 ? "" : "s"}? This avoids broken references.`
        : `Delete routing node “${record.name || record.id}”?`;
      if (!window.confirm(message)) return;
      mutate(`delete node ${record.name || record.id}`, () => {
        state.network.nodes = state.network.nodes.filter((node) => String(node.id) !== String(id));
        state.network.edges = state.network.edges.filter((edge) => String(edge.from) !== String(id) && String(edge.to) !== String(id));
        state.locations.forEach((location) => {
          if (String(location.arrivalNodeId) === String(id)) location.arrivalNodeId = null;
          if (String(location.destinationNodeId) === String(id)) location.destinationNodeId = null;
        });
        state.selected = null;
      });
    } else {
      if (!window.confirm(`Delete ${type} “${record.name || record.id}”?`)) return;
      mutate(`delete ${type} ${record.name || record.id}`, () => {
        if (type === "location") {
          state.locations = state.locations.filter((item) => String(item.id) !== String(id));
          state.locations.forEach((item) => { if (String(item.parentId) === String(id)) item.parentId = null; });
        } else state.network.edges = state.network.edges.filter((item) => String(item.id) !== String(id));
        state.selected = null;
      });
    }
  }

  function createSelectOptions(select, options, value, includeBlank = false, blankLabel = "None") {
    select.innerHTML = "";
    if (includeBlank) { const option = document.createElement("option"); option.value = ""; option.textContent = blankLabel; select.append(option); }
    options.forEach((item) => {
      const option = document.createElement("option");
      if (typeof item === "string") { option.value = item; option.textContent = item; }
      else { option.value = String(item.value); option.textContent = item.label; }
      option.selected = String(option.value) === String(value ?? ""); select.append(option);
    });
  }

  function editorHeader(title, subtitle) {
    return `<div class="editor-header"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="small-button" type="button" data-editor-close>Close</button></div>`;
  }

  function prepareEditor() {
    activatePanel("data"); elements.recordList.hidden = true; elements.editor.hidden = false; elements.editor.innerHTML = "";
  }

  function bindEditorClose() {
    elements.editor.querySelector("[data-editor-close]")?.addEventListener("click", () => {
      if (state.pending) cancelCurrentOperation(); else deselect();
    });
  }

  function openLocationEditor(location, isNew) {
    prepareEditor();
    elements.editor.innerHTML = `${editorHeader(isNew ? "New location" : "Edit location", isNew ? "Coordinates captured from the map." : `Location ID ${location.id} · drag its selected marker to move it.`)}
      <form class="editor-form" data-editor-form="location">
        <div class="form-grid">
          <label>ID<input name="id" type="number" min="1" step="1" required /></label>
          <label>Category<select name="category" required></select></label>
        </div>
        <label>Name<input name="name" type="text" required autocomplete="off" /></label>
        <label>Building<input name="building" type="text" required autocomplete="off" /></label>
        <div class="form-grid">
          <label>Parent location<select name="parentId"></select></label>
          <label>Floor or level<input name="floor" type="number" step="1" min="0" required /></label>
        </div>
        <label>Description<textarea name="description"></textarea></label>
        <label>Tags / search aliases<input name="tags" type="text" placeholder="comma, separated, aliases" /></label>
        <div class="coordinate-grid">
          <label>Latitude<input name="lat" type="number" step="any" required /></label>
          <label>Longitude<input name="lng" type="number" step="any" required /></label>
          <button class="small-button" type="button" data-focus-record title="Center map on this location">Focus</button>
        </div>
        <div class="form-grid">
          <label>Access visibility<select name="accessVisibility"></select></label>
          <label>Marker display<select name="markerDisplay"></select></label>
        </div>
        <p class="form-note">Access visibility controls filtered exports. Marker display remains compatible with the public map’s legacy <code>visibility</code> field.</p>
        <div class="form-grid">
          <label>Minimum zoom<input name="minZoom" type="number" min="0" max="22" step="1" /></label>
          <label>Directions<select name="directions"><option value="walking">Walking</option><option value="walking,driving">Walking + driving</option></select></label>
        </div>
        <label>Routing node<select name="routingNodeId"></select></label>
        <p class="form-note">Used for both arrival and destination. Save changes to keep the assignment.</p>
        <div class="inline-actions">
          <button class="small-button assign-button" type="button" data-assign-node="routingNodeId">Assign routing node on map</button>
        </div>
        <div class="form-actions">
          ${isNew ? "" : '<button class="small-button" type="button" data-duplicate>Duplicate</button>'}
          ${isNew ? "" : '<button class="small-button danger-button" type="button" data-delete-record>Delete</button>'}
          <button class="small-button" type="button" data-cancel-form>Cancel</button>
          <button class="small-button primary" type="submit">${isNew ? "Add location" : "Save changes"}</button>
        </div>
      </form>`;
    bindEditorClose();
    const form = elements.editor.querySelector("form");
    form.elements.id.value = location.id; form.elements.name.value = location.name || "";
    form.elements.building.value = location.building || ""; form.elements.floor.value = Number(location.floor) || 0;
    form.elements.description.value = location.description || ""; form.elements.tags.value = (location.tags || []).join(", ");
    form.elements.lat.value = Number(location.lat).toFixed(8); form.elements.lng.value = Number(location.lng).toFixed(8);
    form.elements.minZoom.value = location.minZoom == null ? "" : location.minZoom;
    form.elements.directions.value = (location.directions || ["walking"]).includes("driving") ? "walking,driving" : "walking";
    createSelectOptions(form.elements.category, Data.CATEGORIES, location.category);
    createSelectOptions(form.elements.accessVisibility, Data.ACCESS_VISIBILITIES, getAccessVisibility(location));
    createSelectOptions(form.elements.markerDisplay, Data.MARKER_MODES, getLocationDisplay(location));
    const parentOptions = state.locations.filter((item) => String(item.id) !== String(location.id)).map((item) => ({ value: item.id, label: `${item.name} · ${item.id}` }));
    createSelectOptions(form.elements.parentId, parentOptions, location.parentId, true);
    const nodeOptions = state.network.nodes.map((node) => ({ value: node.id, label: `${node.name || node.id} · L${node.level}` }));
    // Prefer the node already used by route testing for legacy assignments.
    createSelectOptions(form.elements.routingNodeId, nodeOptions, location.destinationNodeId || location.arrivalNodeId, true);
    form.addEventListener("submit", (event) => { event.preventDefault(); saveLocationForm(form, location, isNew); });
    elements.editor.querySelector("[data-cancel-form]").addEventListener("click", () => isNew ? cancelCurrentOperation() : openLocationEditor(location, false));
    elements.editor.querySelector("[data-focus-record]").addEventListener("click", () => { state.map.panTo({ lat: Number(form.elements.lat.value), lng: Number(form.elements.lng.value) }); state.map.setZoom(20); });
    elements.editor.querySelector("[data-duplicate]")?.addEventListener("click", () => duplicateLocation(location));
    elements.editor.querySelector("[data-delete-record]")?.addEventListener("click", deleteSelected);
    elements.editor.querySelectorAll("[data-assign-node]").forEach((button) => button.addEventListener("click", () => {
      state.assignmentField = button.dataset.assignNode; elements.editor.querySelectorAll(".assign-button").forEach((item) => item.classList.toggle("is-active", item === button));
      elements.operationHint.textContent = "Click a routing node to use for both arrival and destination.";
      showToast("Node assignment active. Click a blue routing node on the map.");
    }));
    window.requestAnimationFrame(() => form.elements.name.focus());
  }

  function saveLocationForm(form, original, isNew) {
    const id = Number(form.elements.id.value);
    const name = form.elements.name.value.trim(); const building = form.elements.building.value.trim();
    const lat = Number(form.elements.lat.value); const lng = Number(form.elements.lng.value);
    if (!Number.isInteger(id) || id < 1 || !name || !building || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      showToast("Enter a unique positive numeric ID, name, building, and valid coordinates.", "error"); return;
    }
    if (state.locations.some((item) => String(item.id) === String(id) && item !== original)) { showToast(`Location ID ${id} is already in use.`, "error"); return; }
    const markerDisplay = form.elements.markerDisplay.value;
    const updated = {
      ...original, id, name, building, floor: Number(form.elements.floor.value), category: form.elements.category.value,
      description: form.elements.description.value.trim(), lat, lng,
      tags: form.elements.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean),
      accessVisibility: form.elements.accessVisibility.value, markerDisplay,
      visibility: markerDisplay, minZoom: form.elements.minZoom.value === "" ? null : Number(form.elements.minZoom.value),
      directions: form.elements.directions.value.split(","),
      parentId: form.elements.parentId.value || null, arrivalNodeId: form.elements.routingNodeId.value || null,
      destinationNodeId: form.elements.routingNodeId.value || null
    };
    if (markerDisplay === "search-only" || markerDisplay === "hidden") updated.minZoom = null;
    if (markerDisplay === "always") updated.minZoom = 0;
    mutate(`${isNew ? "add" : "edit"} location ${name}`, () => {
      if (isNew) state.locations.push(updated); else Object.assign(original, updated);
      state.pending = null; state.selected = { type: "location", id };
    });
    openLocationEditor(findLocation(id), false); focusRecord("location", id); showToast(`${name} saved.`);
  }

  function duplicateLocation(location) {
    const copy = Data.clone(location); copy.id = Data.nextLocationId(state.locations); copy.name = `${location.name} copy`;
    state.pending = { type: "location", record: copy }; state.selected = null; openLocationEditor(copy, true); renderAll();
  }

  function assignNodeToLocation(node) {
    const select = elements.editor.querySelector(`[name="${state.assignmentField}"]`);
    if (!select) { state.assignmentField = null; return; }
    select.value = String(node.id); state.assignmentField = null;
    elements.editor.querySelectorAll(".assign-button").forEach((item) => item.classList.remove("is-active"));
    elements.operationHint.textContent = "Routing node assigned. Save the location form to keep it.";
    showToast(`Assigned ${node.name || node.id}.`);
  }

  function openNodeEditor(node, isNew) {
    prepareEditor();
    elements.editor.innerHTML = `${editorHeader(isNew ? "New routing node" : "Edit routing node", isNew ? "Coordinates captured from the map." : `Node ${node.id} · drag its selected diamond to move it.`)}
      <form class="editor-form" data-editor-form="node">
        <label>ID<input name="id" type="text" required /></label>
        <label>Name<input name="name" type="text" placeholder="Descriptive map-maintainer name" /></label>
        <div class="form-grid"><label>Type<select name="type"></select></label><label>Level<input name="level" type="number" step="1" required /></label></div>
        <div class="coordinate-grid">
          <label>Latitude<input name="lat" type="number" step="any" required /></label>
          <label>Longitude<input name="lng" type="number" step="any" required /></label>
          <button class="small-button" type="button" data-focus-record>Focus</button>
        </div>
        <div class="form-grid"><label>Visibility<select name="visibility"></select></label><label class="check-field"><input name="accessible" type="checkbox" /><span>Accessible</span></label></div>
        <label class="check-field"><input name="intentionallyIsolated" type="checkbox" /><span>Intentionally isolated destination node</span></label>
        <div class="form-actions">
          ${isNew ? "" : '<button class="small-button danger-button" type="button" data-delete-record>Delete</button>'}
          <button class="small-button" type="button" data-cancel-form>Cancel</button>
          <button class="small-button primary" type="submit">${isNew ? "Add node" : "Save changes"}</button>
        </div>
      </form>`;
    bindEditorClose(); const form = elements.editor.querySelector("form");
    form.elements.id.value = node.id; form.elements.name.value = node.name || ""; form.elements.level.value = Number(node.level) || 0;
    form.elements.lat.value = Number(node.lat).toFixed(8); form.elements.lng.value = Number(node.lng).toFixed(8);
    form.elements.accessible.checked = node.accessible !== false; form.elements.intentionallyIsolated.checked = node.intentionallyIsolated === true;
    createSelectOptions(form.elements.type, Data.NODE_TYPES, node.type || "intersection");
    createSelectOptions(form.elements.visibility, Data.ACCESS_VISIBILITIES, node.visibility || "community");
    form.addEventListener("submit", (event) => { event.preventDefault(); saveNodeForm(form, node, isNew); });
    elements.editor.querySelector("[data-cancel-form]").addEventListener("click", () => isNew ? cancelCurrentOperation() : openNodeEditor(node, false));
    elements.editor.querySelector("[data-delete-record]")?.addEventListener("click", deleteSelected);
    elements.editor.querySelector("[data-focus-record]").addEventListener("click", () => { state.map.panTo({ lat: Number(form.elements.lat.value), lng: Number(form.elements.lng.value) }); state.map.setZoom(20); });
    window.requestAnimationFrame(() => form.elements.name.focus());
  }

  function connectSavedNode(id) {
    const report = Data.connectNearbyPaths(state.network, state.locations);
    while (Object.prototype.hasOwnProperty.call(report.mergedNodeIds, id)) id = report.mergedNodeIds[id];
    clearRoute();
    return id;
  }

  function saveNodeForm(form, original, isNew) {
    const id = form.elements.id.value.trim(); const lat = Number(form.elements.lat.value); const lng = Number(form.elements.lng.value); const level = Number(form.elements.level.value);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isInteger(level)) { showToast("Node ID, coordinates, and integer level are required.", "error"); return; }
    if (state.network.nodes.some((item) => String(item.id) === id && item !== original)) { showToast(`Node ID ${id} is already in use.`, "error"); return; }
    const oldId = String(original.id);
    let connectedId = id;
    const updated = { ...original, id, name: form.elements.name.value.trim(), lat, lng, level, type: form.elements.type.value,
      accessible: form.elements.accessible.checked, visibility: form.elements.visibility.value,
      intentionallyIsolated: form.elements.intentionallyIsolated.checked };
    mutate(`${isNew ? "add" : "edit"} node ${updated.name || id}`, () => {
      if (isNew) state.network.nodes.push(updated);
      else {
        Object.assign(original, updated);
        if (oldId !== id) {
          state.network.edges.forEach((edge) => { if (String(edge.from) === oldId) edge.from = id; if (String(edge.to) === oldId) edge.to = id; });
          state.locations.forEach((location) => { if (String(location.arrivalNodeId) === oldId) location.arrivalNodeId = id; if (String(location.destinationNodeId) === oldId) location.destinationNodeId = id; });
        }
        moveNodeInData(id, updated);
      }
      connectedId = connectSavedNode(id);
      state.pending = null; state.selected = { type: "node", id: connectedId };
    });
    openNodeEditor(findNode(connectedId), false); focusRecord("node", connectedId); showToast(`${updated.name || id} saved and nearby paths connected.`);
  }

  function startDrawingAtNode(node, temporary = false) {
    state.drawing = { startNodeId: node.id, endNodeId: null, points: [{ lat: node.lat, lng: node.lng }], pendingNodes: temporary ? [node] : [], pendingSplit: null, readyToSave: false };
    elements.operationHint.textContent = "Path started. Click intermediate points, click a node to finish, or press Enter to use the last point.";
    renderAll();
  }

  function addNodeToDrawing(node) {
    if (!state.drawing?.points?.length) { startDrawingAtNode(node); return; }
    if (String(node.id) === String(state.drawing.startNodeId) && state.drawing.points.length < 3) { showToast("A path needs a different endpoint.", "warning"); return; }
    state.drawing.points.push({ lat: node.lat, lng: node.lng }); state.drawing.endNodeId = node.id; finishDrawingToForm();
  }

  function addMapPointToDrawing(point) {
    const snap = nearestNode(point, snapThresholdMeters());
    if (snap) { addNodeToDrawing(snap); return; }
    if (!state.drawing?.points?.length) {
      const node = { id: Data.uniqueStringId("node", "path-start", [...state.network.nodes]), name: "Path start", lat: point.lat, lng: point.lng, level: 0, type: "intersection", accessible: true, visibility: "community" };
      startDrawingAtNode(node, true); return;
    }
    state.drawing.points.push(point); renderDrawingPreview();
    elements.operationHint.textContent = `${state.drawing.points.length} path points. Add more, click an existing node, or press Enter / Finish path.`;
  }

  function finishDrawing() {
    if (!state.drawing?.points?.length) { showToast("Click the map or an existing node to start a path.", "warning"); return; }
    if (state.drawing.points.length < 2) { showToast("Add at least one more point before finishing the path.", "warning"); return; }
    if (!state.drawing.endNodeId) {
      const lastPoint = state.drawing.points.at(-1);
      const snap = nearestNode(lastPoint, snapThresholdMeters());
      if (snap && String(snap.id) !== String(state.drawing.startNodeId)) {
        state.drawing.points[state.drawing.points.length - 1] = { lat: snap.lat, lng: snap.lng };
        state.drawing.endNodeId = snap.id;
      } else {
        // Connections are resolved atomically on save, after type/access metadata
        // is known, using the same 2 m tolerance as intermediate crossings.
        {
          const id = Data.uniqueStringId("node", "path-end", [...state.network.nodes, ...state.drawing.pendingNodes]);
          const node = { id, name: "Path end", lat: lastPoint.lat, lng: lastPoint.lng, level: 0, type: "intersection", accessible: true, visibility: "community" };
          state.drawing.pendingNodes.push(node); state.drawing.endNodeId = id;
        }
      }
    }
    finishDrawingToForm();
  }

  function finishDrawingToForm() {
    if (!state.drawing?.endNodeId || state.drawing.points.length < 2) return;
    state.drawing.readyToSave = true; renderDrawingPreview(null);
    const edge = {
      id: Data.uniqueStringId("edge", "new-path", state.network.edges), name: "", from: state.drawing.startNodeId,
      to: state.drawing.endNodeId, type: "walkway", bidirectional: true, accessible: true, visibility: "community",
      status: "open", lengthMeters: Data.polylineLength(state.drawing.points), geometry: Data.clone(state.drawing.points),
      instructionForward: "", instructionReverse: "", costMultiplier: 1
    };
    openEdgeEditor(edge, true);
  }

  function removeLastDrawingPoint() {
    if (!state.drawing?.points?.length || state.drawing.readyToSave) return false;
    if (state.drawing.points.length === 1) { cancelCurrentOperation(); return true; }
    state.drawing.points.pop(); renderDrawingPreview(); showToast("Removed the last unsaved path point."); return true;
  }

  function splitEdgeAt(edge, point, nodeId, forcedSegmentIndex = null) {
    const geometry = Data.clone(edge.geometry || []); if (geometry.length < 2) return null;
    let hit = forcedSegmentIndex == null ? nearestEdgePoint(point, Infinity, null) : { segmentIndex: forcedSegmentIndex, point };
    if (forcedSegmentIndex == null) {
      let best = null;
      for (let index = 1; index < geometry.length; index += 1) {
        const result = Data.pointToSegmentMeters(point, geometry[index - 1], geometry[index]);
        if (!best || result.distance < best.distance) best = { ...result, segmentIndex: index - 1,
          point: { lat: geometry[index - 1].lat + (geometry[index].lat - geometry[index - 1].lat) * result.t,
            lng: geometry[index - 1].lng + (geometry[index].lng - geometry[index - 1].lng) * result.t } };
      }
      hit = best;
    }
    if (!hit) return null;
    const splitPoint = hit.point;
    const firstGeometry = [...geometry.slice(0, hit.segmentIndex + 1), splitPoint];
    const secondGeometry = [splitPoint, ...geometry.slice(hit.segmentIndex + 1)];
    const oldTo = edge.to;
    edge.to = nodeId; edge.geometry = firstGeometry; edge.lengthMeters = Data.polylineLength(firstGeometry);
    const second = { ...Data.clone(edge), id: Data.uniqueStringId("edge", `${edge.name || edge.id}-part-2`, state.network.edges),
      from: nodeId, to: oldTo, geometry: secondGeometry, lengthMeters: Data.polylineLength(secondGeometry) };
    state.network.edges.push(second); return second;
  }

  function openEdgeEditor(edge, isNew = false) {
    prepareEditor();
    const fromName = findNode(edge.from)?.name || edge.from; const toName = findNode(edge.to)?.name || edge.to;
    elements.editor.innerHTML = `${editorHeader(isNew ? "New walkable path" : "Edit walkable path", isNew ? "Review the route metadata before saving." : `Connects ${fromName} to ${toName} · drag or insert vertices directly on the selected line.`)}
      <form class="editor-form" data-editor-form="edge">
        <label>ID<input name="id" type="text" required /></label>
        <label>Name<input name="name" type="text" placeholder="Walkway or corridor name" /></label>
        <div class="form-grid"><label>From node<select name="from" required></select></label><label>To node<select name="to" required></select></label></div>
        <div class="form-grid"><label>Type<select name="type"></select></label><label>Status<select name="status"></select></label></div>
        <div class="form-grid"><label>Visibility<select name="visibility"></select></label><label>Cost multiplier<input name="costMultiplier" type="number" min="0.01" step="0.01" required /></label></div>
        <div class="form-grid"><label class="check-field"><input name="bidirectional" type="checkbox" /><span>Bidirectional</span></label><label class="check-field"><input name="accessible" type="checkbox" /><span>Accessible</span></label></div>
        <label>Forward instruction<textarea name="instructionForward" placeholder="Optional instruction"></textarea></label>
        <label>Reverse instruction<textarea name="instructionReverse" placeholder="Optional instruction"></textarea></label>
        <label class="check-field"><input name="autoConnect" type="checkbox" checked /><span>Connect nearby outdoor paths (2 m, same level/access). Uncheck for bridges or separated paths.</span></label>
        <div class="selection-summary"><strong>Calculated length</strong><span data-edge-length>${Number(edge.lengthMeters || 0).toFixed(1)} m</span></div>
        <div class="inline-actions">
          ${isNew ? "" : '<button class="small-button" type="button" data-reverse-edge>Reverse direction</button>'}
          ${isNew ? "" : '<button class="small-button" type="button" data-split-edge>Split at midpoint</button>'}
        </div>
        <div class="form-actions">
          ${isNew ? "" : '<button class="small-button danger-button" type="button" data-delete-record>Delete</button>'}
          <button class="small-button" type="button" data-cancel-form>Cancel</button>
          <button class="small-button primary" type="submit">${isNew ? "Add path" : "Save metadata"}</button>
        </div>
      </form>`;
    bindEditorClose(); const form = elements.editor.querySelector("form");
    form.elements.id.value = edge.id; form.elements.name.value = edge.name || ""; form.elements.costMultiplier.value = Number(edge.costMultiplier ?? 1);
    form.elements.bidirectional.checked = edge.bidirectional !== false; form.elements.accessible.checked = edge.accessible !== false;
    form.elements.instructionForward.value = edge.instructionForward || ""; form.elements.instructionReverse.value = edge.instructionReverse || "";
    const allNodes = [...state.network.nodes, ...(state.drawing?.pendingNodes || [])];
    const nodeOptions = allNodes.map((node) => ({ value: node.id, label: `${node.name || node.id} · L${node.level}` }));
    createSelectOptions(form.elements.from, nodeOptions, edge.from); createSelectOptions(form.elements.to, nodeOptions, edge.to);
    createSelectOptions(form.elements.type, Data.EDGE_TYPES, edge.type || "walkway");
    createSelectOptions(form.elements.status, Data.EDGE_STATUSES, edge.status || "open");
    createSelectOptions(form.elements.visibility, Data.ACCESS_VISIBILITIES, edge.visibility || "community");
    form.addEventListener("submit", (event) => { event.preventDefault(); saveEdgeForm(form, edge, isNew); });
    elements.editor.querySelector("[data-cancel-form]").addEventListener("click", () => isNew ? cancelCurrentOperation() : openEdgeEditor(edge));
    elements.editor.querySelector("[data-delete-record]")?.addEventListener("click", deleteSelected);
    elements.editor.querySelector("[data-reverse-edge]")?.addEventListener("click", () => reverseEdge(edge));
    elements.editor.querySelector("[data-split-edge]")?.addEventListener("click", () => splitSelectedEdge(edge));
    window.requestAnimationFrame(() => form.elements.name.focus());
  }

  function saveEdgeForm(form, original, isNew) {
    const id = form.elements.id.value.trim(); const from = form.elements.from.value; const to = form.elements.to.value;
    if (!id || !from || !to || from === to || !Array.isArray(original.geometry) || original.geometry.length < 2) { showToast("A path needs a unique ID, different endpoint nodes, and at least two geometry points.", "error"); return; }
    if (state.network.edges.some((item) => String(item.id) === id && item !== original)) { showToast(`Edge ID ${id} is already in use.`, "error"); return; }
    const fromNode = [...state.network.nodes, ...(state.drawing?.pendingNodes || [])].find((node) => String(node.id) === String(from));
    const toNode = [...state.network.nodes, ...(state.drawing?.pendingNodes || [])].find((node) => String(node.id) === String(to));
    if (!fromNode || !toNode) { showToast("Both endpoint nodes must exist.", "error"); return; }
    const geometry = Data.clone(original.geometry); geometry[0] = { lat: fromNode.lat, lng: fromNode.lng }; geometry[geometry.length - 1] = { lat: toNode.lat, lng: toNode.lng };
    const updated = { ...original, id, name: form.elements.name.value.trim(), from, to, type: form.elements.type.value,
      bidirectional: form.elements.bidirectional.checked, accessible: form.elements.accessible.checked,
      visibility: form.elements.visibility.value, status: form.elements.status.value,
      costMultiplier: Number(form.elements.costMultiplier.value) || 1,
      geometry, lengthMeters: Data.polylineLength(geometry), instructionForward: form.elements.instructionForward.value.trim(),
      instructionReverse: form.elements.instructionReverse.value.trim() };
    if (!form.elements.autoConnect.checked && detectCrossings(updated, isNew ? null : original.id).length) {
      const proceed = window.confirm("This path crosses an existing path without a shared node. Save it disconnected and review the crossing in Validation?\n\nChoose Cancel to keep editing.");
      if (!proceed) return;
    }
    mutate(`${isNew ? "add" : "edit"} path ${updated.name || id}`, () => {
      if (isNew) {
        state.network.nodes.push(...Data.clone(state.drawing?.pendingNodes || []));
        if (state.drawing?.pendingSplit) {
          const split = state.drawing.pendingSplit; const target = findEdge(split.edge.id);
          if (target) splitEdgeAt(target, split.point, split.nodeId, split.segmentIndex);
        }
        state.network.edges.push(updated);
      } else Object.assign(original, updated);
      if (form.elements.autoConnect.checked) {
        Data.connectNearbyPaths(state.network, state.locations);
        clearRoute();
      }
      state.drawing = null; state.pending = null; state.selected = { type: "edge", id };
    });
    setMode("select");
    openEdgeEditor(findEdge(id)); focusRecord("edge", id); showToast(`${updated.name || id} saved.`);
  }

  function detectCrossings(edge, excludedId) {
    const crossings = [];
    state.network.edges.forEach((other) => {
      if (String(other.id) === String(excludedId) || [edge.from, edge.to].some((id) => String(id) === String(other.from) || String(id) === String(other.to))) return;
      for (let a = 1; a < edge.geometry.length; a += 1) for (let b = 1; b < (other.geometry || []).length; b += 1) {
        const point = Data.segmentIntersection(edge.geometry[a - 1], edge.geometry[a], other.geometry[b - 1], other.geometry[b]);
        if (point) crossings.push({ other, point });
      }
    });
    return crossings;
  }

  function reverseEdge(edge) {
    mutate(`reverse path ${edge.name || edge.id}`, () => {
      [edge.from, edge.to] = [edge.to, edge.from]; edge.geometry.reverse();
      [edge.instructionForward, edge.instructionReverse] = [edge.instructionReverse || "", edge.instructionForward || ""];
    }); openEdgeEditor(edge);
  }

  function splitSelectedEdge(edge) {
    if (!edge.geometry?.length) return;
    const geometry = edge.geometry; const middleSegment = Math.max(0, Math.floor((geometry.length - 1) / 2));
    const a = geometry[middleSegment]; const b = geometry[middleSegment + 1];
    const point = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    const node = { id: Data.uniqueStringId("node", `${edge.name || edge.id}-junction`, state.network.nodes), name: `${edge.name || "Path"} junction`,
      lat: point.lat, lng: point.lng, level: Number(findNode(edge.from)?.level) || 0, type: "intersection",
      accessible: edge.accessible !== false, visibility: edge.visibility || "community" };
    if (!window.confirm(`Split “${edge.name || edge.id}” at its geometric midpoint and add junction ${node.id}?`)) return;
    mutate(`split path ${edge.name || edge.id}`, () => { state.network.nodes.push(node); splitEdgeAt(edge, point, node.id, middleSegment); state.selected = { type: "node", id: node.id }; });
    openNodeEditor(node, false); focusRecord("node", node.id);
  }

  function renderEditorState() {
    elements.counts.textContent = `${state.locations.length} locations · ${state.network.nodes.length} nodes · ${state.network.edges.length} edges`;
    renderSelectionSummary(); renderRecordList(); renderRouteOptions(); updateHistoryButtons(); updateSelectionControls();
  }

  function renderSelectionSummary() {
    elements.selectionSummary.innerHTML = "";
    if (!state.selected) {
      const strong = document.createElement("strong"); strong.textContent = "Nothing selected";
      const span = document.createElement("span"); span.textContent = "Choose a record below or click an object on the map.";
      elements.selectionSummary.append(strong, span); return;
    }
    const record = getRecord(state.selected.type, state.selected.id);
    const strong = document.createElement("strong"); strong.textContent = record?.name || record?.id || "Selected record";
    const span = document.createElement("span"); span.textContent = `${state.selected.type} · ${record?.id}`;
    elements.selectionSummary.append(strong, span);
  }

  function searchText(record, type) {
    if (type === "location") return [record.id, record.name, record.building, record.description, ...(record.tags || [])].join(" ");
    if (type === "node") return [record.id, record.name, record.type, record.level].join(" ");
    return [record.id, record.name, record.type, record.from, record.to, record.status].join(" ");
  }

  function renderCategoryFilter() {
    const current = elements.categoryFilter.value || "all"; const type = elements.entityFilter.value;
    const options = [{ value: "all", label: "All categories" }];
    if (type === "location" || type === "all") Data.CATEGORIES.forEach((item) => options.push({ value: `category:${item}`, label: item }));
    Data.ACCESS_VISIBILITIES.forEach((item) => options.push({ value: `visibility:${item}`, label: `${item} visibility` }));
    createSelectOptions(elements.categoryFilter, options, options.some((item) => item.value === current) ? current : "all");
  }

  function renderRecordList() {
    if (elements.recordList.hidden) return;
    const query = elements.search.value.toLowerCase().trim(); const entity = elements.entityFilter.value; const category = elements.categoryFilter.value;
    const records = [];
    if (entity === "all" || entity === "location") state.locations.forEach((record) => records.push({ type: "location", record }));
    if (entity === "all" || entity === "node") state.network.nodes.forEach((record) => records.push({ type: "node", record }));
    if (entity === "all" || entity === "edge") state.network.edges.forEach((record) => records.push({ type: "edge", record }));
    const filtered = records.filter(({ type, record }) => {
      if (query && !searchText(record, type).toLowerCase().includes(query)) return false;
      if (category.startsWith("category:") && (type !== "location" || record.category !== category.slice(9))) return false;
      if (category.startsWith("visibility:") && getAccessVisibility(record) !== category.slice(11)) return false;
      return true;
    }).sort((a, b) => String(a.record.name || a.record.id).localeCompare(String(b.record.name || b.record.id)));
    elements.recordList.innerHTML = "";
    if (!filtered.length) { const empty = document.createElement("div"); empty.className = "empty-state"; empty.textContent = "No records match these search and filter settings."; elements.recordList.append(empty); return; }
    filtered.slice(0, 300).forEach(({ type, record }) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "record-item";
      if (state.selected?.type === type && String(state.selected.id) === String(record.id)) button.classList.add("is-selected");
      const icon = document.createElement("span"); icon.className = `record-icon ${type}`; icon.textContent = type === "location" ? "L" : type === "node" ? "N" : "P";
      const copy = document.createElement("span"); copy.className = "record-copy";
      const name = document.createElement("strong"); name.textContent = record.name || record.id;
      const detail = document.createElement("span"); detail.textContent = type === "location" ? `${record.building} · ${record.category}` : type === "node" ? `${record.type} · level ${record.level}` : `${record.type} · ${Number(record.lengthMeters || 0).toFixed(1)} m`;
      copy.append(name, detail); const meta = document.createElement("span"); meta.className = "record-meta"; meta.textContent = String(record.id);
      button.append(icon, copy, meta); button.addEventListener("click", () => { selectRecord(type, record.id); focusRecord(type, record.id); }); elements.recordList.append(button);
    });
  }

  function activatePanel(panelName) {
    elements.tabs.forEach((tab) => { const active = tab.dataset.panel === panelName; tab.classList.toggle("is-active", active); tab.setAttribute("aria-selected", String(active)); });
    elements.panels.forEach((panel) => { const active = panel.dataset.panelContent === panelName; panel.classList.toggle("is-active", active); panel.hidden = !active; });
  }

  function renderRouteOptions() {
    const previousStart = elements.routeStart.value; const previousDestination = elements.routeDestination.value;
    const appendGroup = (select, label, items) => {
      const group = document.createElement("optgroup"); group.label = label;
      items.forEach((item) => { const option = document.createElement("option"); option.value = item.value; option.textContent = item.label; group.append(option); }); select.append(group);
    };
    [elements.routeStart, elements.routeDestination].forEach((select) => {
      select.innerHTML = '<option value="">Choose a location or node</option>';
      appendGroup(select, "Locations", state.locations.map((location) => ({ value: `location:${location.id}`, label: location.name })));
      appendGroup(select, "Routing nodes", state.network.nodes.map((node) => ({ value: `node:${node.id}`, label: node.name || node.id })));
    });
    elements.routeStart.value = previousStart; elements.routeDestination.value = previousDestination;
  }

  function resolveRouteEndpoint(value) {
    const [type, ...idParts] = String(value).split(":"); const id = idParts.join(":");
    if (type === "node") return { ok: Boolean(findNode(id)), nodeId: id, label: findNode(id)?.name || id };
    if (type === "location") {
      const location = findLocation(id); if (!location) return { ok: false, error: "Location does not exist." };
      const nodeId = location.destinationNodeId || location.arrivalNodeId;
      if (!nodeId) return { ok: false, error: `${location.name} has no destination or arrival routing node.` };
      if (!findNode(nodeId)) return { ok: false, error: `${location.name} references missing routing node ${nodeId}.` };
      return { ok: true, nodeId: String(nodeId), label: location.name };
    }
    return { ok: false, error: "Choose a route endpoint." };
  }

  function calculateRoute() {
    const start = resolveRouteEndpoint(elements.routeStart.value); const destination = resolveRouteEndpoint(elements.routeDestination.value);
    if (!start.ok || !destination.ok) { showRouteError(start.error || destination.error); return; }
    const result = Routing.dijkstra(state.network, start.nodeId, destination.nodeId, { accessibleOnly: elements.routeAccessible.checked });
    if (!result.ok) { showRouteError(result.error); clearRoutePolyline(); return; }
    state.routeResult = result; drawRoutePolyline(result.geometry);
    elements.routeResult.className = "route-result"; elements.routeResult.hidden = false; elements.routeResult.innerHTML = "";
    const title = document.createElement("h3"); title.textContent = `${start.label} → ${destination.label}`;
    const summary = document.createElement("p"); const minutes = Math.max(1, Math.ceil(result.totalDistance / 80));
    summary.textContent = `${result.totalDistance.toFixed(1)} m · about ${minutes} min walking`;
    elements.routeResult.append(title, summary);
    if (result.instructions.length) {
      const list = document.createElement("ol"); result.instructions.forEach((step) => {
        const item = document.createElement("li"); item.textContent = `${step.instruction || step.name} · ${step.distanceMeters.toFixed(1)} m`; list.append(item);
      }); elements.routeResult.append(list);
    }
    const bounds = new google.maps.LatLngBounds(); result.geometry.forEach((point) => bounds.extend(point)); if (!bounds.isEmpty()) state.map.fitBounds(bounds, 80);
  }

  function showRouteError(message) {
    state.routeResult = null; elements.routeResult.hidden = false; elements.routeResult.className = "route-result error"; elements.routeResult.textContent = message;
    showToast(message, "error");
  }

  function drawRoutePolyline(geometry) {
    clearRoutePolyline(); if (!geometry?.length || !state.map) return;
    state.routePolyline = new google.maps.Polyline({ map: state.map, path: geometry, strokeColor: "#e11d48", strokeOpacity: .95, strokeWeight: 8, zIndex: 8000, clickable: false });
  }
  function clearRoutePolyline() { if (state.routePolyline) { state.routePolyline.setMap(null); state.routePolyline = null; } }
  function clearRoute() { state.routeResult = null; clearRoutePolyline(); elements.routeResult.hidden = true; elements.routeResult.textContent = ""; }
  function assignRouteEndpointByMap(node) {
    const value = `node:${node.id}`;
    if (!elements.routeStart.value) elements.routeStart.value = value;
    else elements.routeDestination.value = value;
    activatePanel("route");
    if (elements.routeStart.value && elements.routeDestination.value) calculateRoute();
  }

  function runValidation() {
    state.validation = Data.validateEditorData(state.locations, state.network);
    const result = state.validation;
    elements.validationSummary.innerHTML = "";
    const strong = document.createElement("strong"); strong.textContent = `${result.errors} errors · ${result.warnings} warnings`;
    const details = document.createElement("div"); details.textContent = `${result.counts.locations} locations · ${result.counts.nodes} nodes · ${result.counts.edges} edges · ${result.componentCount} connected components`;
    elements.validationSummary.append(strong, details); elements.validationList.innerHTML = "";
    if (!result.issues.length) { const empty = document.createElement("div"); empty.className = "empty-state"; empty.textContent = "No validation issues found."; elements.validationList.append(empty); }
    result.issues.forEach((item) => {
      const button = document.createElement("button"); button.type = "button"; button.className = `validation-item ${item.severity}`;
      button.textContent = `${item.severity.toUpperCase()}: ${item.message}`;
      button.addEventListener("click", () => { if (["location", "node", "edge"].includes(item.entityType) && item.entityId) { selectRecord(item.entityType, item.entityId); focusRecord(item.entityType, item.entityId); } });
      elements.validationList.append(button);
    });
    activatePanel("validate"); showToast(result.errors ? `Validation found ${result.errors} errors.` : "Validation complete.", result.errors ? "error" : "info");
    return result;
  }

  function scheduleDraftSave() {
    window.clearTimeout(state.autosaveTimer);
    state.autosaveTimer = window.setTimeout(() => saveLocalDraft(true), 500);
  }

  function saveLocalDraft(silent = false) {
    try {
      const draft = { kind: "mavmaps-editor-backup", version: 1, timestamp: new Date().toISOString(), locations: Data.stableLocations(state.locations), network: Data.stableNetwork(state.network) };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      elements.draftStatus.textContent = `Last local draft: ${new Date(draft.timestamp).toLocaleString()}`;
      if (!silent) showToast("Local draft saved in this browser.");
    } catch (error) { showToast(`Local draft could not be saved: ${error.message}`, "error"); }
  }

  function inspectLocalDraft() {
    const raw = localStorage.getItem(DRAFT_KEY); if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (!Array.isArray(draft.locations) || !Array.isArray(draft.network?.nodes) || !Array.isArray(draft.network?.edges)) throw new Error("wrong structure");
      elements.draftBanner.hidden = false; elements.draftTime.textContent = new Date(draft.timestamp).toLocaleString();
      elements.draftBanner.dataset.draft = raw;
    } catch (error) {
      localStorage.removeItem(DRAFT_KEY); showToast(`A corrupted local draft was discarded (${error.message}).`, "warning", 6500);
    }
  }

  function restoreLocalDraft() {
    try {
      const draft = JSON.parse(elements.draftBanner.dataset.draft || localStorage.getItem(DRAFT_KEY));
      const before = snapshotData(); state.locations = Data.clone(draft.locations); state.network = Data.normalizeNetwork(draft.network);
      recordHistory(before, "restore local draft"); state.selected = null; state.pending = null; state.drawing = null;
      elements.draftBanner.hidden = true; renderAll(); renderEditorState(); showToast("Local draft restored.");
    } catch (error) { showToast(`Draft restore failed: ${error.message}`, "error"); }
  }

  function discardLocalDraft() {
    if (!window.confirm("Discard the saved local draft from this browser? Source JSON files will not be changed.")) return;
    localStorage.removeItem(DRAFT_KEY); elements.draftBanner.hidden = true; elements.draftStatus.textContent = "No local draft saved yet. Autosave is active."; showToast("Local draft discarded.");
  }

  function mergeById(existing, incoming) {
    const map = new Map(existing.map((item) => [String(item.id), Data.clone(item)]));
    incoming.forEach((item) => map.set(String(item.id), Data.clone(item)));
    return [...map.values()];
  }

  async function importJsonFile(file, kind) {
    let data;
    try { data = JSON.parse(await file.text()); }
    catch (error) { showToast(`Import failed: invalid JSON (${error.message}).`, "error", 6500); return; }
    const mode = elements.importMode.value;
    try {
      if (kind === "locations" && !Array.isArray(data)) throw new TypeError("Location imports must contain a JSON array.");
      if (kind === "network" && (!Array.isArray(data?.nodes) || !Array.isArray(data?.edges))) throw new TypeError("Routing imports need nodes and edges arrays.");
      if (kind === "backup" && (!Array.isArray(data?.locations) || !Array.isArray(data?.network?.nodes) || !Array.isArray(data?.network?.edges))) throw new TypeError("Combined backups need locations and network datasets.");
      if (mode === "replace" && !window.confirm(`Replace the current ${kind === "backup" ? "locations and routing network" : kind} with this file? You can undo this action.`)) return;
      mutate(`import ${kind}`, () => {
        if (kind === "locations") state.locations = mode === "merge" ? mergeById(state.locations, data) : Data.clone(data);
        else if (kind === "network") {
          const incoming = Data.normalizeNetwork(data);
          state.network = mode === "merge" ? { version: Math.max(state.network.version, incoming.version), nodes: mergeById(state.network.nodes, incoming.nodes), edges: mergeById(state.network.edges, incoming.edges) } : incoming;
        } else {
          const incoming = Data.normalizeNetwork(data.network);
          state.locations = mode === "merge" ? mergeById(state.locations, data.locations) : Data.clone(data.locations);
          state.network = mode === "merge" ? { version: Math.max(state.network.version, incoming.version), nodes: mergeById(state.network.nodes, incoming.nodes), edges: mergeById(state.network.edges, incoming.edges) } : incoming;
        }
        state.selected = null;
      });
      showToast(`${file.name} imported.`); runValidation();
    } catch (error) { showToast(`Import failed: ${error.message}`, "error", 6500); }
  }

  function ensureExportAllowed() {
    const validation = Data.validateEditorData(state.locations, state.network);
    if (!validation.errors) return true;
    return window.confirm(`Validation found ${validation.errors} error${validation.errors === 1 ? "" : "s"}. Export anyway for recovery or review?\n\nChoose Cancel to fix the errors first.`);
  }

  function downloadJson(filename, data) {
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportData(kind) {
    if (!ensureExportAllowed()) { activatePanel("validate"); runValidation(); return; }
    const locations = Data.stableLocations(state.locations); const network = Data.stableNetwork(state.network);
    const timestamp = new Date().toISOString();
    if (kind === "locations") downloadJson("locations.json", locations);
    else if (kind === "network") downloadJson("routing-network.json", network);
    else if (kind === "backup") downloadJson("mavmaps-editor-backup.json", { kind: "mavmaps-editor-backup", version: 1, timestamp, locations, network });
    else if (kind === "public") {
      const publicLocations = locations.filter((item) => getAccessVisibility(item) === "public");
      const publicNodes = network.nodes.filter((item) => getAccessVisibility(item) === "public"); const nodeIds = new Set(publicNodes.map((item) => String(item.id)));
      const publicEdges = network.edges.filter((item) => getAccessVisibility(item) === "public" && nodeIds.has(String(item.from)) && nodeIds.has(String(item.to)));
      downloadJson("mavmaps-public-safe-backup.json", { kind: "mavmaps-public-safe-backup", warning: "Convenience filter only; not access control.", version: 1, timestamp, locations: publicLocations, network: { version: network.version, nodes: publicNodes, edges: publicEdges } });
    } else if (kind === "geojson") downloadJson("mavmaps-editor.geojson", toGeoJson(locations, network));
    showToast("Export download prepared. Repository files were not overwritten.");
  }

  function toGeoJson(locations, network) {
    const features = [];
    locations.forEach((item) => features.push({ type: "Feature", geometry: { type: "Point", coordinates: [item.lng, item.lat] }, properties: { entityType: "location", ...item, lat: undefined, lng: undefined } }));
    network.nodes.forEach((item) => features.push({ type: "Feature", geometry: { type: "Point", coordinates: [item.lng, item.lat] }, properties: { entityType: "node", ...item, lat: undefined, lng: undefined } }));
    network.edges.forEach((item) => features.push({ type: "Feature", geometry: { type: "LineString", coordinates: (item.geometry || []).map((point) => [point.lng, point.lat]) }, properties: { entityType: "edge", ...item, geometry: undefined } }));
    return { type: "FeatureCollection", features };
  }

  function resetCampusView() { if (state.map) { state.map.setCenter(CAMPUS_CENTER); state.map.setZoom(17); state.map.setMapTypeId(elements.mapType.value); } }

  function bindEvents() {
    document.querySelector("#connect-paths-button").addEventListener("click", () => {
      if (!window.confirm("Connect outdoor paths throughout this draft within 2 meters? Same-level crossings will become junctions. Review for walls or parallel paths afterward. This can be undone.")) return;
      let report;
      mutate("connect nearby paths", () => {
        report = Data.connectNearbyPaths(state.network, state.locations);
        clearRoute();
        state.selected = null;
      });
      runValidation();
      showToast(`Connected paths: ${report.junctions} new junctions, ${report.splits} splits, ${report.merges} merged nodes. Undo to revert.`);
    });
    elements.modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
    elements.undo.addEventListener("click", undo); elements.redo.addEventListener("click", redo);
    elements.delete.addEventListener("click", deleteSelected); elements.cancel.addEventListener("click", () => cancelCurrentOperation());
    elements.finishPath.addEventListener("click", finishDrawing); elements.resetView.addEventListener("click", resetCampusView);
    elements.sidebarToggle.addEventListener("click", () => {
      const collapsed = elements.workspace.classList.toggle("sidebar-collapsed"); elements.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    });
    elements.tabs.forEach((tab) => tab.addEventListener("click", () => activatePanel(tab.dataset.panel)));
    elements.search.addEventListener("input", renderRecordList);
    elements.entityFilter.addEventListener("change", () => { renderCategoryFilter(); renderRecordList(); });
    elements.categoryFilter.addEventListener("change", renderRecordList);
    elements.layerInputs.forEach((input) => input.addEventListener("change", () => { state.layers[input.dataset.layer] = input.checked; renderAll(); }));
    elements.mapType.addEventListener("change", () => state.map?.setMapTypeId(elements.mapType.value));
    elements.routeForm.addEventListener("submit", (event) => { event.preventDefault(); calculateRoute(); });
    elements.reverseRoute.addEventListener("click", () => { const start = elements.routeStart.value; elements.routeStart.value = elements.routeDestination.value; elements.routeDestination.value = start; if (elements.routeStart.value && elements.routeDestination.value) calculateRoute(); });
    elements.clearRoute.addEventListener("click", clearRoute); elements.validate.addEventListener("click", runValidation);
    elements.saveDraft.addEventListener("click", () => saveLocalDraft(false)); elements.restoreDraft.addEventListener("click", restoreLocalDraft); elements.discardDraft.addEventListener("click", discardLocalDraft);
    document.querySelectorAll("[data-import]").forEach((button) => button.addEventListener("click", () => { state.importKind = button.dataset.import; elements.importFile.value = ""; elements.importFile.click(); }));
    elements.importFile.addEventListener("change", () => { const file = elements.importFile.files?.[0]; if (file && state.importKind) importJsonFile(file, state.importKind); });
    document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => exportData(button.dataset.export)));

    document.addEventListener("keydown", (event) => {
      if (isTypingTarget(event.target)) {
        if (event.key === "Escape") event.target.blur();
        return;
      }
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (event.key === "Escape") { event.preventDefault(); cancelCurrentOperation(); return; }
      if (event.key === "Enter" && state.mode === "draw-path") { event.preventDefault(); finishDrawing(); return; }
      if ((event.key === "Backspace" || event.key === "Delete") && removeLastDrawingPoint()) { event.preventDefault(); return; }
      if ((event.key === "Backspace" || event.key === "Delete") && state.selected) { event.preventDefault(); deleteSelected(); return; }
      const shortcuts = { v: "select", l: "add-location", n: "add-node", p: "draw-path", r: "route-test" };
      if (!modifier && shortcuts[event.key.toLowerCase()]) setMode(shortcuts[event.key.toLowerCase()]);
    });

    window.addEventListener("beforeunload", (event) => { if (state.dirty) { event.preventDefault(); event.returnValue = ""; } });
  }

  async function bootstrap() {
    if (!Data || !Routing) { showMapMessage("Editor modules missing", "Reload the page after confirming js/data-utils.js and js/routing.js are available."); return; }
    bindEvents(); renderCategoryFilter(); setMode("select");
    try {
      await loadSourceData(); renderEditorState(); markSourceLoaded(); inspectLocalDraft();
    } catch (error) {
      console.error(error); showMapMessage("Editor data could not load", `${error.message} Serve this folder with an HTTP server instead of opening the file directly.`); return;
    }
    try {
      const config = await loadProjectApiKey(); await loadGoogleMaps(config.key); await initializeMap(config.mapId);
    } catch (error) {
      console.error(error); showMapMessage("Google Maps could not load", `${error.message} Check the key, billing, Maps JavaScript API, and localhost referrer restriction.`);
    }
  }

  window.gm_authFailure = () => showMapMessage("Google Maps authorization failed", "Check the existing browser key in index.html, billing, enabled APIs, and localhost website restrictions.");
  bootstrap();
})();
