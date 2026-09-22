const fs=require('node:fs');
const path=require('node:path');
const {states}=require('./assets/water-explorer-location.js');
const FOLDER=path.join(__dirname,'database');
function usablePhoto(photo){
  if(!photo?.displayAllowed||!['cc0','cc-by','cc-by-sa','public-domain'].includes(photo.licenseCode)||!photo.label||!/^\/assets\/fish-photos\/[a-z0-9-]+\.(jpg|png|webp)$/.test(photo.url))return null;
  try{if(new URL(photo.sourceUrl).protocol!=='https:'||new URL(photo.licenseUrl).hostname!=='creativecommons.org')return null;}catch{return null;}
  return photo;
}
function feature(water,source){
  const evidence=e=>({label:`USGS NAS record ${e.recordId}${e.reportedDate?` (${e.reportedDate})`:''}`,license:source.license,url:e.url});
  return {type:'Feature',geometry:{type:'Point',coordinates:water.coordinates},properties:{
    id:`database-${water.id}`,name:water.name,kind:water.kind,state:water.state,country:'US',pin:water.coordinates,
    loaded:true,database:true,source,accuracyText:water.coordinateAccuracy,
    species:water.species.map(s=>({id:`database-${s.scientificName}`,commonName:s.commonName,scientificName:s.scientificName,
      usgs:true,photo:usablePhoto(s.photo),evidence:evidence(s.evidence[0]),extraEvidence:s.evidence.slice(1,10).map(evidence),
      evidenceCount:s.evidence.length}))}};
}
function createDatabaseService({read=code=>JSON.parse(fs.readFileSync(path.join(FOLDER,`${code}.json`),'utf8')),limit=1500}={}){
  const cache=new Map();
  return params=>{
    const state=params.get('state')||'us',code=state==='alaska'?'AK':state==='hawaii'?'HI':state.toUpperCase();
    const raw=params.get('bbox')||'',b=raw.split(',').map(Number);
    if(b.length!==4||raw.split(',').some(v=>!v.trim())||!b.every(Number.isFinite)||b[0]<-180||b[2]>180||b[1]<-90||b[3]>90||b[0]>=b[2]||b[1]>=b[3]||state!=='us'&&(!states[code]||code==='DC'))
      return {status:400,data:{error:'Invalid database state or bounds'}};
    // Offshore localities can belong to a coastal state without intersecting its
    // land boundary. Filter actual coordinates, not state land extents.
    const selected=state==='us'?Object.keys(states).filter(c=>c!=='DC'):[code];
    const term=(params.get('q')||'').trim().toLowerCase(),kind=params.get('kind')||'';
    const candidates=[],unavailable=[],partial=[];let matchingWaters=0;
    const species=new Map();
    for(const c of selected){
      let data;
      try{
        const hit=cache.get(c);
        if(hit&&Date.now()-hit.at<300000)data=hit.data;
        else {data=read(c);if(data.schemaVersion!==1||!Array.isArray(data.waters)||!data.sources?.[0])throw Error('Invalid database');cache.set(c,{data,at:Date.now()});}
      }catch{unavailable.push(c);continue;}
      if(!data.coverage.complete)partial.push(c);
      for(const water of data.waters){
        const [lng,lat]=water.coordinates;
        if(lng<b[0]||lng>b[2]||lat<b[1]||lat>b[3]||kind&&water.kind!==kind)continue;
        const matching=water.species.filter(s=>[s.commonName,s.scientificName].join(' ').toLowerCase().includes(term));
        if(!matching.length)continue;
        const candidate={water,source:data.sources[0]};candidates.push(candidate);matchingWaters++;
        for(const s of matching){
          const key=s.scientificName.trim().toLowerCase();
          if(!species.has(key))species.set(key,{commonName:s.commonName,candidate});
        }
      }
    }
    // Reserve a pin for each of the first 20 species across the entire query,
    // before capping locations. Otherwise early water names can hide fish types.
    const chosen=new Set([...species.values()].sort((a,b)=>a.commonName.localeCompare(b.commonName)).slice(0,Math.min(20,limit)).map(s=>s.candidate));
    for(const candidate of candidates){if(chosen.size>=limit)break;chosen.add(candidate);}
    const features=[...chosen].map(({water,source})=>feature(water,source));
    return {status:200,data:{type:'FeatureCollection',features,limited:matchingWaters>features.length,
      matchingWaters,matchingSpecies:species.size,unavailable,partial,source:'Local USGS NAS state databases'}};
  };
}
module.exports={feature,createDatabaseService,usablePhoto};
