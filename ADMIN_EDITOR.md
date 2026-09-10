# MavMaps Admin and Routing Editor

`admin.html` is a local data-authoring tool for campus locations and the pedestrian-routing graph. It is not linked from the public MavMaps page and it does not send editor data to a backend, database, routing service, or AI service.

> **Security warning:** An unlisted URL is not access control. Do not deploy this page or detailed internal routing data publicly without school approval and school-controlled authentication or network restrictions.

## Open the editor locally

1. Make sure the Maps JavaScript API key already configured in `index.html` permits `http://localhost:8000/*` as a website referrer.
2. Open Terminal in the project folder.
3. Start a local server:

   ```bash
   python3 -m http.server 8000
   ```

4. Open `http://localhost:8000/admin.html`.

The editor reads the same API key and map ID configuration used by `index.html`; it does not contain a second key. It loads `data/locations.json` and then `data/routing-network.json`. If the routing file is missing or empty, the editor starts with an empty network and shows a useful message for parse failures.

Do not open `admin.html` as a `file://` page. Browser security rules block its JSON requests.

## Interface overview

The top bar contains five modes:

- **Select:** inspect and edit an existing location, node, or path.
- **Location:** click the map to capture coordinates for a new location.
- **Node:** click the map to capture coordinates for a routing node.
- **Path:** draw a walkable path between reusable nodes.
- **Route test:** select endpoints and calculate a local shortest path.

The right sidebar contains searchable data, layer controls, route testing, validation, local drafts, and import/export controls. It can be collapsed with the arrow on the map edge. The status strip shows the active mode, operation hint, record counts, and unsaved state.

Keyboard controls do not fire while typing in a field:

| Key | Action |
|---|---|
| `Escape` | Cancel the current operation or leave the active input |
| `Enter` | Finish a valid path draft |
| `Backspace` / `Delete` | Remove the last unsaved path point; otherwise confirm deletion of the selected record |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `V`, `L`, `N`, `P`, `R` | Select, Location, Node, Path, or Route Test mode |

## Add and edit locations

1. Choose **Location** mode.
2. Click the exact point on the map. A temporary red/category marker appears and latitude/longitude are filled automatically.
3. Complete the form. The ID is generated from the highest existing numeric ID.
4. Choose **Add location**. Canceling removes the temporary marker.

In Select mode, click a location marker or a location in the searchable list. The selected marker becomes larger and draggable. Dragging it updates the stored coordinates. The editor also supports duplication, deletion, parent selection, arrival/destination route-node dropdowns, and assigning a node by clicking its blue map marker.

Existing records are not rewritten just because the editor loads them. Optional fields are added only after the record is edited and exported.

### Location visibility fields

MavMaps has two separate visibility concepts:

- `accessVisibility`: `public`, `community`, `staff`, or `hidden`. This controls editor layers and the public-safe convenience export.
- `markerDisplay`: `always`, `zoom-dependent`, `search-only`, `event-only`, or `hidden`. This controls public-map marker behavior.

The existing app historically stores marker display in `visibility`. For compatibility, the editor preserves/writes that field and also writes `markerDisplay`. Existing records without `accessVisibility` default to `public`; existing records without `markerDisplay` use their legacy `visibility` value.

The public-safe export is only a filter. It does not prevent someone from downloading a publicly deployed source JSON file.

## Add and edit routing nodes

1. Choose **Node** mode.
2. Click the map.
3. Name the node, select a type, enter its floor/level, accessibility, and visibility, then save.

Node IDs are readable slugs such as `node-quad-entrance`; numeric suffixes prevent duplicates. Nodes are blue diamonds and are visually distinct from location pins. Selected nodes are draggable. Moving one updates its coordinates, every connected edge endpoint, edge length, and visible edge rendering.

Two nodes may share latitude/longitude when they represent different levels. Use stairs, elevator, ramp, or an explicitly reviewed vertical-connector type for edges that change levels.

Deleting a connected node warns that its edges will also be deleted. Location references to the node are cleared so broken links are not left behind.

## Draw and edit paths

1. Choose **Path** mode.
2. Click an existing node, or click open map space to make an unsaved start node.
3. Click intermediate geometry points.
4. Click an existing node to snap and finish, or click a final map point and press `Enter` / **Finish path**.
5. Review the edge form and save.

While drawing, a purple dashed preview follows the pointer. Nearby nodes gain a green snap highlight. The snap distance changes with zoom so it remains intuitive. `Backspace` removes the latest unsaved point and `Escape` cancels the full draft.

If a new endpoint is close to the middle of an existing edge, the editor offers to create a junction. Accepting creates a routing node, splits the old edge into two geometry-preserving edges, recalculates their lengths, and connects the new edge. The selected-edge form also has **Split at midpoint** for a deliberate split.

New paths that cross existing paths without a shared node show a warning. You may save them disconnected when the paths are on different floors or one is a tunnel. Validation continues to flag the crossing for review. The editor does not assume that every visual crossing is a real junction.

In Select mode, click a path to emphasize it and enable Google’s editable polyline handles. Drag a vertex to reshape it; drag a midpoint handle to insert a vertex. Right-click a non-endpoint vertex to remove it. Path length recalculates after geometry changes. Moving an endpoint vertex moves its attached routing node and updates all other edges connected to that node. The form can reverse direction, reconnect either endpoint with a dropdown, change metadata, split, or delete the edge.

## Path and node metadata

Node types:

```text
intersection, bend, entrance, gate, crosswalk, tunnel-entrance,
tunnel-exit, stairs, elevator, room, landmark, other
```

Edge types:

