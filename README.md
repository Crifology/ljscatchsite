# LJ's Catch Website

The Tracker App is a Leaflet map backed exclusively by saved state fish JSON
files. No API key, subscription or npm install is needed.

## Run locally

Install Node.js 22 or newer, then run from this folder:

```powershell
node server.cjs
```

Open http://127.0.0.1:8000/trackerapp.html. VS Code's existing **LJ's Catch:
Tracker (localhost)** launch option now starts this Node server too. Stop any
previous Python preview on port 8000 first. A Python/static-only host can display
the map but cannot provide the shared fish-data endpoint.

## Use the tracker

The map starts with a US overview. Choose a state, pan or zoom to request
fish locations within the visible area. Search by fish name or water type;
click a fish to filter pins and a pin to see its saved species and photos.
The sidebar shows up to 20 fish types and the map up to 1,500 locations.

Records cover historical introduced-fish populations, not every native species
or guaranteed catch locations. Missing imports do not trigger live API calls.
See [TRACKER-SOURCES.md](TRACKER-SOURCES.md) for coverage details.

## Hosting

Deploy `server.cjs` with Node behind your HTTPS host, keeping the site and
`/api/fish-database` on the same origin. Include the `database` directory and
local photo assets. Configure `PORT` and `HOST` for your platform (defaults:
8000 and loopback). Static-only hosting cannot provide the database endpoint.
See [database/README.md](database/README.md) for offline refresh instructions.

The browser uses the real origin Referer for OSM tiles and pauses the tile layer
on errors. Tile service attribution and configuration are in
`assets/water-explorer-config.js`. No offline tile downloads are implemented.

## Checks and files

```powershell
node --test --test-isolation=none tests/*.test.cjs
```

- `trackerapp.html`, `assets/tracker.css`: page and responsive styles.
- `assets/water-explorer.js`: Leaflet map, water list and species popups.
- `fish-database-service.cjs`: state JSON loading and viewport/species filtering.
- `assets/water-explorer-data.js`: validation and filters.
- `server.cjs`: first-party fish endpoints and static host.

Legacy live-source adapters and their regression tests remain in the repository,
but `trackerapp.html` does not load them. Stocking summaries and IP-based state
detection are also disconnected from the tracker; users select their state manually.
