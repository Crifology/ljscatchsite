/* Official MassGIS water geometry; nearest named feature is context, not proof of a catch site. */
(function(root) {
  'use strict';
  const base = 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Water_Features/FeatureServer';
  const credit = 'MassGIS (Bureau of Geographic Information), Commonwealth of Massachusetts EOTSS';
  function distance(point, geometry) {
    const scale = Math.cos(point[1]*Math.PI/180);
    const project = p => [(p[0]-point[0])*111320*scale,(p[1]-point[1])*111320];
    let best = Infinity, inside = false;
    for (const path of geometry?.rings || geometry?.paths || []) {
      for (let i=0;i<path.length-1;i++) {
        const [x,y]=project(path[i]), [u,v]=project(path[i+1]);
        const dx=u-x,dy=v-y,den=dx*dx+dy*dy;
        const t=den ? Math.max(0,Math.min(1,-(x*dx+y*dy)/den)) : 0;
        best=Math.min(best,Math.hypot(x+t*dx,y+t*dy));
        if (geometry.rings && ((y>0)!==(v>0)) && 0 < x+(u-x)*(-y)/(v-y)) inside=!inside;
      }
    }
    return inside ? 0 : best;
  }
  function nearest(point, features) {
    return features.map(f=>({name:f.attributes?.NAME?.trim(), meters:distance(point,f.geometry), geometry:f.geometry}))
      .filter(f=>f.name && f.meters <= 1000).sort((a,b)=>a.meters-b.meters)[0] || null;
  }
  async function lookup(point,request) {
    if (!Array.isArray(point) || point.length!==2 || !point.every(Number.isFinite)) throw new Error('Invalid location');
    const all=[];
    for (const layer of [8,7]) {
      // Exclude wetlands, islands, artificial facilities, dams and aqueducts.
      const codes = layer===8 ? 'MINOR_NUM IN (101,116,412,414,419,421,101619)' : 'ARC_CODE IN (1,4,5,6,9,10,11)';
      const params=new URLSearchParams({f:'json', where:`NAME IS NOT NULL AND NAME <> '' AND ${codes}`,
        geometry:point.join(','), geometryType:'esriGeometryPoint', inSR:'4326', outSR:'4326', distance:'1000',
        units:'esriSRUnit_Meter', spatialRel:'esriSpatialRelIntersects', outFields:'NAME', returnGeometry:'true', resultRecordCount:'100'});
      const result=await request(`${base}/${layer}/query?${params}`);
      if (result.error || !Array.isArray(result.features)) throw new Error('Water service unavailable');
      if (result.exceededTransferLimit) throw new Error('Too many water features to establish nearest');
      all.push(...result.features);
    }
    return nearest(point,all);
  }
  const exports={lookup,nearest,distance,credit};
  if(typeof module==='object' && module.exports) module.exports=exports;
  else root.TrackerWater=exports;
})(globalThis);
