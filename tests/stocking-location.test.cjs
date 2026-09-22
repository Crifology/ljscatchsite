const {test}=require('node:test');
const assert=require('node:assert/strict');
const L=require('../assets/water-explorer-location.js');
const S=require('../assets/water-explorer-stocking.js');
const P=require('../assets/water-explorer-providers.js');
const {normalizeStocking,createStockingService}=require('../stocking-service.cjs');
const event=(extra={})=>({id:'one',country:'US',state:'MA',coordinates:[.5,.5],commonName:'Rainbow trout',scientificName:'Oncorhynchus mykiss',status:'completed',source:{label:'Agency',url:'https://example.org/stocking',license:'CC BY 4.0'},...extra});
const water=(id='one',geometry={type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]]]})=>({type:'Feature',geometry,properties:{id,name:'Lake',species:[]}});
test('IP detection returns only a recognized US state and requests no IP/city/coordinates',async()=>{
  assert.equal(Object.keys(L.states).length,51);
  let target,opts;
  const state=await L.detect(async(url,options)=>{target=new URL(url);opts=options;return {ok:true,json:async()=>({success:true,country_code:'US',region_code:'MA'})};});
  assert.equal(state,'MA');assert.equal(target.searchParams.get('fields'),'success,country_code,region_code');assert.equal(opts.credentials,'omit');
  for(const data of [{success:false},{success:true,country_code:'CA',region_code:'ON'},{success:true,country_code:'US',region_code:'XX'}])assert.equal(L.stateFrom(data),null);
});
test('IP quota, timeout and provider failure fall back without retry',async()=>{
  let calls=0;
  assert.equal(await L.detect(async()=>{calls++;return {ok:false,status:429};}),null);assert.equal(calls,1);
  assert.equal(await L.detect(async()=>{throw Error('timeout');}),null);
});
test('stocking importer rejects aggregate-only data, planned events, missing coordinates and unlicensed data',()=>{
  assert.throws(()=>normalizeStocking({states:[{state:'MA',annual_count:10000}]}),/statewide totals/);
  const result=normalizeStocking({schemaVersion:1,events:[event(),event({id:'two',status:'planned'}),event({id:'three',coordinates:null}),event({id:'four',source:{label:'Agency',url:'https://example.org',license:'unknown'}})]});
  assert.equal(result.events.length,1);assert.equal(result.rejected,3);
});
test('the supplied FishFig file yields 50 state summaries and no fabricated stocking locations',()=>{
  const fs=require('node:fs');
  const raw=fs.readFileSync('stocking-2026.json','utf8');
  const data=normalizeStocking(JSON.parse(raw));
  assert.equal(data.summaries.length,50);assert.equal(data.events.length,0);assert.equal(data.aggregateOnly,true);
  assert.equal(data.summaries.filter(r=>r.annualCount!==null).length,3);
  const service=createStockingService({read:()=>raw,readSummary:()=>raw});
  const ma=service(new URLSearchParams({state:'MA'}));assert.equal(ma.status,200);assert.equal(ma.data.summary.annualCount,null);
  const ca=service(new URLSearchParams({state:'CA'}));assert.equal(ca.data.summary.annualCount,800000);assert.equal(ca.data.summary.year,2025);
  const pins=service(new URLSearchParams({bbox:'-125,24,-66,50'}));assert.deepEqual(pins.data.events,[]);assert.equal(pins.data.unlocated,50);
});
test('stocking endpoint filters to viewport, caps event work, and distinguishes missing data',()=>{
  const service=createStockingService({read:()=>JSON.stringify({schemaVersion:1,events:Array.from({length:12},(_,i)=>event({id:String(i)})).concat(event({id:'outside',coordinates:[10,10]}))})});
  const result=service(new URLSearchParams({bbox:'0,0,1,1'}));
  assert.equal(result.status,200);assert.equal(result.data.events.length,10);assert.equal(result.data.limited,true);
  assert.equal(service(new URLSearchParams()).status,400);
  const missing=createStockingService({read:()=>{throw Object.assign(Error('missing'),{code:'ENOENT'});}});
  assert.equal(missing(new URLSearchParams({bbox:'0,0,1,1'})).status,503);
});
test('closest water uses geometry, excludes holes, and refuses ties or incomplete candidates',()=>{
  const f=water(),response={features:[f],limited:false};
  assert.equal(S.nearest([.5,.5],response,P).meters,0);
  assert.equal(S.nearest([5,5],response,P),null);
  assert.equal(S.nearest([.5,.5],{...response,limited:true},P),null);
  assert.equal(S.nearest([.5,.5],{...response,features:[f,water('two')]},P),null);
  const holes={type:'Polygon',coordinates:[...f.geometry.coordinates,[[.4,.4],[.6,.4],[.6,.6],[.4,.6],[.4,.4]]]};
  assert.ok(S.distance([.5,.5],holes,P)>1000);
});
test('stocking species attach to a water pin, merge with existing species, and preserve credits',async()=>{
  const f=water();let queries=0;
  const result=await S.attach([f],[event()],async()=>{queries++;return {features:[water()],limited:false};},P);
  assert.equal(queries,1);assert.equal(result.matched,1);assert.equal(result.features.length,1);assert.equal(f.properties.species[0].stocked,true);
  S.merge(f,f.properties.stockingSpecies[0]);assert.equal(f.properties.species.length,1);
  assert.equal(f.properties.species[0].extraEvidence,undefined);
  const cancelled=await S.attach([], [event()],async()=>{throw Error('must not query');},P,()=>false);
  assert.equal(cancelled.matched,0);
});
