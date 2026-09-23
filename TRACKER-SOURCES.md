# Water explorer data sources

The tracker requests fish data only from `/api/fish-database`, which reads the
saved `database/AL.json` through `database/WY.json` files on the backend.
See [database documentation](database/README.md) for schema, provenance and refresh instructions.

The initial view is the contiguous United States. Choose a state to fit its
bounds. Every pan or zoom reloads the visible bounding box; searches filter
common/scientific fish names and water type. The backend returns up to 1,500
locations, reserving pins for the first 20 alphabetical fish types. Zoom in or
search to narrow capped results. Clicking a pin displays its saved species and
evidence without making another data request.

Missing or partial imports are disclosed. Empty results remain empty; there is
no live iNaturalist, USGS, stocking or IP-location fallback. Database refreshes
are separate offline maintenance operations, never triggered by map interaction.

Saved records come from USGS NAS and cover established introduced fish with
accurate source coordinates and water-related localities. They are historical
records, not a complete native-fish inventory or a guarantee of current presence,
catch success or public access. Multiple pins can describe sites on one water.
Source-assigned states are retained. State overview bounds are bundled locally.

Representative species photos are served from local assets with their saved
source and license credits. Credit links may reference iNaturalist; the tracker
does not query its API. Leaflet and OpenStreetMap background tiles remain external
map assets, with visible attribution and ordinary viewport tile requests.
