# Water explorer: data sources and usage

Reviewed September 22, 2026. This replaces the former catch-report tracker.
No paid API, API key, account, or private endpoint is required. A reproducible
USGS API importer now builds the saved databases documented in
[database/README.md](database/README.md).

## What the map can establish

Leaflet 1.9.4 renders a US map, with separate contiguous-US, Alaska, and Hawaii
views. IP-based state selection initializes the map before loading. Saved fish
locations and live water lookups are available at every zoom level. Clicking a water outline or pin
opens an alphabetical fish-type list, representative licensed species photos when available,
and linked observation/photo credits.

**This is not an inventory of every fish living in every US water.** No free,
complete nationwide waterbody-to-species inventory was verified. USGS NHD supplies
geometry; USGS NAS adds introduced-fish population records. iNaturalist supplies historical observations,
not proof of current residency. The iNaturalist scope is ray-finned fish
(Actinopterygii, taxon 47178); the NAS supplement uses its Fishes group.
An empty result means no eligible records matched, not that the water is fishless.

## Connected sources

### USGS National Hydrography Dataset

- [Official REST service](https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer).
- Layer 12: lake/pond, reservoir and estuary polygons (FTYPE 390, 436, 493).
- Layer 9: river, sea/ocean and bay/inlet polygons (460, 445, 312).
- Layer 6: river/stream centerline segments (460).
- Each manual area search requests at most 60 features from each layer, using
  the visible bounding box, WGS84 and GeoJSON. No automatic pagination or
  nationwide geometry download. Named and unnamed waters are included.
- Partial outages retain successful layers and disclose incomplete coverage.
  Reaching a result cap prompts the user to zoom in. Adjacent river segments
  remain separate features; the app does not claim they cover an entire river.
- Pins lie on a returned boundary or centerline, preferably within the viewport.
  They are water-selection markers, not catch locations or access points.
- [USGS copyrights and credits](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits):
  USGS-produced data is US public domain; credit USGS and retain source links.
  The service's responses support CORS; no proxy bypass is needed.

### USGS Nonindigenous Aquatic Species (NAS) supplement