```text
walkway, sidewalk, crosswalk, tunnel, corridor, stairs, elevator,
parking-path, ramp, other
```

Edges also support one-way/bidirectional travel, accessibility, public/community/staff/hidden visibility, open/closed/restricted status, forward and reverse instructions, and a positive cost multiplier. Length is always calculated from full geometry.

## Test routes

1. Open **Route** or choose Route Test mode.
2. Choose a start and destination. You can select routing nodes directly, or locations that have a destination/arrival node assigned.
3. Optionally select **Accessible route only**.
4. Calculate.

The reusable `js/routing.js` module builds an adjacency list and runs Dijkstra’s algorithm. It uses `lengthMeters × costMultiplier`, respects one-way edges, excludes closed edges, and excludes stairs/inaccessible edges in accessible mode. Results contain ordered node IDs, edge IDs, traversal directions, full correctly oriented geometry, total distance, and instructions. Walking time uses a simple 80-meters-per-minute estimate.

For a location, the route tester prefers `destinationNodeId`, then falls back to `arrivalNodeId`. Missing assignments and disconnected graphs produce clear on-screen errors.

## Local drafts, undo, and redo

Every meaningful change schedules an autosave to this browser’s `localStorage`. The draft contains locations and routing data plus a timestamp. On a later visit, the editor offers to restore or discard it; it never silently replaces freshly loaded repository data.

**Save local draft** writes immediately. This does not overwrite files in the project. Browser storage can be cleared, so export important work regularly.

Undo/redo stores up to 50 bounded data snapshots and covers add, edit, move, delete, split, import, and representative geometry operations. Making a new edit after undo clears redo history.

## Import and export

The Files panel imports:

- a location array;
- a routing-network object;
- a combined MavMaps editor backup.

Choose **Replace** or **Merge by ID** before importing. Replace requires confirmation. Malformed JSON and wrong structures show on-screen errors.

Exports include:

1. `locations.json`
2. `routing-network.json`
3. a combined editor backup
4. GeoJSON for visual review
5. a public-safe combined backup

Records are sorted by ID, formatted with two-space indentation, and retain full coordinate precision for readable Git diffs. Validation errors block a clean export unless you explicitly choose recovery/review export.

To update the repository:

1. Export the intended file.
2. Review the JSON and the validation report.
3. Keep a combined backup outside the deployed site.
4. Replace `data/locations.json` and/or `data/routing-network.json` with the reviewed downloads.
5. Run the tests below.
6. Reload both the public map and editor through the local server.

## Validation

Open **Validate** and choose **Run**. Click an issue to select and focus its related map object.

Checks cover required location fields, duplicate IDs, invalid/out-of-bounds coordinates, categories, parent cycles, missing node assignments, search-only data, node levels, isolated and near-duplicate nodes, endpoint references, geometry/endpoints, zero length, duplicate connections, directionality, stairs accessibility, inappropriate level changes, metadata inconsistencies, disconnected components, public/nonpublic route mismatches, accessible-node dead ends, and path crossings without junctions.

Run command-line checks after export:

```bash
node scripts/validate-data.mjs
node scripts/test-admin.mjs
```

`test-admin.mjs` uses a synthetic graph, not fabricated campus routes. It tests shortest paths, geometry reversal, one-way restrictions, closures, stairs/accessibility, disconnected errors, cost multipliers, validation, source loading, and JSON round trips.

## Routing schema

`data/routing-network.json` is deliberately empty until school-approved paths are authored:

```json
{
  "version": 1,
  "nodes": [],
  "edges": []
}
```

A full node and edge follow this shape:

```json
{
  "nodes": [
    {
      "id": "node-example",
      "name": "Verified name",
      "lat": 29.74000001,
      "lng": -95.43000001,
      "level": 0,
      "type": "entrance",
      "accessible": true,
      "visibility": "community",
      "intentionallyIsolated": false
    }
  ],
  "edges": [
    {
      "id": "edge-example",
      "from": "node-example",
      "to": "node-example-2",
      "name": "Verified walkway name",
      "type": "walkway",
      "bidirectional": true,
      "accessible": true,
      "visibility": "community",
      "status": "open",
      "lengthMeters": 42.7,
      "costMultiplier": 1,
      "geometry": [
        { "lat": 29.74000001, "lng": -95.43000001 },
        { "lat": 29.74010001, "lng": -95.43010001 }
      ],
      "instructionForward": "",
      "instructionReverse": ""
    }
  ]
}
```

## Known limitations

- This is a local static editor, not an authenticated content-management system.
- The browser cannot silently write repository files; downloads must be reviewed and copied manually.
- Snapping uses an adaptive ground-distance threshold, not a surveyed tolerance.
- Crossing detection is geometric and two-dimensional. Human review must decide tunnels, bridges, levels, and true junctions.
- Edge splitting targets the closest segment or a geometric midpoint; inspect the resulting geometry after every split.
- Polylines do not model indoor walls or floor plans.
- Validation cannot prove that a route complies with changing school security, construction, or accessibility conditions.
- The initial route network is intentionally empty. Do not invent paths; map only school-approved walkways and access rules.
- Aerial imagery can be older than current campus construction.

## Safe campus-mapping sequence

1. Obtain school approval for the data fields and who may access them.
2. Map major outdoor entrances and intersections first.
3. Connect a small, verified open walkway network.
4. Run validation and test both directions of representative routes.
5. Add accessibility and one-way/closed metadata.
6. Assign verified locations to arrival/destination nodes.
7. Keep internal backups outside public hosting.
8. Deploy detailed data only behind real school-controlled access restrictions.
