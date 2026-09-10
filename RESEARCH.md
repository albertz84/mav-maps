# Research notes

Research was performed on July 15–16, 2026. The goal was to use real St. John's School names while separating verified public facts from inferred coordinates and maintainer-supplied corrections.

## Summary of findings

St. John's School is a coeducational K–12 independent day school at 2401 Claremont Lane in Houston. The campus is not one simple block. It has four useful geographic areas:

- **Cullen (North) Campus**, north of Westheimer Road: Upper School academic buildings, The Quad, Flores Hall and Campus Center, the Great Lawn, and Upper School support spaces.
- **Brown (South) Campus**, south of Westheimer: St. John’s Lower School, George’s Middle School, VST Fine Arts Center, indoor athletics, Skip Lee Field, and other fields.
- **Scottland Yard**, south of West Alabama near Buffalo Speedway: Finnegan Field, Scotty Caven Field, and The Angie Kensinger Pavilion.
- **Taub Campus**, west of Buffalo Speedway: Taub Parking Garage, Taub Surface Parking Lot, Randall Field, Ligums Practice Facility, and Blanton Family Tennis Center.

The school reports **41 total acres**, including **13 acres of Taub land**. The two primary campuses are joined by the Avery-Glasgow and Western Passage/Fine Arts pedestrian tunnels beneath Westheimer.

### Approximate geographic footprint

- App center: `29.74075, -95.43035`
- Destination extent used by the data: approximately `29.7369–29.7435` latitude and `-95.4325–-95.4271` longitude
- The interface now allows unrestricted panning and Google's full available zoom range; the destination extent above is still useful when checking new coordinates.

These bounds include all four campus areas and a small context buffer. The prompt's initial description of Westheimer as a northern boundary describes the Brown Campus, but not the Cullen Campus, which is north of Westheimer.

## Sources consulted

### Primary and official sources

