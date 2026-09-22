const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const D = require('../assets/tracker-data.js');
const W = require('../assets/tracker-water.js');
const now = Date.parse('2026-09-21T18:00:00Z');
const observation = (extra = {}) => ({id:1, taxon:{id:123,name:'Test fish'}, license_code:'cc-by',
  geojson:{coordinates:[-80,30]}, observed_on:'2026-09-21', time_observed_at:'2026-09-21T12:00:00-04:00', ...extra});
const sighting = (extra = {}) => ({key:2, group:'Fishes', state:'Florida', latLongAccuracy:'Accurate',
  decimalLongitude:-80, decimalLatitude:30, year:2026, month:9, day:20, commonName:'Fish', scientificName:'Test fish', locality:'Test Lake', ...extra});

test('24 hours uses exact instants, inclusive boundary, and excludes future/unknown times', () => {
  const w = D.windowFor('1', now);
  assert.ok(D.inWindow(observation({time_observed_at:'2026-09-20T14:00:00-04:00'}), w));
  assert.ok(!D.inWindow(observation({time_observed_at:'2026-09-20T13:59:59-04:00'}), w));
  assert.ok(!D.inWindow(observation({time_observed_at:'2026-09-21T18:00:01Z'}), w));
  for (const time of [null, 'invalid', '2026-09-21', '2026-09-21T12:00:00']) assert.ok(!D.inWindow(observation({time_observed_at:time}), w));
});
test('week/month date-only boundaries are explicit, with invalid dates rejected', () => {
  assert.ok(D.inWindow({observed_on:'2026-09-15'}, D.windowFor('7', now)));
  assert.ok(!D.inWindow({observed_on:'2026-09-14'}, D.windowFor('7', now)));
  assert.ok(D.inWindow({observed_on:'2026-08-23'}, D.windowFor('30', now)));
  assert.ok(!D.inWindow({observed_on:'2026-08-22'}, D.windowFor('30', now)));
  assert.ok(!D.inWindow({observed_on:'2026-09-22'}, D.windowFor('30', now)));
  assert.ok(!D.inWindow({observed_on:'2026-02-30'}, D.windowFor('30', Date.parse('2026-03-05'))));
  assert.throws(() => D.windowFor('365', now));
});
test('iNaturalist rejects protected/unlicensed locations and malformed coordinates', () => {
  assert.ok(D.inaturalist(observation()));
  for (const extra of [{license_code:'cc-by-nc'}, {license_code:null}, {obscured:true}, {geoprivacy:'private'},
    {taxon_geoprivacy:'obscured'}, {geojson:{coordinates:[null,30]}}, {geojson:{coordinates:[181,30]}}]) {
    assert.equal(D.inaturalist(observation(extra)), null);
  }
});
test('USGS reports preserve water and provenance without claiming a catch or exact time', () => {
  const o = D.usgs(sighting());
  assert.equal(o.reportedWater, 'Test Lake'); assert.match(o.kind,/not confirmed/);
  assert.equal(o.time_observed_at,null); assert.equal(o.source,'USGS NAS');
  assert.match(o.sourceUrl,/SpecimenID=2$/);
  for (const extra of [{state:'Canada'},{latLongAccuracy:'Centroid'},{day:null},{day:32},{group:'Mammals'}]) assert.equal(D.usgs(sighting(extra)),null);
});
test('select removes repeat source records, retains separate provenance, sorts newest first', () => {
  const a=D.inaturalist(observation()), b=D.usgs(sighting());
  assert.deepEqual(D.select([b,a,a],D.windowFor('30',now)).map(o=>o.sourceKey),['inat-1','nas-2']);
});
test('USGS makes no requests in 24-hour view', async () => {
  const r=await D.fetchUSGS(D.windowFor('1',now),()=>{throw Error('Must not call');});
  assert.equal(r.reports.length,0);assert.match(r.skipped,/Date-only/);
});
test('USGS queries both sides of a year boundary and labels truncation', async () => {
  const urls=[];
  const response=await D.fetchUSGS(D.windowFor('30',Date.parse('2026-01-05T18:00:00Z')),async url=>{
    urls.push(new URL(url));return {results:Array.from({length:200},()=>sighting()),endOfRecords:'false'};
  });
  assert.equal(urls.length,4);assert.equal(response.limited,true);
  assert.deepEqual(urls.map(u=>[u.searchParams.get('year'),u.searchParams.get('month'),u.searchParams.get('offset')]),
    [['2025','12','0'],['2025','12','200'],['2026','1','0'],['2026','1','200']]);
});
test('iNaturalist queries actual dates, US geography, open data licenses and flags result caps', async () => {
  let url;
  const r=await D.fetchInaturalist(D.windowFor('7',now),async value=>{url=new URL(value);return {results:[observation()],total_results:201};});
  assert.equal(url.searchParams.get('place_id'),'1');assert.equal(url.searchParams.get('license'),'cc0,cc-by,cc-by-sa');
  assert.ok(url.searchParams.has('d1'));assert.equal(r.limited,true);
});
test('Boston requires a Massachusetts record within 50 km; nationwide stays available', () => {
  const local=D.inaturalist(observation({place_ids:[1,2],geojson:{coordinates:[-71.0589,42.3601]}}));
  assert.ok(D.inRegion(local,'boston'));
  assert.ok(!D.inRegion({...local,place_ids:[1]},'boston'));
  assert.ok(!D.inRegion({...local,geojson:{coordinates:[-73.25,42.45]}},'boston'));
  assert.ok(D.inRegion({...local,geojson:{coordinates:[-73.25,42.45]}},'massachusetts'));
  assert.ok(D.inRegion(D.usgs(sighting({state:'Massachusetts',decimalLongitude:-71.06,decimalLatitude:42.36})),'boston'));
});
test('Boston query limits the upstream request and archive does not manufacture recent dates', async () => {
  let url;
  const old=observation({place_ids:[1,2],geojson:{coordinates:[-71.0589,42.3601]},observed_on:'2017-07-21',time_observed_at:null});
  const r=await D.fetchInaturalist(D.windowFor('all',now),async u=>{url=new URL(u);return {results:[old],total_results:1};},'boston');
  assert.equal(url.searchParams.get('place_id'),'2');assert.equal(url.searchParams.get('radius'),'50');
  assert.equal(url.searchParams.has('d1'),false);
  assert.equal(D.select(r.reports,D.windowFor('all',now)).length,1);
  assert.equal(D.select(r.reports,D.windowFor('30',now)).length,0);
});
test('nearest-water distance uses boundaries, containment and polygon holes, not centroids', () => {
  const square={rings:[[[-.01,-.01],[.01,-.01],[.01,.01],[-.01,.01],[-.01,-.01]]]};
  assert.equal(W.distance([0,0],square),0);
  const hole={rings:[...square.rings,[[-.001,-.001],[-.001,.001],[.001,.001],[.001,-.001],[-.001,-.001]]]};
  assert.ok(W.distance([0,0],hole)>100);
  const result=W.nearest([0,0],[{attributes:{NAME:'Far river'},geometry:{paths:[[[.005,-.01],[.005,.01]]]}},{attributes:{NAME:'Near pond'},geometry:square}]);
  assert.equal(result.name,'Near pond');assert.equal(result.meters,0);
  assert.equal(W.nearest([0,0],[{attributes:{NAME:'Far'},geometry:{paths:[[[1,1],[2,2]]]}}]),null);
});
test('water lookup is bounded and fails honestly on incomplete service results', async () => {
  const urls=[];
  assert.equal(await W.lookup([-71.06,42.36],async u=>{urls.push(new URL(u));return {features:[]};}),null);
  assert.equal(urls.length,2);assert.ok(urls.every(u=>u.searchParams.get('distance')==='1000' && u.searchParams.get('resultRecordCount')==='100'));
  await assert.rejects(W.lookup([-71.06,42.36],async()=>({features:[],exceededTransferLimit:true})),/Too many/);
});
test('network caches and deduplicates identical in-flight requests', async () => {
  let calls=0;
  const context={window:{},URL,Date,Promise,Map,setTimeout,clearTimeout,AbortSignal,fetch:async()=>{calls++;return {ok:true,json:async()=>({results:[]})}}};
  vm.runInNewContext(fs.readFileSync('assets/tracker-network.js','utf8'),context);
  const request=context.window.TrackerNetwork.request;
  await Promise.all([request('https://api.inaturalist.org/v1/taxa'),request('https://api.inaturalist.org/v1/taxa')]);
  await request('https://api.inaturalist.org/v1/taxa');assert.equal(calls,1);
  await assert.rejects(request('https://unapproved.example/api'));
});
test('429 stops subsequent requests rather than retrying the provider', async () => {
  let calls=0;
  const context={window:{},URL,Date,Promise,Map,setTimeout,clearTimeout,AbortSignal,fetch:async()=>{
    calls++;return {ok:false,status:429,headers:{get:()=> '120'}};
  }};
  vm.runInNewContext(fs.readFileSync('assets/tracker-network.js','utf8'),context);
  const request=context.window.TrackerNetwork.request;
  await assert.rejects(request('https://api.inaturalist.org/v1/taxa'),/429/);
  await assert.rejects(request('https://api.inaturalist.org/v1/observations'),/cooling down/);
  assert.equal(calls,1);
});

