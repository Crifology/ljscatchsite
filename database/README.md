# State fish and water databases

`AL.json` through `WY.json` contain one database for each of the 50 US states.
`index.json` lists file names, import completion, dates and counts. State files
are generated from real public records; empty or failed imports are explicitly
identified in `coverage`. No sample fish or fabricated locations are inserted.

## Current source and coverage

- [USGS Nonindigenous Aquatic Species API](https://nas.er.usgs.gov/api/documentation.aspx).
- [USGS public-domain data policy](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits).
- Only fish classified as **established**, with **Accurate** public coordinates,
  a matching source state, scientific name and identifiable water-related locality.
- This source covers introduced fish. It is **not** a complete inventory of native
  species, fishing opportunities, current presence or stocking activity.
- Historical dates remain historical. No age threshold is applied.
- Source locality text is preserved. It can describe a reach, sampling site,
  multiple nearby waters or a named lake; it is not a canonical waterbody ID.
- Pins represent source locations, not water centroids, boundaries or access points.
  A large waterbody may have multiple site pins. Identical locality/county names
  are grouped only within the same approximately 0.001-degree coordinate cell.
- USGS accuracy classes do not supply a measured uncertainty radius. No inference
  is made from a statewide species list or a watershed-only match.
- Source narratives, photographs, personal contact information and reference
  bibliographies are not copied. Record links preserve provenance.

## State file structure

- `schemaVersion`: currently `1`.
- `state`: two-letter `code` and full `name`.
- `generatedAt`: UTC file-generation time; cached pages may be up to 30 days old.
- `coverage`: scope, import status, completion flag, exact API query URLs,
  source/accepted/rejected record counts and any error.
- `sources`: attribution, license, API documentation and source URL.
- `counts`: water-locality count, distinct scientific names, water/species pairs
  and accepted evidence count.
- `waters[]`: stable ID, original locality `name`, inferred `kind`, state,
  county, `[longitude, latitude]` coordinates, coordinate-accuracy description
  and `species[]`.
- `species[]`: `commonName`, `scientificName`, source `status` and `evidence[]`.
- `evidence[]`: source ID, record ID, original URL, source date/year, record type,
  original coordinates and coordinate derivation method.

`coverage.complete` means pagination completed for this filtered source query.
It does **not** mean every fish or water in the state is represented.

## Refresh

From the project root with Node 22 or newer:

```powershell
node scripts/import-fish-database.cjs
node scripts/import-fish-database.cjs --states=MA,NY
node scripts/import-fish-database.cjs --states=MA --refresh
node scripts/validate-fish-database.cjs
```

The importer requests 1,000 records per page, spaces network calls by at least
1.2 seconds and caches raw pages in the ignored `.tracker-cache/database-import`
folder for resume. It follows pagination up to a defensive 100-page/state ceiling,
and labels capped/failed imports. HTTP 403/429 stops the run without retries.
Errors on a refresh do not replace an existing complete state file.
Use `--refresh` for a new upstream snapshot; otherwise recent cached pages are reused.

## Map use

Start the application with `node server.cjs`. The map queries:

```text
/api/fish-database?state=MA&bbox=-73.6,41.2,-69.8,42.9&q=trout
```

`state=us` searches all state files for locations inside the viewport, including
offshore records outside state land boundaries. Optional `kind` values
match the map's Lake, River, Reservoir and Coastal filters. The response is a
GeoJSON FeatureCollection with the existing popup-compatible `properties.species`.
Fish-name filtering happens before a 1,500-pin response cap; `limited` and
`matchingWaters` disclose truncation. Missing/partial state files are listed.
The map shows the first 20 fish types alphabetically for the visible area.
The endpoint reserves pins for those species before capping locations. Complete
local database searches finish without waiting on live APIs; live sources are
a fallback for unavailable or incomplete imports. Search matches common or
scientific fish names, not water names. Popups retain all fish at a matching site.

Individual files are also available at `/database/MA.json`, and the manifest at
`/database/index.json`. Restart the server after replacing files to refresh its
in-memory cache immediately; otherwise cache entries expire in five minutes.
