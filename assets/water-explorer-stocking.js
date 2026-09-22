(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WaterStocking=api;
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  function distance(point,g,providers){
    if(providers.contains(point,g))return 0;
    if(g.type==='LineString'||g.type==='MultiLineString')return providers.lineDistance(point,g);
    const rings=g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():[];
    return rings.length?providers.lineDistance(point,{type:'MultiLineString',coordinates:rings}):Infinity;
  }
  function nearest(point,response,providers){
    if(response.limited||response.partial) return null;
    const candidates=response.features.map(feature=>({feature,meters:distance(point,feature.geometry,providers)})).filter(x=>x.meters<=1000).sort((a,b)=>a.meters-b.meters);
    if(!candidates.length)return null;
    // Polygon and centerline may overlap. Do not guess between equally close waters.
    if(candidates.length>1&&Math.abs(candidates[0].meters-candidates[1].meters)<1)return null;
    return candidates[0];
  }
  function species(event,meters){
    return {id:`stocking-${event.id}`,commonName:event.commonName,scientificName:event.scientificName,photo:null,stocked:true,stockingMeters:Math.round(meters),evidence:{...event.source,licenseCode:event.source.license==='CC BY 4.0'?'cc-by':event.source.license==='CC BY-SA 4.0'?'cc-by-sa':event.source.license==='CC0'?'cc0':undefined}};
  }
  function merge(feature,incoming){
    const list=feature.properties.species;
    const existing=list.find(s=>s.scientificName.trim().toLowerCase()===incoming.scientificName.trim().toLowerCase());
    if(existing){
      existing.stocked=true;existing.stockingMeters=incoming.stockingMeters;
      if(existing.evidence.url!==incoming.evidence.url&&!(existing.extraEvidence||[]).some(s=>s.url===incoming.evidence.url))existing.extraEvidence=[...(existing.extraEvidence||[]),incoming.evidence];
    }
    else list.push(incoming);
    list.sort((a,b)=>a.commonName.localeCompare(b.commonName));
  }
  async function attach(features,events,lookup,providers,current=()=>true){
    const merged=new Map(features.map(f=>[f.properties.id,f]));
    let matched=0,unmatched=0;
    for(const event of events){
      if(!current())break;
      const [lng,lat]=event.coordinates,dy=1100/110540,dx=1100/(111320*Math.cos(lat*Math.PI/180));
      try{
        const response=await lookup([Math.max(-180,lng-dx),Math.max(-85,lat-dy),Math.min(180,lng+dx),Math.min(85,lat+dy)].join(','));
        if(!current())break;
        const match=nearest(event.coordinates,response,providers);
        if(!match){unmatched++;continue;}
        const id=match.feature.properties.id,feature=merged.get(id)||match.feature;
        const entry=species(event,match.meters);
        feature.properties.stockingSpecies=[...(feature.properties.stockingSpecies||[]),entry];
        merge(feature,entry);merged.set(id,feature);matched++;
      }catch{unmatched++;}
    }
    return {features:[...merged.values()],matched,unmatched};
  }
  return {distance,nearest,merge,attach};
});
