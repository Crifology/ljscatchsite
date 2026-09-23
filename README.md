# LJ's Catch Website

The Tracker App is a Leaflet map backed by saved state fish JSON files.
Netlify serves the website and runs the database search as an on-demand function.
No persistent Node.js server or database connection is needed.

## Run locally

Install Node.js 22 or newer, then run:

```powershell
npm install
npm run dev
```

Open http://localhost:8888/trackerapp.html. Netlify Dev serves the static website
and emulates the functions and API rewrites. The VS Code localhost launch tasks
also use this command. After editing static files, restart it to rebuild `dist`.

## Use the tracker

Choose a state, pan or zoom to request fish locations within the visible area.
Search by fish name or water type; click a fish to filter pins and a pin to see
its saved species and photos. The sidebar shows up to 20 fish types and the map
up to 1,500 locations. Records cover historical introduced-fish populations,
not every native species or guaranteed catch locations.
See [TRACKER-SOURCES.md](TRACKER-SOURCES.md) for coverage details.

## Deploy on Netlify

Connect this repository to your existing Netlify site and deploy the changes.
`netlify.toml` supplies the build command (`npm run build`), publish directory
(`dist`) and functions directory (`netlify/functions`). Netlify installs the npm
dependencies during the build. Use a Git/CLI deployment that builds functions;
uploading only `dist` will not deploy the API.

For a manual deployment to an existing site:

```powershell
npx netlify login
npx netlify link
npm run deploy:preview
# After checking the preview:
npm run deploy:prod
```

Search requests to `/api/fish-database?state=MA&bbox=-73.6,41,-69,43&q=trout`
are rewritten to `netlify/functions/api.js`. `serverless-http` invokes the
request handler in `server.cjs`, without calling `listen()`. The function reads
bundled `database/XX.json` files and returns matching fish and locations.
The same function serves saved stocking data at `/api/stocking?state=MA`.
`stocking-2026.json` contains statewide summaries; it does not supply map pins.

Database files are explicitly included in the function bundle because their
paths are selected dynamically. The static build copies only HTML, assets and
the game, keeping backend source, caches and dependencies out of the public
site. Update source JSON files and redeploy to refresh the database; runtime
writes are not needed. See [database/README.md](database/README.md) for imports.

Legacy live-source adapters remain for regression coverage, but the tracker
does not load them. The old iNaturalist endpoint returns 503 by default: its
single-server filesystem request budget cannot safely coordinate multiple
serverless instances. Saved database searches do not use that endpoint.

Configuration follows [Netlify's serverless-http setup](https://docs.netlify.com/build/frameworks/framework-setup-guides/express/)
and [function file bundling](https://docs.netlify.com/build/functions/configuration/).

## Checks

```powershell
npm test
npm run build
npx netlify build --offline
```

The tests include direct serverless invocations for search, filtering, request
validation and stocking summaries. OSM tile attribution and configuration are
in `assets/water-explorer-config.js`; no offline tile downloads are implemented.

## Fishing game audio

`game/audio.js` synthesizes original cartoon cast, bite, reel and catch effects
with Web Audio oscillators. No third-party recordings, samples, music, voices
or stock libraries are included. Sound starts after a player interaction; the
Sound button mutes it and remembers the preference. Pausing or leaving the
window stops the effects. Browsers without Web Audio can still play silently.