1. [St. John's Campus Map — January 2025](https://storage.googleapis.com/anet_user_files/meet/tf/571634/25-26_Campus_Map.pdf) — the most useful location inventory and layout. It names buildings, fields, internal destinations, tunnels, gates, and Taub facilities. It also marks a construction area.
2. [St. John's Campus Map — revised December 2024](https://www.haverford.edu/sites/default/files/Office/Admission/st.-johns-school-map.pdf) — a public mirror of the school's branded map. Used to cross-check the legend, building letters, gates, interior room codes, and street relationships.
3. [Official campus construction page](https://www.sjs.org/support-st-johns/campus-construction) — current capital plan and status: Taub tennis and softball opened in spring 2025; Angie Kensinger Pavilion opened September 2025; Facilities Operations Center was nearly complete; new Lower and Middle School projects and Skip Lee work are part of a multi-year program.
4. [Official athletics facilities page](https://mavs.sjs.org/facilities) — verified Randall Field, Marilyn & Fred Lummis Family Dugout, Ligums Practice Facility, Blanton Family Tennis Center, softball, Finnegan and Scotty Caven fields, Liu and Owsley courts, Skip Lee Field, SSAC, Ankenman Tradition Room, and training spaces.
5. [SJS at a Glance](https://www.sjs.org/about-sjs/sjs-at-a-glance) — verified 41 total acres, 13 Taub acres, division structure, and current school facts.
6. [Flores Hall opening article](https://www.sjs.org/news-detail?pk=776402) — verified the Campus Center location and Flores Hall, Fondren Plaza, Maverick Café, College Counseling, Admission, Sarofim studios, and the scale/function of the dining hall.
7. [Official April 2026 calendar](https://www.sjs.org/calendar?eDate=20260430&sDate=20260401) — current-use cross-check for Stasney Hall, Chao Family Assembly Hall (`CCChaoHall`), Lowe Theater, Owsley Court, Randall Field, and chapel at St. John the Divine.
8. [Official contact page](https://www.sjs.org/contact-us) — verified the main address and school office functions, including Advancement/Business at 3401 Westheimer.
9. [Official Lower School page](https://www.sjs.org/academics/lower-school) — verified the Lower School library's role and public description.
10. [Texas accessibility project: new Brown Campus Lower School](https://www.tdlr.texas.gov/TABS/Search/Print/TABS2026002149) — project address 3358 West Alabama, planned February 2026–October 2027 construction window, new two-story Lower School and underground garage.
11. [Texas accessibility project: Skip Lee Field](https://www.tdlr.texas.gov/TABS/Projects/TABS2025022160) — planned November 2025–September 2026 renovation with detention, turf field, and track work.

### Secondary geographic cross-checks

12. [St. John's School campus overview on Wikipedia](https://en.wikipedia.org/wiki/St._John%27s_School_%28Texas%29) — cross-checked the North/South campus arrangement, Westheimer tunnels, division locations, Scottland fields, Taub acquisition, and The Quad. Names were not accepted from Wikipedia alone when an official source was available.
13. [OpenStreetMap campus feature](https://www.openstreetmap.org/way/611307468) and a July 2026 OpenStreetMap map extract — used for road alignment, building footprints, the main address, parking garage outline, and nearby feature geometry.
14. [Skip Lee Field geographic listing](https://mapcarta.com/21803544) — provided the field's published center coordinate (`29.74051, -95.42855`) and alternate name McMurrey Memorial Track; cross-checked with the TDLR project.
15. [St. John's School geographic listing](https://mapcarta.com/W611307468) — cross-checked the main school feature and surrounding roads. It was not treated as an indoor-location source.

### Technical implementation references

16. [Google Maps JavaScript API loading guide](https://developers.google.com/maps/documentation/javascript/load-maps-js-api) — verified the direct async loader, callback, weekly version, and `importLibrary` sequence.
17. [Google Advanced Markers setup](https://developers.google.com/maps/documentation/javascript/advanced-markers/start) and [marker creation guide](https://developers.google.com/maps/documentation/javascript/advanced-markers/add-marker) — verified `AdvancedMarkerElement`, the marker library, map ID requirement, and `DEMO_MAP_ID` testing use.
18. [Google map types](https://developers.google.com/maps/documentation/javascript/maptypes) and [controls](https://developers.google.com/maps/documentation/javascript/controls) — verified satellite/roadmap IDs and explicit control configuration.
19. [Official SJS website](https://www.sjs.org/) — source for the official school seal saved locally as `assets/sjs-seal.png`.
20. **Map maintainer coordinate lists, July 16, 2026** — direct user-supplied names, coordinates, removals, and fourteen gate addresses; treated as the newest source of truth for matching pins.
21. [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) — address anchors for gates where a usable point was returned. Gate positions were then checked against the school’s January 2025 diagram; the resulting pins remain approximate until checked at the physical entrances.

Google Maps and satellite imagery were considered as geographic context through public search results, but no Google data was scraped or reproduced. The map's final pins are original approximations derived from official diagrams, street/address anchors, and open geographic features.

## Coordinate method and confidence

The official campus map is a diagram, not a surveyed GIS file. Coordinates were produced by:

1. Anchoring the four campus areas to Westheimer Road, West Alabama Street, Claremont Lane, and Buffalo Speedway.
2. Cross-checking official gate addresses and OpenStreetMap road/building geometry.
3. Using the published Skip Lee Field center as a precise field anchor.
4. Interpolating building centers and field centers from the January 2025 campus diagram.
5. Giving multiple destinations inside one building small, intentional offsets so their marker labels can be selected. Those offsets do **not** claim door-level accuracy.

Confidence levels used below:

- **V / A**: name and association verified; coordinate approximate.
- **V / G**: name verified; coordinate supported by a geographic feature or strong road/field anchor.
- **U / G**: name and precise coordinate supplied directly by the map maintainer on July 16, 2026.

### Map-maintainer coordinate updates — July 16, 2026

The map maintainer supplied two rounds of corrections after reviewing the working map. Matching records use the maintainer’s exact names and coordinates rather than the earlier diagram-based approximations. All placeholder/example entries were removed.

The second correction removed the standalone Lowe Theater, Stasney Hall, Fine Arts Annex, Facilities Operations Center, Advancement and Business Offices, the prior Gate 1 marker, all prior Taub-area pins, all earlier Lower School pins, and all Q-coded destinations except Q101 and Q112. The requested Taub, Lower School, athletic, and gate records replaced them. VST remains as a destination and its description identifies Lowe Theatre as being inside the center.

The third correction supplied exact coordinates for Gates 1–14, Admissions, College Counseling, and Taub Lot Crosswalk; renamed Softball Field to Softball Complex and Tennis Courts to Blanton Family Tennis Center; and removed the Alumni Athletic Center marker. It also added M101–M306 and Q101–Q224 as `search-only` indoor rooms. Those rooms intentionally share their parent building’s coordinate and never create map markers.

The fourth correction declared a complete explicit allowlist. The dataset was pruned to only the names supplied by the maintainer, including the M/Q room ranges and Gates 1–14. Senior Country and Maverick Cafe received maintainer-supplied coordinates. The previously requested campus-wide St. John's School marker was also removed because it was not repeated in the final allowlist.

The fifth correction added maintainer-supplied coordinates for Avery-Glasgow Tunnel Entrance, Skip Lee Field and McMurrey Memorial Track, Owsley Court, The Church of St. John the Divine, and a new St. John's School overview marker. The overview marker uses `visibility: null`, `minZoom: 0`, and `maxZoom: 16`: it is visible below zoom 16 and disappears when the zoom-16 landmark tier enters. Admissions Office was moved to zoom 17 and given elevated collision precedence so it remains visible near other Campus Center destinations.

The maintainer’s third correction supplied exact pin coordinates for Gates 1–14, replacing the earlier address-derived approximations. One address discrepancy still needs school confirmation: the January 2025 diagram lists Gate 14 as 2700 Buffalo Speedway, while the maintainer’s address list assigns 3401 Westheimer Road to both Gate 13 and Gate 14. The app follows the maintainer’s latest coordinates and address list.

## Included location inventory and rationale

| ID | Location | Status | Why it is included |
|---:|---|:---:|---|
| 2 | The Quad | U / G | Historic focal point; coordinate replaced with the maintainer-supplied point. |
| 6 | The Great Lawn | U / G | Named outdoor landmark; display name and coordinate updated by the maintainer. |
| 7 | Stude/Sarofim Learning Resource Center | V / A | Upper School library, office, nurse, and student-support hub. |
| 8 | Mewbourne | U / G | Named Upper School academic building; display name and coordinate updated. |
| 10 | Fine Arts Tunnel Entrance | U / G | South-side endpoint of the Western Passage / Fine Arts Tunnel. |
| 13 | Virginia Stuller Tatham (VST) Fine Arts Center | U / G | Major arts landmark; its description identifies Lowe Theatre inside VST. |
| 14 | George’s Middle School | U / G | Maintainer-supplied name and coordinate for the Middle School building. |
| 15 | Athletic Facilities | U / G | Maintainer-supplied general athletic-facilities destination; SSAC retained as the building/search alias. |
| 17 | Big Red Pavilion | U / G | Maintainer-supplied name and coordinate for the covered athletic space. |
| 18 | Admissions Office | U / G | Maintainer-supplied name and coordinate in the Campus Center. |
| 19 | College Counseling Office | V / A | Verified Campus Center office used by students and families. |
| 29 | Library (Floor 2) | U / G | Maintainer-supplied display name, floor, and coordinate; Taub Library/S201 retained as search aliases. |
| 32 | Chao Assembly Hall | U / G | Frequent event venue; name and coordinate updated by the maintainer. |
| 40 | Spirit Store | V / A | Practical visitor/student retail destination. |
| 41 | Flores Dining Hall | U / G | Main Middle/Upper dining hall; display name and coordinate updated. |
| 42 | Maverick Cafe | U / G | Maintainer-supplied display name and coordinate. |
| 43 | Frankel Balcony and Dining Room (Floor 2) | U / G | Named dining/event room; floor, display name, and coordinate updated. |
| 47 | Softball Complex | U / G | Maintainer-supplied display name and coordinate. |
| 48 | Liu Court | U / G | Verified competition court with maintainer-supplied coordinate. |
| 50 | Ankenman Tradition Room | U / G | Named SSAC meeting/tradition space; coordinate supplied by the maintainer. |
| 51 | Finnegan Field | U / G | Maintainer-supplied Scottland Yard field coordinate. |
| 52 | Scotty Caven Field | U / G | Maintainer-supplied Scottland Yard field coordinate. |
| 53 | The Angie Kensinger Pavilion | U / G | Maintainer-supplied display name and coordinate. |
| 55 | Taub Parking Garage | U / G | Replacement Taub garage pin supplied by the maintainer. |
| 56 | Blanton Family Tennis Center | U / G | Maintainer-supplied display name and coordinate. |
| 58 | Ligums Practice Facility | U / G | Maintainer-supplied replacement coordinate. |
| 59 | Randall Field | U / G | Main Taub baseball field with maintainer-supplied coordinate. |
| 61 | Taub Surface Parking Lot | U / G | Maintainer-supplied replacement parking pin. |
| 63 | Drop-off Circle | U / G | Maintainer-supplied arrival name and coordinate. |
| 69 | Senior Country | U / G | Maintainer-supplied name and coordinate. |
| 74 | The Quad Restrooms | U / G | Maintainer-supplied northern Quad restroom destination. |
| 78 | Mewbourne Restrooms | U / G | Maintainer-supplied restroom destination in Mewbourne Hall. |
| 79 | The Plaza | U / G | Maintainer-supplied outdoor gathering destination. |
| 80 | Faculty Parking Entrance | U / G | Maintainer-supplied parking entrance; categorized as parking. |
| 81 | The Atrium | U / G | Maintainer-supplied interior gathering destination. |
| 82 | Q101 | U / G | Search-only room using The Quad’s parent coordinate. |
| 83 | Q112 | U / G | Search-only room using The Quad’s parent coordinate. |
| 84 | Quad Restrooms | U / G | Maintainer-supplied southern Quad restroom destination. |
| 85 | Fine Arts Tunnel Exit | U / G | Maintainer-supplied north-side endpoint of the Fine Arts Tunnel. |
| 86 | Senior Parking Lot | U / G | Maintainer-supplied student parking destination. |
| 87 | Reserved Parking Lot | U / G | Maintainer-supplied restricted parking destination. |
| 88 | Parking Lot | U / G | Maintainer-supplied parking destination at the southern edge of the map. |
| 89–102 | Gate 1 through Gate 14 | U / G | Exact entrance coordinates supplied by the maintainer in the third correction. |
| 103 | St. John’s Lower School | U / G | Sole requested Lower School building pin, using the maintainer’s coordinate. |
| 104 | Lower School Playground | U / G | Sole requested Lower School play-area pin, using the maintainer’s coordinate. |
| 105 | Taub Lot Crosswalk | U / G | Maintainer-supplied display name and coordinate. |
| 106–123 | M101–M306 | U / A | Search-only Mewbourne rooms using the Mewbourne parent coordinate. |
| 124–169 plus 82/83 | Q101–Q224 | U / A | Search-only Quad rooms using The Quad parent coordinate. |
| 170 | Avery-Glasgow Tunnel Entrance | U / G | Maintainer-supplied entrance name and coordinate. |
| 171 | Skip Lee Field and McMurrey Memorial Track | U / G | Maintainer-supplied display name and coordinate. |
| 172 | Owsley Court | U / G | Maintainer-supplied court coordinate. |
| 173 | The Church of St. John the Divine | U / G | Maintainer-supplied display name and coordinate. |
| 174 | St. John's School | U / G | Maintainer-supplied overview coordinate; visible only below zoom 16. |
| 175 | Fine Arts Annex | U / G | Maintainer-supplied display name and coordinate. |

## Room-number policy

No specific room number was invented. The maintainer explicitly supplied the M101–M306 and Q101–Q224 ranges. These are searchable placeholders for indoor position only: they use the coordinate of Mewbourne or The Quad and have `search-only` visibility. Floors follow the room number’s leading digit; the school should still confirm assignments, accessibility, entrances, and elevator details.

## Marker zoom hierarchy

Every zoom-dependent location has an integer `minZoom`; search-only rooms use `null`. The initial hierarchy is:

- **Zoom 16 — 11 campus landmarks:** division buildings, major fields, The Quad, VST, Athletic Facilities, and Taub Parking Garage.
- **Zoom 17 — 19 primary destinations:** dining, library, Admissions, major outdoor areas, parking, the church, and secondary athletic facilities.
- **Zoom 18 — 19 building-level destinations:** gates, College Counseling, courts, Fine Arts Annex, and Spirit Store.
- **Zoom 19 — 13 fine details:** restrooms, tunnel entrances, smaller interior spaces, entrances, and Taub Lot Crosswalk.
- **Search-only — 66 nested rooms:** M101–M306 and Q101–Q224; these never create markers.
- **Null visibility — 1 overview marker:** visible below zoom 16 with `minZoom: 0`, `maxZoom: 16`, and required collision behavior.

Each integer increase roughly doubles the displayed map scale, making 16–19 a useful four-step range for a campus of this size. Marker collision handling still decides which overlapping eligible labels are drawn.

## Direction modes

Every location includes `directions: ["walking"]`. Driving is additionally enabled for Gates 1–14, all seven parking-category destinations, and The Church of St. John the Divine. Indoor rooms and campus-interior destinations intentionally omit driving because their coordinates may not correspond to a vehicle-accessible road or approved entrance.

## Active construction and review priorities

1. **New Lower School:** Texas project records show a new two-story Lower School and underground garage planned at 3358 West Alabama from February 2026 through October 2027. The official school page places it on the back athletic field between the track and West Alabama. Current carpool, fields, and pedestrian routes may differ from the January 2025 map.
2. **Skip Lee Field:** A major detention, turf, and track project is scheduled through September 2026. It is not included in the final explicit location allowlist.
3. **Future Middle School:** The school plans a new Middle School where the current Lower School sits, plus a Middle School green. No separate marker was created because timing and final public layout are not yet fixed.
4. **Gate review:** Confirm each gate pin at the physical entrance, especially Gate 14’s address discrepancy, current security rules, and which entrances visitors may use.
5. **Main arrival:** Confirm the current visitor gate, security desk, carpool circles, accessible entrances, and event-specific parking.
6. **Indoor data:** Add only school-approved classrooms, restrooms, and accessibility information.

## Known issues

- The administration editor intentionally begins with an empty `data/routing-network.json`. No pedestrian nodes or paths were fabricated; a school-approved maintainer must author and verify the network locally.
- The administration page is an internal development tool with no authentication. It must not be publicly deployed with detailed routing data without school approval and real access control.
- Automated routing, validation, syntax, JSON, and local HTTP checks pass. This execution environment did not expose an interactive browser surface for click/drag visual QA, so the manual workflows in `ADMIN_EDITOR.md` should receive a final local browser pass before routing data is relied on.
- The displayed coordinates come from the map maintainer but are not a surveyed indoor-navigation dataset. Search-only M/Q rooms intentionally share their parent location’s coordinate.
- Aerial imagery may lag behind the 2025–2027 construction program.
- The Google `DEMO_MAP_ID` is suitable for evaluation; the owner should create a production map ID before public launch.
- Without an API key, the app intentionally shows a setup message instead of generating Google authentication console errors.
- Zoom-dependent labels appear when the map reaches their individual `minZoom` from 16 through 19; collision handling can still hide labels in crowded areas. Search-only M/Q rooms never create markers.
- GPS can be poor indoors and does not know the user's floor.
- Directions are straight to a coordinate through Google Maps and are not school-approved accessible or security routes.
- Public web sources do not provide complete restroom positions, classroom assignments, or detailed floor plans. Mewbourne/Quad restrooms and the M/Q room ranges came directly from the map maintainer rather than a public directory.
- Gate coordinates now come directly from the map maintainer. Gate 14’s stored address still follows the maintainer’s list even though it conflicts with the January 2025 diagram.
- The build environment did not expose an interactive browser session for final visual QA. The local server returned the page and `locations.json` successfully, and the data/JavaScript checks passed; the expandable search control and 375 px layout still need one local visual pass.
