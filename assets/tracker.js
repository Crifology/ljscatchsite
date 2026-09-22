(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = 'https://api.inaturalist.org/v1/';
  const licenses = new Set(['cc0', 'cc-by', 'cc-by-sa']);
  const cache = new Map();
  const data = window.TrackerData;
  let reports = [], selection = 0, map, markers;
  const dialog = $('fish-dialog');
  const nameOf = o => o.taxon?.preferred_common_name || o.taxon?.name || 'Unidentified fish';
  async function json(url) {
    return window.TrackerNetwork.request(url);
  }
  function dateLabel(o) {
    if (o.time_observed_at) {
      const date = new Date(o.time_observed_at);
      if (!Number.isNaN(date.valueOf())) return date.toLocaleString(undefined, {timeZone:'UTC', timeZoneName:'short'});
    }
    return `${o.observed_on || 'Date not provided'} · exact time not provided`;
  }
  function detail(label, value) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = value;
    $('fish-details').append(dt, dd);
    return dd;
  }
  function photoUrl(photo) {
    try {
      const url = new URL(photo.medium_url || photo.url);
      if (url.protocol !== 'https:' || !['static.inaturalist.org','inaturalist-open-data.s3.amazonaws.com'].includes(url.hostname)) return null;
      return url.href.replace('/square.', '/medium.');
    } catch { return null; }
  }
  async function speciesPhoto(o, token) {
    $('fish-photo').textContent = 'Finding a reusable species photo…';
    $('photo-credit').replaceChildren();
    try {
      let taxon = o.taxon;
      if (!taxon.id) {
        const key = `taxon-${taxon.name}`;
        if (!cache.has(key)) {
          const result = await json(`${api}taxa?${new URLSearchParams({q:taxon.name, per_page:'10', is_active:'true'})}`);
          cache.set(key, result.results.find(t => t.name.toLowerCase() === taxon.name.toLowerCase()) || null);
        }
        taxon = cache.get(key);
        if (!taxon) throw new Error('No exact species match');
      }
      let photo = taxon.default_photo;
      if (!photo || !licenses.has(photo.license_code) || !photoUrl(photo)) {
        const key = `photo-${taxon.id}`;
        if (!cache.has(key)) {
          const params = new URLSearchParams({taxon_id:taxon.id, photos:'true', photo_license:'cc0,cc-by,cc-by-sa', per_page:'5'});
          const data = await json(`${api}observations?${params}`);
          cache.set(key, data.results.flatMap(r => r.photos || []).find(p => licenses.has(p.license_code) && photoUrl(p)) || null);
        }
        photo = cache.get(key);
      }
      if (token !== selection) return;
      if (!photo) throw new Error('No licensed image');
      const img = document.createElement('img');
      img.alt = `Representative photo of ${nameOf(o)}; not this catch`;
      img.src = photoUrl(photo);
      img.onerror = () => { if (token === selection) $('fish-photo').textContent = 'Species photo unavailable.'; };
      $('fish-photo').replaceChildren(img);
      $('photo-credit').textContent = `Representative species image, not this catch. ${photo.attribution || photo.attribution_name || 'iNaturalist contributor'} · `;
      const credit = document.createElement('a');
      credit.textContent = `${photo.license_code.toUpperCase()} / photo source`;
      credit.href = `https://www.inaturalist.org/photos/${Number(photo.id)}`;
      credit.target = '_blank'; credit.rel = 'noopener';
      $('photo-credit').append(credit);
    } catch { if (token === selection) $('fish-photo').textContent = 'No reusable species photo available.'; }
  }
  function openReport(o) {
    const token = ++selection;
    $('fish-name').textContent = nameOf(o);
    $('scientific-name').textContent = o.taxon?.name || '';
    $('fish-details').replaceChildren();
    detail(o.source === 'USGS NAS' ? 'Last seen (reported date)' : 'Caught / last seen (reported observation)', dateLabel(o));
    detail('Reported location', o.place_guess || 'Location name not supplied');
    detail('Location accuracy', o.accuracyText || (o.positional_accuracy ? `Approximately ${o.positional_accuracy} m, as reported by the source.` : 'Accuracy not supplied; pin is a reported position.'));
    detail('Water / site', o.reportedWater || 'Exact water body not supplied separately. See the reported location and map.');
    const method = (o.ofvs || []).find(f => f.field_id === 17274)?.value;
    detail('Report type', method || o.kind);
    detail('Source / contributor / data license', `${o.source} · ${o.credit}`);
    $('observation-link').href = o.sourceUrl;
    $('observation-link').textContent = `View original report on ${o.source}`;
    dialog.showModal();
    speciesPhoto(o, token);
  }
  function render() {
    const term = $('search').value.trim().toLowerCase();
    const visible = data.select(reports, data.windowFor($('period').value)).filter(o => `${nameOf(o)} ${o.taxon?.name} ${o.place_guess || ''}`.toLowerCase().includes(term));
    markers?.clearLayers(); $('report-list').replaceChildren(); $('count').textContent = visible.length;
    for (const o of visible) {
      const [lng, lat] = o.geojson.coordinates;
      if (markers) L.marker([lat,lng], {title:`${nameOf(o)} — ${o.place_guess || 'View report'}`, alt:nameOf(o)}).addTo(markers).on('click', () => openReport(o));
      const button = document.createElement('button'); button.type = 'button'; button.className = 'report-button'; button.textContent = nameOf(o);
      const badge = document.createElement('span'); badge.className = 'source-badge'; badge.textContent = `${o.source} · ${o.source === 'USGS NAS' ? 'Sighting' : 'Angling report'}`;
      const small = document.createElement('small'); small.textContent = `${o.place_guess || 'Unnamed location'} · ${o.observed_on}`; button.append(badge, small);
      button.onclick = () => { map?.setView([lat,lng], 10); openReport(o); };
      $('report-list').append(button);
    }
    if (!visible.length) $('report-list').textContent = 'No matching reports. Try a wider date range or another search.';
  }
  async function load() {
    $('refresh').disabled = true; $('period').disabled = true; $('include-sightings').disabled = true;
    $('status').textContent = 'Loading reports for the selected period...';
    $('source-status').replaceChildren();
    reports = []; render();
    const window = data.windowFor($('period').value);
    const providers = [{name:'iNaturalist angling reports', fetch:data.fetchInaturalist}];
    if ($('include-sightings').checked) providers.push({name:'USGS NAS fish sightings', fetch:data.fetchUSGS});
    try {
      const results = await Promise.allSettled(providers.map(p => p.fetch(window, json)));
      let failures = 0;
      results.forEach((result, i) => {
        const line = document.createElement('li');
        if (result.status === 'fulfilled') {
          const source = result.value;
          const selected = data.select(source.reports, window);
          reports.push(...selected);
          line.textContent = `${providers[i].name}: ${source.skipped || `${selected.length} matching reports`}${source.limited ? ' (result limit reached; coverage is incomplete)' : ''}.`;
        } else {
          failures++;
          line.textContent = `${providers[i].name}: unavailable. Wait at least a minute before retrying; other sources can still display.`;
        }
        $('source-status').append(line);
      });
      reports = data.select(reports, window); render();
      $('status').textContent = `${reports.length} reports in this period. ${failures ? `${failures} source(s) unavailable. ` : ''}Responses are cached for 5 minutes.${map ? '' : ' Map unavailable; select a report from the list.'}`;
      if (failures === providers.length) $('report-list').textContent = 'The selected sources are unavailable. Try Refresh reports again later.';
    } finally {
      $('refresh').disabled = false; $('period').disabled = false; $('include-sightings').disabled = false;
    }
  }
  $('close-dialog').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { selection++; });
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  $('search').addEventListener('input', render);
  $('refresh').onclick = load; $('period').onchange = load; $('include-sightings').onchange = load;
  const mapStatus = $('map-status');
  const webOrigin = ['http:', 'https:'].includes(window.location?.protocol);
  if (!webOrigin) {
    mapStatus.hidden = false;
    mapStatus.textContent = 'Map paused: open this page through a web server, not as a local file. In VS Code select "LJ\'s Catch: Tracker (localhost)" and press F5, or run python -m http.server 8000 --bind 127.0.0.1 and visit http://127.0.0.1:8000/trackerapp.html.';
    $('catch-map').textContent = 'Open the localhost preview to display the map.';
    $('reset-map').disabled = true;
  } else if (window.L) {
    map = L.map('catch-map', {scrollWheelZoom:false}).setView([39,-98],4);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:18,
      // Send the real page origin, never a forged Referer or a cache-busting URL.
      referrerPolicy:'strict-origin-when-cross-origin',
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    let tileFailure = false;
    tiles.on('tileerror', () => {
      if (tileFailure) return;
      tileFailure = true;
      map.removeLayer(tiles); // Stop requesting tiles after a failure; do not retry blocked requests.
      mapStatus.hidden = false;
      mapStatus.textContent = 'OpenStreetMap tiles are unavailable. Map requests have been paused; fish reports still work in the list. If the response is 403, deploying alone may not resolve it. Check that the page is served over HTTP(S) and that its real Referer is not being stripped. Reload after resolving the problem.';
    });
    tiles.addTo(map);
    markers = L.layerGroup().addTo(map);
    $('reset-map').onclick = () => map.setView([39,-98],4);
  } else {
    $('catch-map').textContent = 'Map unavailable. Use the report list to explore catches.';
    mapStatus.hidden = false;
    mapStatus.textContent = 'The Leaflet map library could not load from unpkg.com. Check your connection or content-blocking settings; this is separate from fish-report data.';
    $('reset-map').disabled = true;
  }
  load();
})();
