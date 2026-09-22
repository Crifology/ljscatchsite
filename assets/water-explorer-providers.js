(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WaterProviders = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const base = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/';
  const licenses = new Set(['cc0','cc-by','cc-by-sa']);
  const kinds = {390:'Lake',436:'Reservoir',493:'Coastal',460:'River',445:'Coastal',312:'Coastal'};
  function points(g) { return g.coordinates.flat(g.type === 'MultiPolygon' ? 2 : g.type === 'Polygon' || g.type === 'MultiLineString' ? 1 : 0); }
  function extent(g) {
    const p = points(g);
    return p.reduce((b,c) => [Math.min(b[0],c[0]),Math.min(b[1],c[1]),Math.max(b[2],c[0]),Math.max(b[3],c[1])],[180,90,-180,-90]);
  }
  function ringContains(p,ring) {
    let inside = false;
    for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[i],b=ring[j];
      if ((a[1]>p[1]) !== (b[1]>p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    return inside;
  }
  function contains(p,g) {
    const poly = rings => ringContains(p,rings[0]) && !rings.slice(1).some(r => ringContains(p,r));
    return g.type === 'Polygon' ? poly(g.coordinates) : g.type === 'MultiPolygon' && g.coordinates.some(poly);
  }
  function lineDistance(p,g) {
    const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    const sx=111320*Math.cos(p[1]*Math.PI/180),sy=111320;
    let distance=Infinity;
    for (const line of lines) for(let i=1;i<line.length;i++) {
      const a=[(line[i-1][0]-p[0])*sx,(line[i-1][1]-p[1])*sy],b=[(line[i][0]-p[0])*sx,(line[i][1]-p[1])*sy];
      const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
      const t=den ? Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/den)) : 0;
      distance=Math.min(distance,Math.hypot(a[0]+t*dx,a[1]+t*dy));
    }
    return distance;
  }
  async function waters(bbox,request) {
    const bounds=bbox.split(',').map(Number),center=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2];
    const results = await Promise.allSettled([12,9,6].map(async layer => {
      const where = layer===12 ? 'FTYPE IN (390,436,493)' : layer===9 ? 'FTYPE IN (460,445,312)' : 'FTYPE = 460';
      const params = new URLSearchParams({f:'geojson',where,geometry:bbox,geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'OBJECTID,GNIS_NAME,FTYPE',returnGeometry:'true',returnZ:'false',resultRecordCount:'60',orderByFields:'OBJECTID'});
      const data=await request(`${base}${layer}/query?${params}`);
      if(data.error || !Array.isArray(data.features)) throw Error('USGS water service unavailable');
      return {limited:data.exceededTransferLimit === true || data.features.length >= 60,features:data.features.map(f => {
        const p=f.properties, kind=kinds[p.FTYPE] || 'River';
        // Use a point on the actual boundary/flowline, never an off-water centroid.
        const vertices=points(f.geometry);
        const candidates=vertices.filter(p=>p[0]>=bounds[0]&&p[0]<=bounds[2]&&p[1]>=bounds[1]&&p[1]<=bounds[3]);
        const pin=(candidates.length?candidates:vertices).reduce((best,p)=>Math.hypot(p[0]-center[0],p[1]-center[1])<Math.hypot(best[0]-center[0],best[1]-center[1])?p:best).slice(0,2);
        return {...f,properties:{id:`nhd-${layer}-${p.OBJECTID}`,name:p.GNIS_NAME || `Unnamed ${kind.toLowerCase()}`,kind,country:'US',pin,species:[],loaded:false,source:{label:'USGS National Hydrography Dataset',license:'Public domain',url:`${base}${layer}`}}};
      })};
    }));
    if(results.every(r=>r.status==='rejected')) throw Error('USGS water service unavailable. Try again later.');
    return {type:'FeatureCollection',features:results.flatMap(r=>r.status==='fulfilled'?r.value.features:[]),limited:results.some(r=>r.status==='rejected'||r.value.limited),partial:results.some(r=>r.status==='rejected')};
  }
  function photo(p) {
    if (!p || !licenses.has(p.license_code) || !Number.isInteger(p.id)) return null;
    let url;
    try {url=new URL(p.medium_url || p.url);} catch {return null;}
    if(url.protocol!=='https:' || !['static.inaturalist.org','inaturalist-open-data.s3.amazonaws.com'].includes(url.hostname)) return null;
    return {url:url.href.replace('/square.','/medium.'),label:p.attribution || 'iNaturalist contributor',license:p.license_code.toUpperCase(),licenseCode:p.license_code,sourceUrl:`https://www.inaturalist.org/photos/${p.id}`,displayAllowed:true};
  }
  function speciesFrom(records,feature) {
    const species=new Map(),g=feature.geometry,linear=g.type.includes('LineString');
    for(const o of records) {
      const p=o.geojson?.coordinates,t=o.taxon;
      if(!t || t.rank!=='species' || !t.ancestor_ids?.includes(47178) || !licenses.has(o.license_code) || o.quality_grade!=='research' || o.captive || o.obscured || o.private_location || (o.geoprivacy && o.geoprivacy!=='open') || (o.taxon_geoprivacy && o.taxon_geoprivacy!=='open') || !o.place_ids?.includes(1) || !Array.isArray(p) || !p.every(Number.isFinite) || !Number.isInteger(o.id)) continue;
      // Unknown/poor accuracy cannot support a water-level match.
      if(!Number.isFinite(o.positional_accuracy) || o.positional_accuracy>100 || o.positional_accuracy<0) continue;
      if(linear ? lineDistance(p,g)>30 : !contains(p,g)) continue;
      const image=photo(t.default_photo);
      if(species.has(t.id)) {if(!species.get(t.id).photo) species.get(t.id).photo=image; continue;}
      species.set(t.id,{id:String(t.id),commonName:t.preferred_common_name || t.name,scientificName:t.name,photo:image,
        evidence:{label:o.user?.login || 'iNaturalist contributor',url:`https://www.inaturalist.org/observations/${o.id}`,license:o.license_code.toUpperCase(),licenseCode:o.license_code}});
    }
    return [...species.values()].sort((a,b)=>a.commonName.localeCompare(b.commonName));
  }
  async function observationFish(feature,request) {
    const [w,s,e,n]=extent(feature.geometry),pad=.001;
    const params=new URLSearchParams({taxon_id:'47178',place_id:'1',quality_grade:'research',captive:'false',geo:'true',license:'cc0,cc-by,cc-by-sa',geoprivacy:'open',taxon_geoprivacy:'open',swlng:String(Math.max(-180,w-pad)),swlat:String(Math.max(-90,s-pad)),nelng:String(Math.min(180,e+pad)),nelat:String(Math.min(90,n+pad)),per_page:'200',order_by:'observed_on',order:'desc'});
    const data=await request(`https://api.inaturalist.org/v1/observations?${params}`);
    if(!Array.isArray(data.results)) throw Error('Fish observations unavailable');
    return {species:speciesFrom(data.results,feature),limited:data.total_results>data.results.length,loaded:true};
  }
  function usgsSpecies(records,feature) {
    const found=new Map(),g=feature.geometry;
    for(const o of records) {
      const p=[o.decimalLongitude,o.decimalLatitude];
      if(o.group!=='Fishes'||o.latLongAccuracy!=='Accurate'||String(o.status).toLowerCase()!=='established'||!Number.isInteger(o.key)||!o.scientificName||!p.every(Number.isFinite))continue;
      if(g.type.includes('LineString')?lineDistance(p,g)>30:!contains(p,g))continue;
      const key=o.scientificName.trim().toLowerCase();
      if(!found.has(key))found.set(key,{id:`nas-${o.key}`,commonName:o.commonName||o.scientificName,scientificName:o.scientificName,photo:null,usgs:true,
        evidence:{label:'USGS NAS · introduced population classified as established',license:'Public domain',url:`https://nas.er.usgs.gov/queries/SpecimenViewer.aspx?SpecimenID=${o.key}`}});
    }
    return [...found.values()];
  }
  async function fish(feature,request,nasRequest) {
    if(!nasRequest)return observationFish(feature,request);
    const b=extent(feature.geometry),pad=.001;
    const bbox=[Math.max(-180,b[0]-pad),Math.max(-90,b[1]-pad),Math.min(180,b[2]+pad),Math.min(90,b[3]+pad)].join(',');
    const results=await Promise.allSettled([observationFish(feature,request),nasRequest(bbox)]);
    if(results.every(r=>r.status==='rejected'))throw Error('Fish data sources unavailable');
    const merged=new Map();
    let limited=false;
    const unavailable=[];
    results.forEach((r,i)=>{
      if(r.status==='rejected'){unavailable.push(i===0?'iNaturalist':'USGS NAS');return;}
      limited ||= r.value.limited===true;
      if(r.value.partial)unavailable.push('Some USGS NAS records');
      const list=i===0?r.value.species:usgsSpecies(r.value.results,feature);
      for(const s of list){
        const key=s.scientificName.trim().toLowerCase(),old=merged.get(key);
        if(old){old.extraEvidence=[...(old.extraEvidence||[]),s.evidence];old.usgs ||= s.usgs;old.photo ||= s.photo;}
        else merged.set(key,s);
      }
    });
    return {species:[...merged.values()].sort((a,b)=>a.commonName.localeCompare(b.commonName)),limited,unavailable,loaded:true};
  }
  async function areaFish(features,bbox,request,nasRequest) {
    const [w,s,e,n]=bbox.split(',');
    let observations, sightings;
    const shared = address => {
      if(!observations){
        const url=new URL(address);
        for(const [key,value] of Object.entries({swlng:w,swlat:s,nelng:e,nelat:n}))url.searchParams.set(key,value);
        observations=Promise.resolve().then(()=>request(url.href));
      }
      return observations;
    };
    const nas = () => sightings ||= Promise.resolve().then(()=>nasRequest(bbox));
    return Promise.all(features.map(async feature => {
      try { return await fish(feature,shared,nasRequest ? nas : undefined); }
      catch { return {loaded:false,species:[],error:'Fish sources unavailable. Select this water to retry.'}; }
    }));
  }
  return {waters,fish,areaFish,speciesFrom,usgsSpecies,contains,lineDistance,extent};
});
