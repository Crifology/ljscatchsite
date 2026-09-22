# ljscatchsite
LJ's Catch Website

Where our fishing adventures come to life!

Made through VS Code with assistance from Codex and Claude tools.
HTML basic

Tracker App: open `trackerapp.html` through your normal static web host (or run
`python -m http.server 8000` and visit http://localhost:8000/trackerapp.html).
No API keys or build step are required. Internet access is required.

In VS Code's Run and Debug menu, choose **LJ's Catch: Tracker (localhost)** and
press F5. This starts a Python HTTP server bound only to `127.0.0.1:8000` and
opens Edge at the tracker page. Python must be on PATH. A second launch option
opens the homepage. Stop the local server using Tasks > Terminate Task when done.
If port 8000 is already used by a preview server for this project, visit its URL
directly instead of launching a second server.

Do not debug by opening `file://.../trackerapp.html`: local-file pages cannot send
the web Referer required by OpenStreetMap. The tracker now pauses tile requests
in that situation and explains how to open the localhost preview. It sends the
real page origin using `strict-origin-when-cross-origin` on web previews and live
hosts. A separate, persistent map error notice will not be overwritten by a
successful fish-data fetch. On a tile error it stops requesting that layer rather
than repeatedly retrying a block.

Going live may solve a missing-referrer problem but does not guarantee removal of
a 403 from an IP restriction, hosting policy, extension, or provider restriction.
For a remaining 403, identify the failed request's hostname in browser Network
tools: `tile.openstreetmap.org` is the basemap, `unpkg.com` supplies Leaflet, and
`api.inaturalist.org` / `nas.er.usgs.gov` supply fish reports. Preserve the real
Referer through hosting configuration. Never spoof it, disable browser security,
rotate proxies, or add cache-busting tile URLs to work around a provider block.

The tracker has Last 24 Hours, Last Week (7 days), and Last Month (30 days)
filters. iNaturalist supplies community angling reports. The optional USGS NAS
source supplies clearly labeled introduced-fish sightings, not confirmed catches.
Both use documented public APIs; no website scraping is implemented.

The 24-hour view requires a real observation timestamp, so date-only USGS records
are excluded. Each source has separate availability/count reporting. Requests are
cached for five minutes, queued per provider, and backed off after failures.
Contributor and photo credits appear in the detail window. Exact water/site names
are shown when supplied by the source. No missing times or water names are guessed.

Read [TRACKER-SOURCES.md](TRACKER-SOURCES.md) for the permission review, additional
APIs researched, source limitations, date semantics, and hosting/traffic limits.
Only one verified recreational angling feed is connected; USGS is an optional
second observation API, not a claim of comprehensive live catch coverage.

Run the dependency-free checks with `node --test tests/tracker.test.cjs`.
Files: `assets/tracker-data.js` contains provider adapters and time filtering;
`assets/tracker-network.js` handles caching, request pacing and documented USGS
JSONP; `assets/tracker.js` controls the map, list, and detail dialog.