class Element {
  constructor(){this.children=[];this.value='';this.checked=false;this.textContent='';this.events={};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;this.textContent='';}
  addEventListener(name,fn){this.events[name]=fn;}
  showModal(){this.open=true;}
  close(){this.open=false;this.events.close?.();}
}
function mapHarness(protocol) {
  const elements=new Map(), get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  get('period').value='30';
  const calls={maps:0,removed:0};
  const map={setView(){return this;},removeLayer(){calls.removed++;}};
  const tiles={on(name,fn){this[name]=fn;return this;},addTo(){return this;}};
  const L={map(){calls.maps++;return map;},tileLayer(url,options){calls.url=url;calls.options=options;return tiles;},layerGroup(){return {addTo(){return this;},clearLayers(){}};}};
  const context={document:{getElementById:get,createElement:()=>new Element()},window:{location:{protocol},L,TrackerData:D,TrackerNetwork:{request:async()=>({results:[],total_results:0})}},L,URL,URLSearchParams,Date,console};
  vm.runInNewContext(fs.readFileSync('assets/tracker.js','utf8'),context);
  return {get,calls,tiles};
}
test('file preview does not request OSM tiles and provides a localhost remedy', async () => {
  const {get,calls}=mapHarness('file:');
  await new Promise(setImmediate);
  assert.equal(calls.maps,0);
  assert.match(get('map-status').textContent,/localhost/);
  assert.equal(get('reset-map').disabled,true);
});
test('web preview uses real origin referrer policy and pauses tiles after errors', async () => {
  const {get,calls,tiles}=mapHarness('http:');
  assert.equal(calls.maps,1);
  assert.equal(calls.options.referrerPolicy,'strict-origin-when-cross-origin');
  assert.equal(calls.url,'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.match(calls.options.attribution,/OpenStreetMap/);
  tiles.tileerror();tiles.tileerror();
  await new Promise(setImmediate);
  assert.equal(calls.removed,1);
  assert.match(get('map-status').textContent,/requests have been paused/);
  assert.match(get('status').textContent,/0 reports/);
});
test('partial outage retains other-source reports; switching period clears old results', async () => {
  const elements=new Map(), get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  get('period').value='30';get('include-sightings').checked=true;
  const fixedData={...D,windowFor:p=>D.windowFor(p,now)};
  const context={document:{getElementById:get,createElement:()=>new Element()},window:{TrackerData:fixedData,TrackerNetwork:{request:async url=>{
    if(url.includes('api.inaturalist'))throw Error('offline');
    return {results:[sighting()],endOfRecords:'true'};
  }}},URL,URLSearchParams,Date,console};
  vm.runInNewContext(fs.readFileSync('assets/tracker.js','utf8'),context);
  await new Promise(setImmediate);
  assert.equal(get('report-list').children.length,1);assert.match(get('status').textContent,/1 source\(s\) unavailable/);
  get('report-list').children[0].onclick();assert.equal(get('fish-dialog').open,true);
  assert.match(get('observation-link').href,/nas.er.usgs.gov/);
  get('close-dialog').onclick();assert.equal(get('fish-dialog').open,false);
  get('period').value='1';await get('period').onchange();
  assert.equal(get('report-list').children.length,0);assert.match(get('source-status').children[1].textContent,/excluded/);
});
