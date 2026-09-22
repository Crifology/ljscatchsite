const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createFishService}=require('../server.cjs');
const bounds=new URLSearchParams({swlng:'-72',swlat:'42',nelng:'-71',nelat:'43'});
function service(options={}) {
  let budget={day:'2026-09-22',count:0},calls=0;
  const request=createFishService({now:()=>Date.parse('2026-09-22T12:00:00Z'),pause:async()=>{},readBudget:()=>budget,writeBudget:b=>budget=b,fetcher:async url=>{calls++;return {ok:true,json:async()=>({total_results:0,results:[]})};},...options});
  return {request,calls:()=>calls,budget:()=>budget};
}
test('server deduplicates concurrent calls, caches responses, and persists request count',async()=>{
  const s=service();await Promise.all([s.request(bounds),s.request(bounds)]);await s.request(bounds);
  assert.equal(s.calls(),1);assert.equal(s.budget().count,1);
});
test('invalid bounds and daily budget exhaustion never contact the upstream provider',async()=>{
  const s=service();assert.equal((await s.request(new URLSearchParams())).status,400);assert.equal(s.calls(),0);
  const capped=service({readBudget:()=>({day:'2026-09-22',count:9000})});
  assert.equal((await capped.request(bounds)).status,429);assert.equal(capped.calls(),0);
});
test('backend fixes US, taxonomy, license and page limits, rejecting arbitrary proxy destinations',async()=>{
  let target;
  const s=service({fetcher:async url=>{target=new URL(url);return {ok:true,json:async()=>({results:[],total_results:0})};}});
  const input=new URLSearchParams(bounds);input.set('url','https://untrusted.example');input.set('license','all');input.set('per_page','10000');input.set('place_id','2');
  await s.request(input);
  assert.equal(target.origin,'https://api.inaturalist.org');assert.equal(target.searchParams.has('url'),false);
  assert.equal(target.searchParams.get('license'),'cc0,cc-by,cc-by-sa');assert.equal(target.searchParams.get('per_page'),'200');assert.equal(target.searchParams.get('place_id'),'1');
});
test('429 Retry-After stops queued requests; failures cannot exhaust the daily budget in a retry loop',async()=>{
  let calls=0;
  const s=service({fetcher:async()=>{calls++;return {ok:false,status:429,headers:{get:()=> '120'}};}});
  const first=await s.request(bounds),other=new URLSearchParams(bounds);other.set('swlng','-73');
  const second=await s.request(other);assert.equal(first.retry,120);assert.equal(second.status,429);assert.equal(calls,1);
});
test('protected and noncommercial observations are removed before browser delivery',async()=>{
  const s=service({fetcher:async()=>({ok:true,json:async()=>({total_results:4,results:[{id:1,license_code:'cc-by',private_location:'secret'},{id:2,license_code:'cc-by',obscured:true},{id:3,license_code:'cc-by-nc'},{id:4,license_code:'cc0',description:'unused narrative',geojson:{coordinates:[-71,42]}}]})})});
  const r=await s.request(bounds);assert.deepEqual(r.data.results.map(o=>o.id),[4]);assert.equal('description' in r.data.results[0],false);
});
