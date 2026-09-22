# Tracker data sources and usage review

Reviewed September 21, 2026. This records the published permissions and technical
limits checked for this implementation; it is not a guarantee about future terms
or the accuracy/ownership of every third-party submission. Recheck before changing
usage, adding a provider, or substantially increasing traffic.

## Connected APIs

| Provider | What the tracker uses | Permission and restrictions | Coverage limitations |
| --- | --- | --- | --- |
| [iNaturalist v1](https://api.inaturalist.org/v1/docs/) | Public US Angling Lifelists observations; separately licensed representative species photos | [Terms](https://www.inaturalist.org/pages/terms), [API guidance](https://www.inaturalist.org/pages/api+recommended+practices). Allow only CC0, CC BY, CC BY-SA records/photos, retain contributor credit and original-source link. Exclude noncommercial, unlicensed, private and obscured records. | One community project's reports, not all US catches. Up to 200 candidate reports per window; limits are disclosed. Dates describe the observation, not upload time. |
| [USGS NAS v2](https://nas.er.usgs.gov/api/documentation.aspx) | Optional introduced-fish sightings: species, observation date, reported water/site, public coordinates | API explicitly provides automated access and documents JSONP. [USGS copyrights and credits](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) identify USGS-produced data as US public domain and request credit. Credit USGS and link each original record. No third-party images, narrative comments, or reference text are copied. | Sightings, **not verified recreational catches**. 50 states + DC; accurate locations and actual occurrence years only. No exact times, so excluded from Last 24 Hours. Up to 400 candidates per calendar month; pagination limits are disclosed. |

USGS is opt-in because it broadens the meaning of a report. It is not presented as
a second verified recreational-catch feed. The live September sample contained
six dated fish sightings; this is a validation sample, not a promised report count.

The USGS API did not return a cross-origin fetch permission header in testing.
The tracker uses the provider's **documented JSONP callback parameter** directly
from its HTTPS endpoint. Only that exact host/path is accepted; there is no public
CORS proxy, reverse-engineered endpoint, authentication bypass, or page scraper.
As with any JSONP service, its script executes with the page's privileges; this is
limited to the trusted USGS provider. JSONP does not expose HTTP status/Retry-After
to JavaScript, so script errors/timeouts trigger a 60-second local cooldown.

## Other APIs researched, not connected

| Source | Finding / reason |
| --- | --- |
| [NOAA WCGOP In-Season Salmon Reporting API](https://www.fisheries.noaa.gov/resource/data/west-coast-groundfish-observer-program-season-salmon-reporting) | A documented JSON/CSV API for expanded commercial discarded-salmon counts and weights, from 2015 through the current year. A real additional catch-data API, but regional commercial summaries do not satisfy individual recreational-catch pins or exact 24-hour timing. Not mixed into this map. |
| [GBIF occurrence API](https://techdocs.gbif.org/en/openapi/v1/occurrence) | Biodiversity records can include scientific captures, specimens and sightings. [Dataset licensing](https://www.gbif.org/publishing-data) must be checked per dataset and [data-use terms](https://www.gbif.org/terms/data-user) followed. No additional timely US recreational catch dataset was verified; iNaturalist data can also be syndicated here, creating duplicates. Not connected just to inflate the source count. |
| [Fish Translator API](https://fishtranslator.com/api-docs.html) | Documents a public catch feed and shareable catch cards. No sufficiently clear content-reuse license/terms or verified usable feed was established in this review. Public endpoint documentation alone does not establish rights to republish user content; not enabled. |
| [Fishbrain](https://fishbrain.com/policies/terms-of-service/latest) | Terms prohibit automated extraction and third-party interaction without written consent. No scraping or private API calls. Requires a separate written data agreement. |
| [FishAngler](https://www.fishangler.com/terms) | Terms require prior written consent for automated access and restrict reuse. No scraping or private API calls. Requires a separate written data agreement. |
| [Global Fishing Watch](https://api-doc.globalfishingwatch.org/our-apis/documentation/) | Vessel activity, not individual species catches. API documentation also limits use to noncommercial purposes; unsuitable for this shop-linked site's current use. |
| [Texas fishing reports](https://tpwd.texas.gov/fishboat/fish/recreational/fishreport.phtml) | The official page states weekly reporting is currently on hold. No scrape integration added. |

## Time-window behavior

- Last 24 Hours: rolling 24 hours; requires an explicit timestamp and UTC offset.
  Date-only and future records are excluded. NAS is not queried in this view.
- Last Week: rolling 7 days for timestamps; current UTC date plus preceding six
  dates for date-only records.
- Last Month: rolling 30 days for timestamps; current UTC date plus preceding 29
  dates for date-only records. This is not the previous calendar month.
- No upload, indexing, publication, or fetch date is substituted for a catch date.
- Filters are reapplied when cached results are rendered. An empty result means
  no eligible reports in the selected feeds, not that nobody caught a fish.

## Request and display safeguards

- Five-minute in-memory response cache, in-flight request deduplication, and a
  single request queue per provider per browser tab, spaced at least 1.1 seconds.
- No background polling, bulk data downloads, or automatic retry loop.
- Fetch responses honor readable Retry-After headers for 429/503; other failures
  trigger a minimum 60-second cooldown. Errors remain distinct from empty feeds.
- iNaturalist recommends about one request/second and around 10,000/day. These
  local controls cannot enforce a site-wide daily budget across visitors/tabs.
  At higher traffic, use a first-party cached backend with an aggregate request
  budget and identifying User-Agent; contact providers if limits are insufficient.
- Species photos are independently license-filtered, credited and linked to
  their source. Exact scientific-name matching is required for USGS photo lookup.
  No source photo means an explicit unavailable message, not an unrelated fish.
- [OpenStreetMap standard tile policy](https://operations.osmfoundation.org/policies/tiles/):
  visible attribution, ordinary interactive viewport requests, normal browser
  cache and Referer. Serve over HTTP(S); no offline downloads, cache bypass or
  bulk tile prefetch. The browser supplies its own User-Agent.
- Removed automatic public Overpass lookups: its [usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
  warns against relying on the shared public service as an app backend. USGS's
  reported site/water is shown directly. Other exact water names are marked
  unavailable unless the source provides them; nearby waters are not invented.

No provider account, agreement, subscription, or paid service was created.

## Local debugging and map access errors

The VS Code launch configurations serve the site on loopback HTTP instead of
opening local HTML files. `file:`/non-HTTP previews do not request OSM tiles.
The page and Leaflet tile images use `strict-origin-when-cross-origin`, sending
the actual website origin as Referer. Browser caching and provider attribution
remain enabled. A tile failure pauses the layer without retrying, changing tile
hosts, spoofing identity, or routing around a restriction. Deploying does not
guarantee that a provider will lift an unrelated block. See the
[OSM tile requirements](https://operations.osmfoundation.org/policies/tiles/).
