const fs=require('node:fs');
const path=require('node:path');
const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
// App import format. Do not mistake statewide totals for geolocated stocking events.
function normalizeStocking(data){
  if(Array.isArray(data?.stocking)&&data.license==='https://creativecommons.org/licenses/by/4.0/'){
    const summaries=data.stocking.filter(r=>typeof r.state==='string'&&/^[A-Z]{2}$/.test(r.state)&&typeof r.stateName==='string').map(r=>({state:r.state,stateName:r.stateName,agency:typeof r.agency==='string'?r.agency:'',annualCount:Number.isFinite(r.annualCount)&&r.annualCount>=0?r.annualCount:null,year:Number.isInteger(r.year)?r.year:null,source:typeof r.source==='string'?r.source:''}));
    return {events:[],rejected:0,summaries,unlocated:summaries.length,aggregateOnly:true,attribution:'FishFig',license:'CC BY 4.0',sourceUrl:'https://fishfig.com/data/',version:data.version};
  }
  if(data?.schemaVersion!==1||!Array.isArray(data.events)||data.events.length>100000)throw Error('Stocking data needs the version 1 event format with coordinates; statewide totals cannot be placed on waters.');
  const ids=new Set(),events=[];
  let rejected=0;
  for(const e of data.events){
    const valid=typeof e.id==='string'&&e.id.trim()&&!ids.has(e.id)&&e.country==='US'&&typeof e.state==='string'&&/^[A-Z]{2}$/.test(e.state)&&
      Array.isArray(e.coordinates)&&e.coordinates.length===2&&e.coordinates.every(Number.isFinite)&&Math.abs(e.coordinates[0])<=180&&Math.abs(e.coordinates[1])<=85&&
      typeof e.commonName==='string'&&e.commonName.trim()&&typeof e.scientificName==='string'&&e.scientificName.trim()&&
      typeof e.source?.label==='string'&&e.source.label.trim()&&https(e.source.url)&&['CC0','CC BY 4.0','CC BY-SA 4.0','Public domain'].includes(e.source.license)&&
      e.status==='completed';
    if(!valid){rejected++;continue;}
    ids.add(e.id);
    events.push({id:e.id,country:'US',state:e.state,coordinates:e.coordinates,commonName:e.commonName,scientificName:e.scientificName,source:{label:e.source.label,url:e.source.url,license:e.source.license},status:'completed'});
  }
  return {events,rejected};
}
function createStockingService({file=process.env.STOCKING_DATA_FILE||(fs.existsSync(path.join(__dirname,'data','stocking-events.json'))?path.join(__dirname,'data','stocking-events.json'):path.join(__dirname,'stocking-2026.json')),read=()=>fs.readFileSync(file,'utf8'),readSummary=()=>fs.readFileSync(path.join(__dirname,'stocking-2026.json'),'utf8')}={}){
  let cached,expires=0;
  return params=>{
    if(params.has('state')){
      const state=params.get('state');
      if(state!=='us'&&!/^[A-Z]{2}$/.test(state))return {status:400,data:{error:'Invalid state'}};
      try{
        const data=normalizeStocking(JSON.parse(readSummary()));
        if(!data.summaries)throw Error('No state summaries');
        return {status:200,data:{state,summary:data.summaries.find(r=>r.state===state)||null,states:data.summaries.length,reportedCounts:data.summaries.filter(r=>r.annualCount!==null).length,attribution:data.attribution,license:data.license,sourceUrl:data.sourceUrl,version:data.version}};
      }catch{return {status:503,data:{error:'State stocking summary unavailable'}};}
    }
    const raw=params.get('bbox')||'',b=raw.split(',').map(Number);
    if(b.length!==4||raw.split(',').some(v=>!v.trim())||!b.every(Number.isFinite)||b[0]<-180||b[2]>180||b[1]<-90||b[3]>90||b[0]>=b[2]||b[1]>=b[3])return {status:400,data:{error:'Invalid bounds'}};
    try{
      if(!cached||Date.now()>=expires){cached=normalizeStocking(JSON.parse(read()));expires=Date.now()+60000;}
      const events=cached.events.filter(e=>e.coordinates[0]>=b[0]&&e.coordinates[0]<=b[2]&&e.coordinates[1]>=b[1]&&e.coordinates[1]<=b[3]);
      return {status:200,data:{events:events.slice(0,10),limited:events.length>10,rejected:cached.rejected,aggregateOnly:cached.aggregateOnly===true,unlocated:cached.unlocated||0}};
    }catch(error){return {status:503,data:{error:error.code==='ENOENT'?'Stocking event file has not been supplied.':'Stocking file is unavailable or lacks valid event-level locations.'}};}
  };
}
module.exports={normalizeStocking,createStockingService};
