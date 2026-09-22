# Fish photo provenance and reuse

Every species entry in each state JSON has `photo` and `photoStatus` fields.
Approved photos are stored once in `assets/fish-photos/` and reused for the same
scientific name across states. Popups display the photo, photographer credit,
source-page link and exact Creative Commons license link.

`species-photos.json` is the shared provenance catalogue. Each candidate records
the exact scientific-name query, matched taxon where available, source photo URL,
license code/URL, attribution, download URL, verification date and SHA-256 digest.
`photo-review.json` records approved image paths and rejected iNaturalist photo
IDs. Only visually approved candidates are applied to state files. Images that
show mainly predators, habitat, bones or maps are rejected for this purpose.

Sources:

- [iNaturalist photo reuse guidance](https://help.inaturalist.org/en/support/solutions/articles/151000169918-can-i-use-the-photos-and-sounds-that-are-posted-on-inaturalist-).
- [iNaturalist API practices](https://www.inaturalist.org/pages/api+recommended+practices).
- [Creative Commons CC BY](https://creativecommons.org/licenses/by/4.0/).
- [Creative Commons CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/).
- Wikimedia Commons alternatives retain each file's own license version and
  description-page attribution; their search metadata is in `photo-alternatives.json`.

Only CC0, CC BY and CC BY-SA images are accepted. Noncommercial, no-derivatives,
all-rights-reserved and unknown-license photos are excluded. Image rights are
checked independently of occurrence-data rights. The downloaded source-provided
images are unchanged; the website scales them for display. Retain the attribution,
source and license links. Any adapted CC BY-SA image must retain its applicable
ShareAlike terms. Other site material does not acquire ownership of these photos.

Images illustrate a fish taxon, not a catch from a particular mapped water.
Identification follows the source taxonomy; an unspecified genus or unresolved
hybrid is never silently replaced with a guessed species or parent. An unmatched
entry stays `photo: null` with an explanatory catalogue status.

## Updating

```powershell
node scripts/import-fish-photos.cjs
node scripts/import-fish-photos.cjs --retry-missing
powershell -NoProfile -File scripts/photo-contact-sheets.ps1 -Unreviewed
```

The importer resumes from its catalogue and cached API responses, with API starts
paced at least 1.2 seconds apart. Three workers overlap response/image-download
latency. A 403/429 stops further queued work; it does not bypass a restriction.
Review contact sheets under `.tracker-cache/photo-review`, record approved paths
in `photo-review.json`, then apply the reviewed catalogue:

```powershell
node -e "require('./scripts/import-fish-photos.cjs').apply(require('./database/species-photos.json'))"
```

The fish-record importer reapplies this catalogue after a database refresh, so
refreshing water records does not discard approved photo assignments.
