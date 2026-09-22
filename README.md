# LJ's Catch Website

The Tracker App is now a Leaflet water explorer using free USGS water geometry
plus USGS NAS introduced-fish records and iNaturalist fish observations. No API key, subscription or npm install is needed.

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

The map defaults to an approximate US state from the visitor connection IP, with
a US overview fallback. Choose any state manually. Zoom to level 8 or closer,
then click **Search this area**. Click a water pin, outline or list entry to load
fish species and representative photos. Fish-name filtering covers opened guides.

Water boundaries come from USGS. iNaturalist covers ray-finned fish; USGS NAS supplements established introduced-fish populations.
Lists show qualifying historical observations, not a complete current population
inventory. Rivers represented by centerlines use a labeled nearby-record estimate.
Some waters have no eligible observations or reusable photos. Read
[TRACKER-SOURCES.md](TRACKER-SOURCES.md) for exact coverage and usage policies.

## Hosting

Deploy `server.cjs` with Node behind your HTTPS host, keeping the site and
`/api/fish-observations` on the same origin. Configure `PORT` and `HOST` for your
platform (defaults: 8000 and loopback). Run one process with a persistent
`.tracker-cache` directory. The server enforces shared pacing, caching, cooldowns
and a 9,000-request daily budget. Multiple replicas require a shared atomic
budget/queue and one egress IP. Static-only hosting is insufficient for fish data.
Do not expose `.tracker-cache`; the included static handler already denies it.

The browser uses the real origin Referer for OSM tiles and pauses the tile layer
on errors. Tile service attribution and configuration are in
`assets/water-explorer-config.js`. No offline tile downloads are implemented.

## Checks and files

```powershell
node --test --test-isolation=none tests/*.test.cjs
```

- `trackerapp.html`, `assets/tracker.css`: page and responsive styles.
- `assets/water-explorer.js`: Leaflet map, water list and species popups.
- `assets/water-explorer-providers.js`: free API adapters and geometry matching.
- `assets/water-explorer-data.js`: validation and filters.
- `assets/tracker-network.js`: browser cache, deduplication and pacing.
- `server.cjs`: first-party fish endpoints and static host.
- `usgs-fish-service.cjs`: bounded WBD watershed lookup and USGS NAS fish queries.

The former `tracker.js`, `tracker-data.js` and `tracker-water.js` are retained
for reference with their regression tests; `trackerapp.html` no longer loads them.

## Stocking data and default state

The supplied `stocking-2026.json` is connected as a state summary source. Choose
a state to see its reported count and FishFig credit. It contains no water names,
event coordinates or structured fish species, so it cannot create stocking pins.
The event importer and nearest-water matcher are ready for a separate geolocated
file; see [STOCKING-DATA.md](STOCKING-DATA.md). All current API feeds remain active.

State estimation uses one HTTPS request to IPWhois per page load (no key), with
manual override and no GPS or app-side IP storage. Its free domain-wide quota is
1,000 requests/day; lookup failure leaves the US overview available.
