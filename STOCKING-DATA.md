# Stocking JSON import

The original USGS/iNaturalist GET requests remain active. The new
`/api/stocking?bbox=west,south,east,north` endpoint adds local stocking records.

The supplied `stocking-2026.json` is FishFig's CC BY 4.0 aggregation. It contains
50 state summaries with fields `state`, `stateName`, `agency`, `annualCount`,
`year`, and `source`. Three states have numeric counts (CA, NY, PA); the other
47 say to verify locally. It has no event coordinates, water names or structured
species fields. The app displays these summaries for the selected/default state,
with FishFig attribution and the source's period and qualifications. No water-level
stocking locations are invented from the totals. The original file is retained.

The browser loads summaries through `/api/stocking?state=MA`. The bbox endpoint
reports `aggregateOnly: true` while only the state-total file is available.
Actual geolocated stocking entries can be added separately as follows.

Place a licensed, normalized event file at `data/stocking-events.json`, or set
`STOCKING_DATA_FILE` to its absolute local path before starting `node server.cjs`.
The importer below is this app's format, not a claim about FishFig's native schema.
Once the original JSON is available, its actual fields can be mapped to this format.

```json
{
  "schemaVersion": 1,
  "events": []
}
```

Each event needs these fields:

| Field | Meaning |
| --- | --- |
| `id` | Unique source event ID, string |
| `country` | `US` |
| `state` | Two-letter state code |
| `coordinates` | Actual stocking location `[longitude, latitude]` |
| `commonName` | Fish common name |
| `scientificName` | Verified scientific name for species merging |
| `status` | `completed`; plans alone do not establish stocked fish |
| `source.label` | Agency/contributor attribution |
| `source.url` | HTTPS original source link |
| `source.license` | `CC0`, `CC BY 4.0`, `CC BY-SA 4.0`, or `Public domain` |

Do not substitute a state center, agency office or town center for event coordinates.
State totals cannot establish which lake received which fish. Check the actual
source's reuse permission; US federal public-domain rules do not automatically
cover state-agency material.

On an area search, the server returns at most ten eligible events in the viewport.
For each, the client queries existing USGS water layers in an approximately 1.1 km
envelope and measures distance to actual polygon boundaries or river segments.
Containment yields zero distance; holes are excluded. A match must be within 1 km,
with a complete candidate response and no distance tie within 1 m. Ambiguous,
missing or truncated matches remain unmatched and are counted in the UI.

Matched fish merge into the nearest water's species list, preserving source credit
and any existing licensed species photo. New waters receive normal Leaflet pins.
The stocking badge calls the water association an estimate; stocking does not
guarantee fish are still present. The original fish APIs still load on selection.
No unlicensed stocking photos or individual catches are displayed.

Stocking data is read only on demand, cached in memory for one minute, and filtered
before delivery. Missing/invalid files show unavailable status without hiding the
other sources. No bulk downloader or automatic scraping has been added.
