/* Shared map feature validation and filtering for the free water explorer. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WaterExplorerData = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const regions = {
    us: {label:'Contiguous United States', center:[39,-98], zoom:4},
    alaska: {label:'Alaska', center:[64,-152], zoom:4},
    hawaii: {label:'Hawaii', center:[20.8,-157], zoom:6}
  };
  const text = v => typeof v === 'string' && v.trim().length > 0;
  function https(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; }
    catch { return null; }
  }
  const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  function geometry(g) {
    const line = x => Array.isArray(x) && x.length >= 2 && x.every(point);
    const ring = x => line(x) && x.length >= 4 && x[0][0] === x.at(-1)[0] && x[0][1] === x.at(-1)[1];
    const polygon = x => Array.isArray(x) && x.length > 0 && x.every(ring);
    if (!g) return false;
    switch (g.type) {
      case 'Point': return point(g.coordinates);
      case 'LineString': return line(g.coordinates);
      case 'MultiLineString': return Array.isArray(g.coordinates) && g.coordinates.length > 0 && g.coordinates.every(line);
      case 'Polygon': return polygon(g.coordinates);
      case 'MultiPolygon': return Array.isArray(g.coordinates) && g.coordinates.length > 0 && g.coordinates.every(polygon);
      default: return false;
    }
  }
  function source(s) { return s && text(s.label) && text(s.license) && https(s.url); }
  function normalize(payload) {
    if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features) || payload.features.length > 250 || typeof payload.limited !== 'boolean') throw Error('Invalid water catalogue response');
    const ids = new Set();
    const features = payload.features.map(f => {
      const p = f?.properties;
      if (f?.type !== 'Feature' || !geometry(f.geometry) || !p || !text(p.id) || ids.has(p.id) || !text(p.name) || p.country !== 'US' || !point(p.pin) || !source(p.source) || !Array.isArray(p.species) || p.species.length > 200) throw Error('Invalid water record');
      ids.add(p.id);
      const speciesIds = new Set();
      const species = p.species.map(s => {
        if (!text(s.id) || speciesIds.has(s.id) || !text(s.commonName) || !text(s.scientificName) || !source(s.evidence)) throw Error('Invalid water-specific species evidence');
        speciesIds.add(s.id);
        // Rights must be checked by the backend. A public image URL alone is insufficient.
        const photo = s.photo?.displayAllowed === true && https(s.photo.url) && source(s.photo)
          ? {...s.photo, url:https(s.photo.url)} : null;
        return {...s, photo};
      });
      return {...f, properties:{...p, species}};
    });
    return {features, limited:payload.limited};
  }
  function filter(features, term, type) {
    const query = term.trim().toLocaleLowerCase();
    return features.filter(({properties:p}) => (!type || p.kind === type) &&
      [p.name,p.state,...p.species.flatMap(s => [s.commonName,s.scientificName])].join(' ').toLocaleLowerCase().includes(query));
  }
  function boundsQuery(bounds) {
    const [west,south,east,north] = bounds;
    if (!bounds.every(Number.isFinite) || west < -180 || east > 180 || west >= east || south < -90 || north > 90 || south >= north) throw Error('Choose an area within the map bounds');
    return bounds.map(n => n.toFixed(4)).join(',');
  }
  return {regions,https,normalize,filter,boundsQuery};
});
