/* Public USGS WBD + NAS APIs. Fixed endpoints; bounded requests, no scraping. */
function createUSGSService({fetcher=fetch,now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  const cache=new Map(),pending=new Map();
  let queue=Promise.resolve(),next=0,blocked=0,hour=0,calls=0;
  async function json(url) {
    if(now()<blocked)throw Error('USGS cooling down');
    await pause(Math.max(0,next-now()));
    const bucket=Math.floor(now()/3600000);
    if(bucket!==hour){hour=bucket;calls=0;}
    if(calls>=600)throw Error('Local USGS request budget reached');
    calls++;next=now()+1100;
    const r=await fetcher(url,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{Accept:'application/json','User-Agent':'LJsCatchWaterExplorer/1.0'}});
    if(!r.ok){
      const h=r.headers.get('Retry-After'),until=/^\d+$/.test(h||'')?now()+Number(h)*1000:Date.parse(h);
      blocked=Math.max(now()+60000,Number.isFinite(until)?until:0);throw Error('USGS unavailable');
    }
    const d=await r.json();if(d.error)throw Error('USGS service error');return d;
  }
  return async params=>{
    const bbox=params.get('bbox') || '',b=bbox.split(',').map(Number);
    if(b.length!==4||!b.every(Number.isFinite)||bbox.split(',').some(v=>!v.trim())||b[0]<-180||b[2]>180||b[1]<-90||b[3]>90||b[0]>=b[2]||b[1]>=b[3])return {status:400,data:{error:'Invalid water bounds'}};
    const key=b.map(v=>v.toFixed(5)).join(','),hit=cache.get(key);
    if(hit&&now()-hit.at<3600000)return {status:200,data:hit.data};
    if(pending.has(key))return pending.get(key);
    if(pending.size>=10)return {status:429,retry:60,data:{error:'USGS request queue full'}};
    const task=queue.catch(()=>{}).then(async()=>{
      try {
        const query=new URLSearchParams({f:'json',where:'1=1',geometry:key,geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'HUC12',returnGeometry:'false',resultRecordCount:'4',orderByFields:'HUC12'});
        const watersheds=await json(`https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer/6/query?${query}`);
        if(!Array.isArray(watersheds.features))throw Error('Invalid watershed response');
        const values=watersheds.features.map(f=>f.attributes?.huc12 ?? f.attributes?.HUC12);
        if(values.some(v=>!/^\d{12}$/.test(v)))throw Error('Invalid watershed identifier');
        const codes=[...new Set(values)];
        let limited=watersheds.exceededTransferLimit===true||codes.length>3,partial=false;
        const records=new Map();
        for(const code of codes.slice(0,3)) {
          try {
            const q=new URLSearchParams({group:'Fishes',huc12:code,spatialAcc:'Accurate',status:'established',limit:'100',offset:'0'});
            const data=await json(`https://nas.er.usgs.gov/api/v2/occurrence/search?${q}`);
            if(!Array.isArray(data.results))throw Error('Invalid NAS response');
            limited ||= String(data.endOfRecords)!=='true';
            for(const o of data.results) {
              if(o.group!=='Fishes'||o.latLongAccuracy!=='Accurate'||String(o.status).toLowerCase()!=='established'||!Number.isInteger(o.key)||!Number.isFinite(o.decimalLongitude)||!Number.isFinite(o.decimalLatitude))continue;
              if(o.decimalLongitude<b[0]||o.decimalLongitude>b[2]||o.decimalLatitude<b[1]||o.decimalLatitude>b[3])continue;
              records.set(o.key,{key:o.key,scientificName:o.scientificName,commonName:o.commonName,group:o.group,status:o.status,latLongAccuracy:o.latLongAccuracy,decimalLongitude:o.decimalLongitude,decimalLatitude:o.decimalLatitude});
            }
          }catch {partial=true;limited=true;}
        }
        const data={results:[...records.values()],limited,partial};
        // A failed fish source is never cached or mislabeled as an empty inventory.
        if(partial&&records.size===0)throw Error('USGS fish records unavailable');
        if(!partial){if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,{at:now(),data});}
        return {status:200,data};
      }catch {blocked=Math.max(blocked,now()+60000);return {status:503,retry:Math.ceil((blocked-now())/1000),data:{error:'USGS fish service unavailable'}};}
    });
    queue=task;pending.set(key,task);
    try{return await task;}finally{pending.delete(key);}
  };
}
module.exports={createUSGSService};
