# Mav Maps

This is a static, mobile-friendly campus finder for St. John's School in Houston. It lets parents, visitors, and students search named campus locations, filter by category, open location details, get walking directions, and see their live GPS position.

The site uses plain HTML, CSS, and JavaScript. There is no build step, package manager, framework, backend, account system, or database. After adding a Google Maps key, the same files can run on a local web server, GitHub Pages, Netlify, or nearly any static host.

## Project files

```text
index.html                  Page structure and Google Maps configuration
css/style.css               Responsive layout, markers, popups, and GPS styles
js/app.js                   Map, search, filters, popups, and geolocation logic
admin.html                  Unlinked local location and routing editor
css/admin.css               Desktop-first editor layout and routing styles
js/admin.js                 Editor map, forms, drawing, history, drafts, and files
js/data-utils.js            Shared geometry, normalization, and validation helpers
js/routing.js               Reusable Dijkstra shortest-path engine
data/locations.json         All searchable campus locations and marker visibility rules
data/routing-network.json   Versioned pedestrian graph (intentionally empty initially)
scripts/validate-data.mjs   Optional data-quality check (no dependencies)
scripts/test-admin.mjs      Synthetic routing and editor-data tests (no dependencies)
ADMIN_EDITOR.md             Complete admin-editor and data-safety guide
README.md                   Setup and deployment guide
RESEARCH.md                 Sources, coordinate method, and verification notes
.gitignore                  Common local files and host artifacts
```

## Quick local setup

1. Follow the Google Maps key steps below.
2. Replace `YOUR_API_KEY_HERE` in `index.html` with your key.
3. Open a terminal in this folder.
4. Start a simple local server:

   ```bash
   python3 -m http.server 8000
   ```

5. Visit `http://localhost:8000` in a browser.

Do not double-click `index.html` and run it as a `file://` page. Browsers block the request for `data/locations.json` in that mode.

## Local administration and routing editor

The project includes an unlinked internal editor at `http://localhost:8000/admin.html`. It can create and move locations, author pedestrian nodes and editable paths, validate a route graph, test shortest paths, keep local drafts, and import/export JSON. It uses the same Google Maps configuration already present in `index.html`.

Read [ADMIN_EDITOR.md](ADMIN_EDITOR.md) before using it. The editor is a development tool, not an authentication system. An unlisted URL is not secure. Do **not** publicly deploy `admin.html` or a detailed internal `data/routing-network.json` without school approval and real school-controlled access restrictions.

The repository’s initial routing network is deliberately empty; no campus paths have been fabricated.

## Get a Google Maps API key

