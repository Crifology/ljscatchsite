const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalize,groupRecords,documentFor,importState}=require('../scripts/import-fish-database.cjs');
const {createDatabaseService}=require('../fish-database-service.cjs');
const observation=(extra={})=>({key:1,state:'Massachusetts',group:'Fishes',status:'established',latLongAccuracy:'Accurate',
  locality:'Test Lake',county:'Example',decimalLongitude:-71,decimalLatitude:42,commonName:'Rainbow trout',scientificName:'Oncorhynchus mykiss',
  year:2001,date:'2001',recordType:'Literature',...extra});
const doc=records=>documentFor('MA',records,{status:'complete',complete:true,queries:[]});
test('import accepts only named waters with eligible public state/species/location evidence',()=>{
  assert.ok(normalize(observation(),'MA'));
  for(const bad of [{state:'California'},{status:'failed'},{status:'stocked'},{latLongAccuracy:'Centroid'},
    {locality:'Somewhere in Boston'},{locality:'Unnamed Lake'},{decimalLongitude:null},{scientificName:''}])
    assert.equal(normalize(observation(bad),'MA'),null);
});
test('water grouping deduplicates source IDs and keeps nearby species, dates and distinct sites',()=>{
  const records=[observation(),observation(),observation({key:2,scientificName:'Perca flavescens',commonName:'Yellow perch'}),
    observation({key:3,decimalLongitude:-72}),observation({key:4,county:'Other'})];
  const result=groupRecords(records,'MA');assert.equal(result.waters.length,3);assert.equal(result.accepted,4);
  const combined=result.waters.find(w=>w.species.length===2);
  assert.equal(combined.species[0].evidence[0].reportedDate,'2001');
  assert.match(combined.species[0].evidence[0].url,/SpecimenID=1$/);
});
test('import follows pagination and marks only an explicit end as complete',async()=>{
  const urls=[];
  const r=await importState('MA',{pause:async()=>{},fetcher:async url=>{
    const offset=Number(new URL(url).searchParams.get('offset'));urls.push(offset);
    return {ok:true,json:async()=>({offset,results:[observation({key:offset+1})],endOfRecords:offset===1?'true':'false'})};
  }});
  assert.deepEqual(urls,[0,1]);assert.equal(r.records.length,2);assert.equal(r.complete,true);
  const stopped=await importState('MA',{pause:async()=>{},fetcher:async()=>({ok:false,status:429,headers:{get:()=> '120'}})});
  assert.equal(stopped.stop,true);assert.equal(stopped.complete,false);assert.match(stopped.error,/120/);
});
test('repeated pages and page limits cannot masquerade as a complete import',async()=>{
  const fetcher=async url=>({ok:true,json:async()=>({offset:Number(new URL(url).searchParams.get('offset')),results:[observation()],endOfRecords:false})});
  const repeat=await importState('MA',{fetcher,pause:async()=>{}});
  assert.match(repeat.error,/repeated/);assert.equal(repeat.complete,false);
  const capped=await importState('MA',{fetcher,pause:async()=>{},maxPages:1});assert.equal(capped.complete,false);
});
test('local API filters state, viewport, fish and water type before applying the pin cap',()=>{
  const records=[observation(),observation({key:2,locality:'Other Pond',scientificName:'Perca flavescens',commonName:'Yellow perch'}),
    observation({key:3,decimalLongitude:-100})];
  let reads=0;
  const service=createDatabaseService({read:()=>{reads++;return doc(records);},limit:1});
  const params=new URLSearchParams({state:'MA',bbox:'-73,41,-70,43'});
  const result=service(params);assert.equal(result.data.features.length,1);assert.equal(result.data.matchingWaters,2);assert.equal(result.data.limited,true);
  params.set('q','Rainbow trout');const filtered=service(params);
  assert.equal(filtered.data.features[0].properties.species[0].commonName,'Rainbow trout');assert.equal(filtered.data.limited,false);assert.equal(reads,1);
  params.set('kind','River');assert.equal(service(params).data.features.length,0);
  assert.equal(service(new URLSearchParams({state:'../../secret',bbox:'-73,41,-70,43'})).status,400);
});
test('local API distinguishes missing and partial state files from complete empty data',()=>{
  const params=new URLSearchParams({state:'MA',bbox:'-73,41,-70,43'});
  assert.deepEqual(createDatabaseService({read:()=>{throw Error('missing');}})(params).data.unavailable,['MA']);
  const partial=doc([]);partial.coverage.complete=false;
  assert.deepEqual(createDatabaseService({read:()=>partial})(params).data.partial,['MA']);
});
test('national searches retain offshore sites even when the viewport misses state land',()=>{
  const marine=doc([observation({locality:'Atlantic Ocean',decimalLongitude:-60,decimalLatitude:38})]);
  const empty=doc([]);
  const service=createDatabaseService({read:code=>code==='MA'?marine:empty});
  const result=service(new URLSearchParams({state:'us',bbox:'-61,37,-59,39'}));
  assert.equal(result.data.features.length,1);assert.equal(result.data.features[0].properties.kind,'Coastal');
});
