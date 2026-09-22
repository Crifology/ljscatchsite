const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createUSGSService}=require('../usgs-fish-service.cjs');
const P=require('../assets/water-explorer-providers.js');
const feature={geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]]]},properties:{}};
const record=(extra={})=>({key:1,group:'Fishes',latLongAccuracy:'Accurate',status:'established',scientificName:'Testus fish',commonName:'Test fish',decimalLongitude:.5,decimalLatitude:.5,...extra});
test('USGS only contributes established accurate populations matched to the selected water',()=>{
  assert.equal(P.usgsSpecies([record()],feature).length,1);
  for(const extra of [{status:'failed'},{status:'stocked'},{status:'collected'},{latLongAccuracy:'Centroid'},{decimalLongitude:2},{group:'Mammals'}])assert.equal(P.usgsSpecies([record(extra)],feature).length,0);
  assert.equal(P.usgsSpecies([record(),record({key:2})],feature).length,1);
});
test('service resolves actual lowercase WBD fields, caps queries, strips narratives, caches and deduplicates',async()=>{
  const urls=[];
  const service=createUSGSService({pause:async()=>{},fetcher:async url=>{
    urls.push(new URL(url));
    return {ok:true,json:async()=>url.includes('/wbd/')?{features:[1,2,3,4].map(n=>({attributes:{huc12:'01090001070'+n}}))}:{results:[record({comments:'Not republished'}),record({key:2,status:'failed'}),record({key:3,decimalLongitude:5})],endOfRecords:'false'}};
  }});
  const params=new URLSearchParams({bbox:'0,0,1,1'});
  const results=await Promise.all([service(params),service(params)]);await service(params);
  assert.equal(urls.length,4);assert.equal(results[0].data.limited,true);assert.equal(results[0].data.results.length,1);
  assert.equal('comments' in results[0].data.results[0],false);
  assert.ok(urls.slice(1).every(u=>u.searchParams.get('status')==='established'&&u.searchParams.get('limit')==='100'&&u.searchParams.has('huc12')));
});
test('USGS errors and malformed watershed codes cannot appear as successful empty results',async()=>{
  const service=createUSGSService({pause:async()=>{},fetcher:async()=>({ok:true,json:async()=>({features:[{attributes:{unknown:'wrong'}}]})})});
  assert.equal((await service(new URLSearchParams({bbox:'0,0,1,1'}))).status,503);
  assert.equal((await service(new URLSearchParams({bbox:'0,0,200,1'}))).status,400);
});
test('USGS and existing species merge by scientific name while preserving photo and both credits',async()=>{
  const observation={id:1,license_code:'cc0',quality_grade:'research',place_ids:[1],positional_accuracy:10,geojson:{coordinates:[.5,.5]},taxon:{id:2,rank:'species',ancestor_ids:[47178],name:'Testus fish',default_photo:{id:9,license_code:'cc0',url:'https://static.inaturalist.org/photos/9/square.jpg'}}};
  const result=await P.fish(feature,async()=>({results:[observation],total_results:1}),async()=>({results:[record()],limited:false}));
  assert.equal(result.species.length,1);assert.equal(result.species[0].usgs,true);assert.ok(result.species[0].photo);assert.equal(result.species[0].extraEvidence.length,1);
  const partial=await P.fish(feature,async()=>{throw Error('offline');},async()=>({results:[record()]}));
  assert.equal(partial.species.length,1);assert.deepEqual(partial.unavailable,['iNaturalist']);
  await assert.rejects(P.fish(feature,async()=>{throw Error('offline');},async()=>{throw Error('offline');}));
});