Google requires a Cloud project with billing for the Maps JavaScript API. Google can change pricing and free usage policies, so check the [current Maps Platform pricing page](https://mapsplatform.google.com/pricing/) before launch.

### 1. Create a Google Cloud project

1. Sign in at [Google Cloud Console](https://console.cloud.google.com/).
2. Use the project menu at the top of the page and choose **New Project**.
3. Give it a recognizable name such as `SJS Campus Map`.
4. Select the new project before continuing.

### 2. Connect billing

1. Open **Billing** in Google Cloud Console.
2. Create or select a billing account and connect it to the project.
3. Set a small budget alert so the project owner receives an email if usage rises unexpectedly. A budget alert does not automatically stop traffic.

### 3. Enable the Maps JavaScript API

1. Open **APIs & Services → Library**.
2. Search for **Maps JavaScript API**.
3. Open it and click **Enable**.

The site does not use Places, Directions, or Geocoding APIs. The directions button opens the normal Google Maps website, so it does not require another paid API.

### 4. Create a browser key

1. Open **APIs & Services → Credentials**.
2. Choose **Create credentials → API key**.
3. Copy the key temporarily, then immediately choose **Edit API key**.
4. Give it a clear name such as `SJS campus map website`.

### 5. Restrict the key

Never publish an unrestricted browser key.

Under **Application restrictions**:

1. Choose **Websites (HTTP referrers)**.
2. Add only the sites that should display the map. Examples:

   ```text
   http://localhost:8000/*
   https://YOUR-GITHUB-NAME.github.io/sjs-map/*
   https://YOUR-SITE.netlify.app/*
   https://map.example.org/*
   ```

Under **API restrictions**:

1. Choose **Restrict key**.
2. Select only **Maps JavaScript API**.
3. Save the key. Restriction changes can take a few minutes to propagate.

Google's official [API security guidance](https://developers.google.com/maps/api-security-best-practices) explains why both types of restriction matter.

### 6. Paste the key into the site

In `index.html`, find:

```js
apiKey: "YOUR_API_KEY_HERE"
```

Replace only the placeholder text. Keep the quotation marks.

The map uses Google's `AdvancedMarkerElement`, which also requires a map ID. `DEMO_MAP_ID` is included so local evaluation works after adding a key. Before a public launch, create a JavaScript map ID under **Google Maps Platform → Map Management**, then replace `DEMO_MAP_ID` in `index.html`. The [map ID guide](https://developers.google.com/maps/documentation/javascript/map-ids/get-map-id) has the current steps.

The key will be visible in the browser because this is a static website. That is normal for a browser key; domain and API restrictions are what keep it safe. Do not put a server key or unrestricted key here.

## Validate the campus data

If Node.js is installed, run:

```bash
node scripts/validate-data.mjs
```

The script checks required fields, unique IDs, categories, tags, number types, and whether coordinates fall inside a reasonable campus-area bounding box. It does not contact the internet and does not change any files.

To test the reusable routing engine and editor data helpers with a synthetic network, run:

```bash
node scripts/test-admin.mjs
```

You can also confirm that the JSON is syntactically valid with:

```bash
python3 -m json.tool data/locations.json > /dev/null
```

## Deploy to GitHub Pages

1. Create a new GitHub repository. Do not add another README if this folder is already initialized with Git.
2. Commit these files and push them to the repository's `main` branch.
3. On GitHub, open the repository and choose **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose the `main` branch and `/ (root)`, then save.
6. GitHub will show the public URL after deployment finishes.
7. Add that exact GitHub Pages URL pattern to the API key's website restrictions.

No GitHub Actions workflow or build command is needed.

## Deploy to Netlify

You can use either method:

### Connect the Git repository

1. Sign in to [Netlify](https://www.netlify.com/).
2. Choose **Add new site → Import an existing project**.
3. Connect the GitHub repository.
4. Leave the build command empty.
5. Set the publish directory to `.` (the repository root), if Netlify asks.
6. Deploy the site.
7. Add the final `*.netlify.app` address to the Google key's website restrictions.

### Manual drag and drop

1. Open Netlify's manual deployment area.
2. Drag this project folder into the page.
3. Add the assigned Netlify URL to the Google key's restrictions.

Connecting Git is easier to maintain because later pushes redeploy automatically.

## Add a custom domain

### On GitHub Pages

1. Open **Settings → Pages** in the repository.
2. Enter the domain under **Custom domain**.
3. Follow GitHub's displayed DNS instructions. A subdomain usually uses a CNAME record; an apex/root domain uses GitHub's listed A/AAAA records.
4. Wait for DNS verification, then enable **Enforce HTTPS**.

### On Netlify

1. Open the site and choose **Domain management → Add a domain**.
2. Add a domain you own.
3. Follow Netlify's DNS records or delegate DNS to Netlify.
4. Wait for the automatically managed TLS certificate.

For either host, also add both the `https://domain/*` and any `https://www.domain/*` version you use to the Google API key's website restrictions.

## Add or correct a location

Open `data/locations.json`. Each location has this shape:

```json
{
  "id": 78,
  "name": "New Location",
  "building": "Building Name",
  "floor": 0,
  "category": "facility",
  "description": "What visitors need to know",
  "lat": 29.74075,
  "lng": -95.43035,
  "tags": ["alternate name", "search word"],
  "visibility": "zoom-dependent",
  "minZoom": 18,
  "directions": ["walking"]
}
```

Rules to follow:

- Use a new, unique whole-number `id`.
- Keep every field, even when the floor is unknown. Use `0` for outdoors or an unspecified floor.
- Use exactly one category: `classroom`, `restroom`, `office`, `facility`, `sports`, `parking`, or `dining`.
- Include alternate spellings, abbreviations, and common words in `tags`.
- Use `"zoom-dependent"` for ordinary map locations, then choose a `minZoom` from 16 through 19.
- Use `"search-only"` for nested rooms that should be findable without creating crowded map labels; use `null` for their `minZoom`.
- The `St. John's School` overview record intentionally uses `null` visibility with `minZoom: 0` and `maxZoom: 16`; it is shown below zoom 16 and disappears when the campus landmark tier enters.
- Every location must include `"walking"` in `directions`. Add `"driving"` only when the coordinate is a suitable vehicle destination, such as a gate, parking area, or public driveway.
- Write latitude and longitude as numbers, not quoted text.
- Put a comma between objects, but not after the final object in the array.
- Do not publish a guessed room number or placeholder pin. Add only school-approved room identifiers and locations.
- Run the validation script after editing.

### Zoom hierarchy

Google Maps approximately doubles the map scale at each whole-number zoom step. The campus map uses four levels:

| `minZoom` | Intended use | Examples |
|---:|---|---|
| `16` | Campus-wide landmarks | Division buildings, major fields, Taub Parking Garage |
| `17` | Primary destinations | Dining, libraries, major parking, athletic facilities |
| `18` | Building-level destinations | Gates, offices, courts, tunnels, stores |
| `19` | Fine details | Restrooms, interior spaces, entrances, crosswalks |

A marker remains eligible at every zoom level at or above its `minZoom`. Google’s marker collision handling may still hide a label when several eligible markers overlap.

The null-visibility overview marker uses required collision behavior below zoom 16. Admissions Office receives elevated collision precedence from zoom 17 onward so nearby Campus Center labels do not suppress it.

To refine a pin, stand at the destination with a reliable map or use a school-approved floor/site plan. Record at least five decimal places. A difference of `0.00001` latitude is roughly one meter; longitude distance varies with latitude.

## Ask Codex to add a location for you

The easiest option is to send Codex a Google Maps pin or coordinates plus a few details. You do not need to edit the JSON yourself.

### Get the location

On a computer in Google Maps:

1. Find the place on the map.
2. Right-click the exact spot.
3. Click the latitude and longitude at the top of the menu to copy them.

On a phone:

1. Press and hold the exact spot to drop a pin.
2. Tap **Share** and copy the Google Maps link.

If neither is possible, describe the location relative to something already on this map, such as “inside West Farish Hall, near the Quad entrance.” Codex can add it as approximate and label that uncertainty.

### Paste this request into chat

```text
Add this location to the SJS map:

Name:
Building or campus area:
Category: classroom / restroom / office / facility / sports / parking / dining
Floor: (use 0 if outdoors or unknown)
Description:
Google Maps link or latitude, longitude:
Other names people might search:
Is this verified by the school? yes / no / unsure
```

Only the **name** and a usable **location** are essential. If information is missing, Codex can choose the category, write the description and search tags, assign the next ID, update `locations.json`, and run the validation script.

## How the interface behaves

- Satellite imagery is the default; the map control switches to roadmap view.
- The map can be panned freely and uses Google's full available zoom range.
- Search checks the name, building, description, and tags as you type.
- Desktop shows a compact search field by default; smaller screens collapse it to the search icon. Focusing or opening search reveals the category filters.
- The selected category and search query both apply at the same time.
- Ordinary marker labels use their individual `minZoom` value from 16 through 19, with collision handling for crowded areas.
- Search-only rooms such as M101 and Q213 never create map labels; selecting one opens its information card at the parent building coordinate.
- Clicking a search result zooms to the pin and opens its information card.
- Every popup offers walking directions. Gates, parking destinations, and selected vehicle-accessible locations also offer driving directions.
- GPS starts only after the Google map loads. The browser controls the permission prompt.
- The recenter button appears only after the first successful GPS reading.

## Known limitations

- Coordinates are research-based approximations, not a school survey. Interior pins point to a building area, not necessarily a particular doorway.
- St. John's is in a multi-year construction program. The Lower School, carpool, parking, Skip Lee Field, and nearby operations routes may change through 2027.
- Public sources do not publish a complete restroom or classroom directory. The current room and restroom pins came from the map maintainer or the school’s published campus diagram; verify them before public launch.
- Gate addresses and pin coordinates came from the map maintainer. Gate 14’s supplied address conflicts with the January 2025 diagram; see `RESEARCH.md`.
- GPS is often inaccurate indoors, near large buildings, or when a phone is in low-power mode.
- Walking directions stop at the pin. They do not provide indoor, accessible-route, or floor-to-floor navigation.
- The school controls gates and visitor access. A map pin never overrides security instructions, event parking plans, or temporary closures.
- A Google Maps key, billing account, internet access, and permitted referring domain are required for the base map.

See `RESEARCH.md` before treating any coordinate as final.
