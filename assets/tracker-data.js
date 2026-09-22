/* Provider adapters: only documented public APIs, never scraped pages. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const licenses = new Set(['cc0', 'cc-by', 'cc-by-sa']);
  const states = new Set(('Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia').split('|'));
  const isoDay = n => new Date(n).toISOString().slice(0, 10);
  function windowFor(period, now = Date.now()) {
    if (!['1', '7', '30'].includes(String(period))) throw new Error('Invalid report period');
    const days = Number(period);
    return { days, now, start: now - days * DAY, dateStart: isoDay(now - (days - 1) * DAY), dateEnd: isoDay(now) };
  }
  function validDay(day) {
    return /^\d{4}-\d{2}-\d{2}$/.test(day || '') && Number.isFinite(Date.parse(day)) && isoDay(Date.parse(day)) === day;
  }
  function inWindow(o, window) {
    // Never treat an upload date, an unknown time, or midnight invented from a date as a catch time.
    if (o.time_observed_at && /T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(o.time_observed_at)) {
      const time = Date.parse(o.time_observed_at);
      return Number.isFinite(time) && time >= window.start && time <= window.now;
    }
    return window.days !== 1 && validDay(o.observed_on) && o.observed_on >= window.dateStart && o.observed_on <= window.dateEnd;
  }
  function coordinates(c) {
    return Array.isArray(c) && c.length === 2 && c.every(Number.isFinite) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90 && !(c[0] === 0 && c[1] === 0);
  }
  function inaturalist(o) {
    if (!o.taxon || !licenses.has(o.license_code) || o.obscured || o.private_location ||
        (o.geoprivacy && o.geoprivacy !== 'open') || (o.taxon_geoprivacy && o.taxon_geoprivacy !== 'open') ||
        !coordinates(o.geojson?.coordinates) || !Number.isInteger(o.id)) return null;
    return { ...o, source: 'iNaturalist', kind: 'Angling project report', sourceKey: `inat-${o.id}`,
      sourceUrl: `https://www.inaturalist.org/observations/${o.id}`,
      credit: `${o.user?.login || 'iNaturalist contributor'} · ${o.license_code.toUpperCase()}` };
  }
  function usgs(o) {
    if (o.group !== 'Fishes' || !states.has(o.state) || o.latLongAccuracy !== 'Accurate' ||
        !coordinates([o.decimalLongitude, o.decimalLatitude]) || !Number.isInteger(o.key)) return null;
    const day = `${o.year}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')}`;
    if (!validDay(day)) return null;
    return { id: o.key, sourceKey: `nas-${o.key}`, source: 'USGS NAS', kind: 'Fish sighting · catch not confirmed',
      sourceUrl: `https://nas.er.usgs.gov/queries/SpecimenViewer.aspx?SpecimenID=${o.key}`,
      taxon: { name: o.scientificName, preferred_common_name: o.commonName },
      observed_on: day, time_observed_at: null, geojson: { coordinates: [o.decimalLongitude, o.decimalLatitude] },
      place_guess: [o.locality, o.county, o.state].filter(Boolean).join(', '),
      reportedWater: o.locality || null, accuracyText: 'USGS classifies this location as Accurate; numeric precision is not supplied.',
      credit: 'U.S. Geological Survey, Nonindigenous Aquatic Species Database · public-domain USGS data',
      license_code: 'public-domain' };
  }
  async function fetchInaturalist(window, request) {
    const params = new URLSearchParams({project_id:'239695', place_id:'1', geo:'true', geoprivacy:'open', taxon_geoprivacy:'open',
      license:'cc0,cc-by,cc-by-sa', order_by:'observed_on', order:'desc', per_page:'200',
      d1:isoDay(window.start - DAY), d2:isoDay(window.now + DAY)});
    const data = await request(`https://api.inaturalist.org/v1/observations?${params}`);
    if (!Array.isArray(data.results)) throw new Error('Invalid iNaturalist response');
    return {reports:data.results.map(inaturalist).filter(Boolean), limited:data.total_results > data.results.length};
  }
  async function fetchUSGS(window, request) {
    // NAS has dates, not times. Do not query it for a strict rolling 24-hour view.
    if (window.days === 1) return {reports:[], skipped:'Date-only source; excluded from Last 24 Hours.', limited:false};
    const first = new Date(`${window.dateStart}T00:00:00Z`), last = new Date(window.now);
    let year = first.getUTCFullYear(), month = first.getUTCMonth() + 1;
    const reports = []; let limited = false;
    while (year < last.getUTCFullYear() || (year === last.getUTCFullYear() && month <= last.getUTCMonth() + 1)) {
      // The API orders by record/species ID, not date. Fetch at most two pages per month and disclose truncation.
      for (let page = 0; page < 2; page++) {
        const params = new URLSearchParams({group:'Fishes', year:String(year), month:String(month), spatialAcc:'Accurate', yrAcc:'Actual', limit:'200', offset:String(page * 200)});
        const data = await request(`https://nas.er.usgs.gov/api/v2/occurrence/search?${params}`);
        if (!Array.isArray(data.results)) throw new Error('Invalid USGS response');
        reports.push(...data.results.map(usgs).filter(Boolean));
        if (String(data.endOfRecords) === 'true' || data.results.length < 200) break;
        if (page === 1) limited = true;
      }
      month++; if (month === 13) { month = 1; year++; }
    }
    return {reports, limited};
  }
  function select(reports, window) {
    const seen = new Set();
    return reports.filter(o => {
      if (!inWindow(o, window) || seen.has(o.sourceKey)) return false;
      seen.add(o.sourceKey); return true;
    }).sort((a,b) => Date.parse(b.time_observed_at || b.observed_on) - Date.parse(a.time_observed_at || a.observed_on));
  }
  const exports = {windowFor, inWindow, inaturalist, usgs, fetchInaturalist, fetchUSGS, select};
  if (typeof module === 'object' && module.exports) module.exports = exports;
  else root.TrackerData = exports;
})(typeof globalThis === 'object' ? globalThis : this);
