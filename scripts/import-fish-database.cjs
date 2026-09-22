/* Reproducible import of public USGS NAS fish records. Node 22+. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {states}=require('../assets/water-explorer-location.js');
const ROOT=path.resolve(__dirname,'..');
const SOURCE={id:'usgs-nas',label:'USGS Nonindigenous Aquatic Species',license:'Public domain',url:'https://nas.er.usgs.gov/',documentation:'https://nas.er.usgs.gov/api/documentation.aspx'};
const clean=value=>typeof value==='string'?value.trim().replace(/\s+/g,' '):'';
function waterKind(name){
  if(/\b(reservoir|res\.)\b/i.test(name))return 'Reservoir';
  if(/\b(lake|pond|lagoon|loch|lakes|ponds)\b/i.test(name))return 'Lake';
  if(/\b(ocean|sea|bay|gulf|sound|estuary|harbor|harbour|coast|inlet)\b/i.test(name))return 'Coastal';
  if(/\b(river|creek|brook|stream|canal|slough|branch|fork|run|bayou|springs?)\b/i.test(name))return 'River';
  return null;
}
function normalize(record,code){
  const area=states[code],name=clean(record.locality),kind=waterKind(name);
  const coordinates=[record.decimalLongitude,record.decimalLatitude];
  if(!area || ![code,area.label].includes(record.state) || record.group!=='Fishes' ||
    record.latLongAccuracy!=='Accurate' || clean(record.status).toLowerCase()!=='established' ||
    !Number.isInteger(record.key) || !clean(record.scientificName) || !name || !kind ||
    /\b(unknown|unspecified|unnamed|unidentified)\b/i.test(name) ||
    !coordinates.every(Number.isFinite) || Math.abs(coordinates[0])>180 || Math.abs(coordinates[1])>90 ||
    coordinates.every(n=>n===0))return null;
  return {key:record.key,name,kind,county:clean(record.county),coordinates,
    commonName:clean(record.commonName)||clean(record.scientificName),scientificName:clean(record.scientificName),
    year:Number.isInteger(record.year)?record.year:null,reportedDate:clean(record.date)||null,
    recordType:clean(record.recordType)||null,coordinateSource:clean(record.latLongSource)||null};
}
function groupRecords(records,code){
  const waters=new Map(),seen=new Set();let accepted=0,rejected=0;
  for(const raw of records){
    if(seen.has(raw.key))continue;seen.add(raw.key);
    const r=normalize(raw,code);if(!r){rejected++;continue;}accepted++;
    // Exact reported locality + county + nearby coordinate cell: never merge a whole
    // river or identically named waters across a state into an invented location.
    const key=JSON.stringify([r.name.toLowerCase(),r.county.toLowerCase(),r.coordinates.map(n=>n.toFixed(3))]);
    if(!waters.has(key))waters.set(key,{id:`${code.toLowerCase()}-${crypto.createHash('sha256').update(key).digest('hex').slice(0,16)}`,
      name:r.name,kind:r.kind,state:code,county:r.county,coordinates:r.coordinates,
      locationType:'reported-water-locality',coordinateAccuracy:'Accurate (USGS classification; not a measured error radius)',species:[]});
    const water=waters.get(key),speciesKey=r.scientificName.toLowerCase();
    let species=water.species.find(s=>s.scientificName.toLowerCase()===speciesKey);
    if(!species){species={commonName:r.commonName,scientificName:r.scientificName,status:'established',evidence:[]};water.species.push(species);}
    species.evidence.push({sourceId:SOURCE.id,recordId:r.key,url:`https://nas.er.usgs.gov/queries/SpecimenViewer.aspx?SpecimenID=${r.key}`,
      year:r.year,reportedDate:r.reportedDate,recordType:r.recordType,coordinates:r.coordinates,coordinateSource:r.coordinateSource});
  }
  const list=[...waters.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  for(const water of list)water.species.sort((a,b)=>a.commonName.localeCompare(b.commonName));
  return {waters:list,accepted,rejected};
}
function documentFor(code,records,importInfo){
  const {waters,accepted,rejected}=groupRecords(records,code);
  return {schemaVersion:1,state:{code,name:states[code].label},generatedAt:new Date().toISOString(),
    coverage:{scope:'Introduced fish reported as established in USGS NAS; historical records, not a complete species inventory.',
      locationMethod:'Original reported water locality and public coordinates; names are not canonical waterbody identifiers.',
      ...importInfo,sourceRecords:records.length,acceptedRecords:accepted,rejectedRecords:rejected},
    sources:[SOURCE],counts:{waters:waters.length,species:new Set(waters.flatMap(w=>w.species.map(s=>s.scientificName.toLowerCase()))).size,
      waterSpeciesPairs:waters.reduce((n,w)=>n+w.species.length,0),evidence:accepted},waters};
}
function writeJSON(file,data){
  fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2)+'\n');fs.renameSync(file+'.tmp',file);
}
function updateIndex(folder){
  const entries=Object.keys(states).filter(code=>code!=='DC').map(code=>{
    const file=path.join(folder,`${code}.json`);
    if(!fs.existsSync(file))return {code,name:states[code].label,file:`${code}.json`,status:'pending'};
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    return {code,name:states[code].label,file:`${code}.json`,status:data.coverage.status,complete:data.coverage.complete,
      generatedAt:data.generatedAt,...data.counts};
  });
  writeJSON(path.join(folder,'index.json'),{schemaVersion:1,generatedAt:new Date().toISOString(),sources:[SOURCE],states:entries});
}
async function importState(code,{fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),maxPages=100,cacheDir,refresh=false}={}){
  const records=[],queries=[];let complete=false,error=null;
  const seen=new Set();
  for(let page=0;page<maxPages;page++){
    const offset=records.length;
    const query=new URLSearchParams({group:'Fishes',state:code,spatialAcc:'Accurate',status:'established',limit:'1000',offset:String(offset)});
    const url=`https://nas.er.usgs.gov/api/v2/occurrence/search?${query}`;
    const cacheFile=cacheDir&&path.join(cacheDir,`${code}-${offset}.json`);
    try{
      let data;
      if(!refresh&&cacheFile&&fs.existsSync(cacheFile)&&Date.now()-fs.statSync(cacheFile).mtimeMs<30*86400000){
        data=JSON.parse(fs.readFileSync(cacheFile,'utf8'));
      }else{
        await pause(1200);
        const response=await fetcher(url,{signal:AbortSignal.timeout(45000),headers:{Accept:'application/json','User-Agent':'LJsCatchFishDatabase/1.0'},redirect:'error'});
        if(!response.ok){const failure=Error(`USGS HTTP ${response.status}; Retry-After: ${response.headers.get('retry-after')||'not supplied'}`);failure.stop=response.status===429||response.status===403;throw failure;}
        data=await response.json();
        if(!Array.isArray(data.results)||!['true','false'].includes(String(data.endOfRecords)))throw Error('Invalid USGS response');
        if(cacheFile)writeJSON(cacheFile,data);
      }
      if(!Array.isArray(data.results)||Number(data.offset)!==offset)throw Error('Invalid page or pagination offset');
      if(data.results.length&&data.results.every(r=>seen.has(r.key)))throw Error('Source repeated a page; import stopped');
      for(const record of data.results)seen.add(record.key);
      records.push(...data.results);queries.push(url);
      if(String(data.endOfRecords)==='true'){complete=true;break;}
      if(!data.results.length)throw Error('Empty page without end-of-records confirmation');
    }catch(e){error=e.message;if(e.stop)return {records,queries,complete,error,stop:true};break;}
  }
  return {records,queries,complete,error};
}
async function main(){
  const args=process.argv.slice(2),selected=args.find(a=>a.startsWith('--states='))?.slice(9).split(',');
  const codes=selected||Object.keys(states).filter(c=>c!=='DC');
  if(codes.some(c=>!states[c]||c==='DC'))throw Error('Use two-letter US state codes');
  const folder=path.join(ROOT,'database'),cacheDir=path.join(ROOT,'.tracker-cache','database-import');
  fs.mkdirSync(folder,{recursive:true});fs.mkdirSync(cacheDir,{recursive:true});
  for(const code of Object.keys(states).filter(c=>c!=='DC'))if(!fs.existsSync(path.join(folder,`${code}.json`)))
    writeJSON(path.join(folder,`${code}.json`),documentFor(code,[],{status:'pending',complete:false,queries:[]}));
  for(const code of codes){
    const result=await importState(code,{cacheDir,refresh:args.includes('--refresh')});
    const doc=documentFor(code,result.records,{status:result.error?'partial-error':result.complete?'complete':'page-limit',complete:result.complete,queries:result.queries,error:result.error});
    // Failed refreshes never replace an existing successful database.
    const file=path.join(folder,`${code}.json`),old=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!result.complete&&old.coverage.complete)console.error(`${code}: retained previous complete import; ${result.error||'page limit reached'}`);
    else writeJSON(file,doc);
    updateIndex(folder);
    console.log(`${code}: ${doc.counts.waters} water localities, ${doc.counts.species} species, ${doc.counts.evidence} records; ${doc.coverage.status}${result.error?` (${result.error})`:''}`);
    if(result.stop){console.error('Source denied or rate-limited access. Stopped without retrying.');process.exitCode=1;break;}
  }
  const photoCatalog=path.join(folder,'species-photos.json');
  if(fs.existsSync(photoCatalog))require('./import-fish-photos.cjs').apply(JSON.parse(fs.readFileSync(photoCatalog)));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={normalize,waterKind,groupRecords,documentFor,importState};