- [Documented NAS v2 API](https://nas.er.usgs.gov/api/documentation.aspx).
  A live anonymous query succeeded without a key or payment. NAS covers introduced
  species, not a complete inventory of native fish. It supplements iNaturalist.
- The first-party `/api/usgs-fish?bbox=...` endpoint resolves up to three intersecting
  HUC12 watersheds using the public [USGS WBD layer 6](https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer/6).
  It requests at most 100 fish records per watershed, without date filters.
  A watershed is only a search filter, never evidence that a fish lives in every
  lake within it. The browser still matches coordinates to the selected water.
- Require `group=Fishes`, `spatialAcc=Accurate`, and `status=established`, and check
  those fields again in the returned data. Failed, eradicated, collected-only,
  stocked-only, unknown-status, centroid and approximate records are excluded.
  Established is the source's classification, not a guarantee of present residency.
- Merge matching species by exact scientific name. Show the USGS introduced-population
  label and retain both source credits when a species occurs in both feeds.
  No individual catches or dates are added to the visitor's species list.
- Retain species names, public coordinates, classification and record link only;
  omit narrative comments and third-party references. USGS data attribution follows
  its public-domain policy. Do not assume NAS photographs are public domain.
  Existing licensed representative species photos are reused for matched species;
  a USGS-only species without such an image shows the photo-unavailable state.
- One shared server queue, at least 1.1 seconds between upstream requests, bounded
  ten-request pending queue, one-hour cache and in-flight deduplication. A local
  conservative cap allows 600 upstream requests per clock hour per process; this
  is an app safeguard, not a claimed USGS quota. Honor Retry-After, back off at least
  60 seconds after errors, and never automatically retry or download whole datasets.
- Each water lookup makes one WBD call and at most three NAS calls. Truncated results,
  skipped watersheds and partial source failures are disclosed. An unavailable source
  is distinct from an empty result; successful data from the other source remains.
- Verification: a Charles watershed test returned public fish records including old
  failed and stocked introductions, demonstrating why status filtering matters.
  The established-only Jamaica Pond lookup completed successfully with zero matches;
  those excluded introductions were not added to its fish list.

### iNaturalist

- [Public API documentation](https://api.inaturalist.org/v1/docs/),
  [recommended practices](https://www.inaturalist.org/pages/api+recommended+practices),
  [terms](https://www.inaturalist.org/pages/terms).
- Clicking a water requests up to 200 candidate records, without a date window, inside its
  geometry's bounding box. Only US, wild, research-grade, species-level fish
  records are eligible. This is not restricted to the former angling project.
- Match polygon records using point-in-polygon, including holes and multipolygons.
  A bounding box alone never establishes a water match. Coordinates remain
  uncertain; positional accuracy must be known and at most 100 m.
- River centerlines use an approximate 30 m segment-distance threshold. Their
  popup explicitly labels these as nearby observations, not confirmed inhabitants.
- Unknown, private or obscured coordinates are excluded. No protected-location
  reconstruction. No capture date is invented; the visitor sees an alphabetical species list without catch dates or individual
  catch reports. Source credits remain available in expandable details.
- Only CC0, CC BY and CC BY-SA observation records are displayed. NC and unlicensed
  content is excluded because this site links to a commercial store.
- Photos are independently filtered to those same reusable licenses. Use an
  eligible default species photo as a representative image. Individual
  observation/catch photos are not used as a fallback. Retain contributor credit, source-photo link and license link. Images are
  displayed unchanged, with object-fit contain, not cropped or modified. No eligible
  image yields an explicit unavailable message, never an unrelated fish image.
- The candidate cap is disclosed. Species without qualifying observations,
  out-of-water shore coordinates, coarse positions and older records beyond the
  cap will be missing. Search filters only cover loaded waters and opened fish lists.

## Request policy and hosting

`node server.cjs` serves the website and `/api/fish-observations` on one origin.
This first-party endpoint uses the documented API, not a CORS bypass: it provides
one upstream IP, a shared cache, request pacing and a persisted daily budget.
The browser contacts USGS directly and the first-party server for iNaturalist.

- One server process; one upstream request at a time, spaced at least 1.1 seconds.
- Shared five-minute response cache (100 entries) and in-flight deduplication.
- Maximum 20 distinct pending requests; excess calls receive 429.
- Hard limit of 9,000 upstream requests per UTC day, below iNaturalist's guidance
  of roughly 10,000/day. Count every attempted request, including failures.
- Budget survives restarts in `.tracker-cache/budget.json`; this folder is ignored
  by Git and cannot be served by the static-file handler. Corrupt/unwritable budget
  state fails closed. Keep this folder persistent in production.
- Do not run multiple server workers or replicas against this file. Scaling needs
  a shared atomic budget/cache/queue and a single egress IP before deployment.
- Honor upstream Retry-After; minimum 60-second cooldown on failures. No automatic
  retry, polling, authentication, arbitrary upstream URL or user-supplied key.
- Request fields are rebuilt on the server to enforce US geography, fish taxon,
  license and result limits. Private records are stripped before browser delivery.
- Public client controls also cache/deduplicate, pace USGS requests and back off.
  Local controls alone do not constitute a site-wide USGS traffic guarantee.

## Mapping policy

[Leaflet](https://leafletjs.com/reference.html) is the open-source rendering
library. It does not supply water geometry, fish records or map tiles.
[OpenStreetMap standard tiles](https://operations.osmfoundation.org/policies/tiles/)
provide the background geography with visible attribution. Only ordinary
interactive viewport tiles are requested; preserve HTTP caching and the real
Referer. No offline download, bulk prefetch, cache busting, forged headers, proxy
rotation or security bypass. A tile failure pauses that layer without retrying.
Serve via HTTP(S), not file URLs. Tile settings are in `assets/water-explorer-config.js`.

## Alternatives and verification

FishDatabase.com was considered, then dropped after the user requested a free
alternative. Its published API offering requires a plan/key; no account was
created. FishBase's noncommercial licensing was not used for this store-linked
site. No Fishbrain or FishAngler scraping is included.

Live checks on September 22, 2026 verified USGS and iNaturalist CORS responses.
A Jamaica Pond geometry query followed by the fish adapter returned Pumpkinseed
with one reusable representative photo. This is a sample, not a guaranteed
species count. A wider Boston query also exercised a partial USGS outage.
Unit tests cover polygon holes, river distance, licensing/privacy, caps, partial
failures, popup selection, stale results, caching, daily budgets and Retry-After.
A browser visual check was unavailable in the agent environment.


## Stocking JSON integration

The supplied `stocking-2026.json` is the [FishFig State Fish Stocking Aggregation](https://fishfig.com/data/),
version 2026-08-28, generated 2026-09-21, with CC BY 4.0 attribution metadata.
All 50 records are state summaries: state, agency, annualCount, year and source.
CA (800,000, 2025), NY (1,873,980, 2025), and PA (3,200,000, 2026) have numeric
counts; the other 47 are unverified in the source. These are source-reported
figures, not independently validated counts. Preserve source notes (including
California's approximate spring figure) rather than presenting all as uniform
full-year totals. The UI shows the selected state's summary and FishFig credit.

The file contains no coordinates, individual water names or structured species.
It therefore contributes state information, not new fish-presence pins. No event
locations were invented from state centers. The earlier remote download was
blocked by HTTP 403; the user-supplied local file is now the connected source.

See [STOCKING-DATA.md](STOCKING-DATA.md) for the separate event import contract,
source/rights fields, completed-status requirement and `STOCKING_DATA_FILE` option.
When event data is available, matching searches up to ten viewport events per
user action, with a 1 km maximum water distance, geometry containment, hole
handling, and rejection of ties or incomplete candidate responses. Stocking
species merge into existing map pins; additional matched waters receive pins.
Photos are reused only from eligible existing species data. State totals are
never fed into this location matcher. Existing API GET requests remain active.

## Approximate default state from the visitor connection

[IPWhois documentation](https://ipwhois.io/documentation) currently permits
commercial use of its free HTTPS endpoint, without an API key. Its published free
limit is 1,000 requests/day; browser CORS traffic is counted per domain. Review
its [terms](https://ipwhois.io/terms) and [privacy policy](https://ipwhois.io/privacy)
when deploying or changing the use. No subscription or account was created.

The browser makes one request per page load directly to
`https://ipwho.is/?fields=success,country_code,region_code`. This uses the visitor's
public connection IP rather than the application server's location and does not
trust arbitrary forwarded-IP headers. Request only success, country and state;
no GPS prompt, city, coordinate or IP value is requested in the response. The
provider necessarily receives the connection IP; its privacy link is visible on
the page. The tracker does not store or log visitor IPs or location results.

Only recognized US states/DC are accepted. Fish requests wait for state detection
and map initialization. The state overview uses Leaflet fitBounds with padding,
so zoom reflects both the state extent and the available map window. All states remain
manually selectable. A late lookup never overrides map movement, a manual region
choice or a search. On timeout (5 seconds), failure, quota response, or non-US
result, keep the US overview and explain the manual selector. No automatic retries
or quota bypass. VPN/mobile/ISP routing can place a user in the wrong state.
A public test-IP request returned HTTP 200, valid state-only JSON, and CORS `*`.


State framing and filtering use bundled, simplified boundaries from
[PublicaMundi's US states GeoJSON](https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json).
The map query intersects the visible window with the selected state's bounding
box, then filters water pins against its approximate polygon. These simplified
boundaries are not survey boundaries and can exclude locations along borders or
coasts. Alaska is clipped to the map's supported -180 to 180 longitude range;
the Hawaii overview covers the main islands. Boundary data is bundled locally,
so startup does not require an additional boundary-service request.


## Saved per-state fish databases

The `database` folder contains one JSON file per US state and an `index.json`
manifest. `scripts/import-fish-database.cjs` imports named-water, accurate,
established-fish NAS records using paced, paginated requests. This user-requested
offline import is separate from the small request budgets used by live map lookups.
See [the database documentation](database/README.md) for provenance, schema,
refresh instructions and the distinction between complete pagination and complete
biological coverage.

The map uses `/api/fish-database` as its primary source, with live services
as a fallback for missing or incomplete imports. The local endpoint filters by source-assigned state, viewport,
common/scientific fish-name search and water type, and discloses its 1,500-pin cap. A water pin
from this database is a reported locality, not a canonical NHD water polygon.
Multiple sites on the same lake or river can remain distinct pins. Evidence retains
historical dates, original coordinates and source record URLs; saved pins remain
available when live sources fail. The sidebar remains capped at 20 fish types.
