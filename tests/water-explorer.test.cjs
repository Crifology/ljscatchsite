const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const P=require('../assets/water-explorer-providers.js');
const D=require('../assets/water-explorer-data.js');
const polygon={type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]],[[.4,.4],[.6,.4],[.6,.6],[.4,.6],[.4,.4]]]};
const record=(extra={})=>({id:1,license_code:'cc-by',quality_grade:'research',place_ids:[1],positional_accuracy:10,geojson:{coordinates:[.2,.2]},observed_on:'2020-06-01',taxon:{id:2,rank:'species',ancestor_ids:[47178],name:'Testus fish',preferred_common_name:'Test fish'},user:{login:'tester'},...extra});
const feature={type:'Feature',geometry:polygon,properties:{id:'one',name:'Test lake',country:'US',kind:'Lake',pin:[0,0],species:[],source:{label:'USGS',license:'Public domain',url:'https://www.usgs.gov'}}};
test('polygon matching excludes holes and nearby land, and supports multiple polygons',()=>{
  assert.equal(P.contains([.2,.2],polygon),true);
  assert.equal(P.contains([.5,.5],polygon),false);
  assert.equal(P.contains([1.1,.2],polygon),false);
  assert.equal(P.contains([.2,.2],{type:'MultiPolygon',coordinates:[polygon.coordinates]}),true);
});
test('river matching uses ground distance from a segment, not the bounding box',()=>{
  const g={type:'LineString',coordinates:[[0,0],[1,0]]};
  assert.ok(P.lineDistance([.5,.0001],g)<30);
  assert.ok(P.lineDistance([.5,.001],g)>30);
  assert.ok(P.lineDistance([2,0],g)>100000);
});
test('only openly licensed, public US research-grade fish locations with known accuracy qualify',()=>{
  assert.equal(P.speciesFrom([record()],feature).length,1);
  for(const extra of [{license_code:'cc-by-nc'},{quality_grade:'casual'},{captive:true},{obscured:true},{geoprivacy:'private'},{taxon_geoprivacy:'obscured'},{place_ids:[]},{positional_accuracy:null},{positional_accuracy:101},{geojson:{coordinates:[.5,.5]}},{taxon:{id:2,rank:'species',ancestor_ids:[3]}}]) {
    assert.equal(P.speciesFrom([record(extra)],feature).length,0,JSON.stringify(extra));
  }
});
test('species deduplication preserves evidence and independently checks photo licensing',()=>{
  const photo={id:9,url:'https://static.inaturalist.org/photos/9/square.jpg',license_code:'cc-by',attribution:'Photographer'};
  const records=[record({photos:[{...photo,license_code:'cc-by-nc'}]}),record({id:2,taxon:{...record().taxon,default_photo:photo}})];
  const list=P.speciesFrom(records,feature);
  assert.equal(list.length,1);assert.match(list[0].evidence.url,/observations\/1$/);
  assert.equal(list[0].photo.url,'https://static.inaturalist.org/photos/9/medium.jpg');
  assert.equal(list[0].photo.label,'Photographer');
  assert.equal('date' in list[0],false);
  assert.equal(list[0].evidence.label,'tester');
  assert.equal(P.speciesFrom([record({photos:[photo]})],feature)[0].photo,null,'Catch photos must not substitute for a generic species image');
  assert.equal(P.speciesFrom([record({photos:[{...photo,url:'https://untrusted.example/fish.jpg'}]})],feature)[0].photo,null);
});
test('USGS queries are bounded and partial failures preserve successful layers',async()=>{
  const urls=[];
  const result=await P.waters('-72,42,-71,43',async url=>{
    const u=new URL(url);urls.push(u);
    if(u.pathname.includes('/9/')) throw Error('offline');
    return {features:[{type:'Feature',geometry:polygon,properties:{OBJECTID:1,GNIS_NAME:'Lake',FTYPE:390}}]};
  });
  assert.equal(result.features.length,2);assert.equal(result.partial,true);assert.equal(result.limited,true);
  assert.ok(urls.every(u=>u.searchParams.get('resultRecordCount')==='60' && u.searchParams.get('inSR')==='4326'));
  assert.equal(D.normalize(result).features.length,2);
  await assert.rejects(P.waters('-72,42,-71,43',async()=>{throw Error('offline');}),/unavailable/);
});
test('fish lookup uses actual geometry matching and reports a capped candidate page',async()=>{
  let query;
  const result=await P.fish(feature,async url=>{query=new URL(url);return {results:[record(),record({id:3,geojson:{coordinates:[.5,.5]}})],total_results:201};});
  assert.equal(result.species.length,1);assert.equal(result.limited,true);
  assert.equal(query.searchParams.get('per_page'),'200');assert.equal(query.searchParams.get('place_id'),'1');
  assert.equal(query.searchParams.has('project_id'),false);
});
test('catalogue rejects malformed geometry, duplicate IDs and unsafe source links',()=>{
  const data={type:'FeatureCollection',features:[feature],limited:false};
  assert.equal(D.normalize(data).features.length,1);
  assert.throws(()=>D.normalize({...data,features:[feature,feature]}));
  assert.throws(()=>D.normalize({...data,features:[{...feature,geometry:{type:'Polygon',coordinates:[]}}]}));
  assert.throws(()=>D.normalize({...data,features:[{...feature,properties:{...feature.properties,source:{...feature.properties.source,url:'javascript:alert(1)'}}}]}));
  assert.throws(()=>D.boundsQuery([170,0,-170,5]));
  assert.equal(D.filter([feature],'test','Lake').length,1);
  assert.equal(D.filter([feature],'test','River').length,0);
});
class Element {
  constructor(){this.children=[];this.value='';this.textContent='';this.events={};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  addEventListener(name,fn){this.events[name]=fn;}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
function harness({protocol='https:',fish,waters,location,fetcher}={}) {
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  get('region').value='us';
  const calls={maps:0,removed:0,fish:0,waters:0,database:0,urls:[]};
  const map={zoom:undefined,ready:false,invalidateSize(){calls.resized=true;},fitBounds(bounds,options){this.ready=true;this.fitted=bounds;calls.fitOptions=options;this.zoom=7;return this;},setView(c,z){this.ready=true;this.zoom=z;return this;},getZoom(){return this.zoom;},closePopup(){this.popup=null;},removeLayer(){calls.removed++;},on(n,f){this[n]=f;return this;},hasLayer(p){return this.popup===p;},panTo(){},getBounds(){if(!this.ready)throw Error('Set map center and zoom first');return {getWest:()=>-1,getEast:()=>1,getSouth:()=>-1,getNorth:()=>1};}};
  const layer=()=>({addTo(){return this;},on(){return this;},clearLayers(){},bindTooltip(){return this;}});
  const tiles={...layer(),on(n,f){this[n]=f;return this;}};
  const L={map(){calls.maps++;return map;},layerGroup:layer,geoJSON:layer,marker:()=>({...layer(),on(event,fn){calls.pinClick=fn;return this;}}),tileLayer(u,o){calls.tiles={u,o};return tiles;},popup(){return {setLatLng(){return this;},setContent(c){this.content=c;return this;},openOn(m){m.popup=this;return this;}};}};
  let scheduled;
  const context={URLSearchParams,AbortSignal,setTimeout:fn=>{scheduled=fn;return 1;},clearTimeout:()=>{scheduled=null;},document:{getElementById:get,createElement:()=>new Element()},window:{location:{protocol},L,WaterExplorerData:D,WaterExplorerConfig:{tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',tileAttribution:'OpenStreetMap'},TrackerNetwork:{request:()=>{}},WaterProviders:{contains:P.contains,areaFish:async features=>features.map(()=>({species:P.speciesFrom([record()],feature),loaded:true,limited:false})),waters:async bbox=>{calls.bbox=bbox;calls.waters++;return waters?waters():{type:'FeatureCollection',features:[structuredClone(feature)],limited:false};},fish:async()=>{calls.fish++;return fish?fish():{species:P.speciesFrom([record()],feature),loaded:true,limited:false};}}}};
  if(location)context.window.WaterLocation=location;
  context.fetch=async url=>{
    calls.database++;calls.urls.push(url);calls.bbox=new URL(url,'https://local').searchParams.get('bbox');
    if(fetcher)return fetcher(url);
    const saved=structuredClone(feature);
    Object.assign(saved.properties,{loaded:true,database:true,species:P.speciesFrom([record()],feature)});
    return {ok:true,json:async()=>({features:[saved],limited:false})};
  };
  vm.runInNewContext(fs.readFileSync('assets/water-explorer.js','utf8'),context);
  return {get,map,calls,tiles,flush:()=>{const fn=scheduled;scheduled=null;return fn?.();}};
}
test('map starts nationwide without API queries; file previews do not request tiles',()=>{
  const h=harness();assert.equal(h.map.zoom,4);assert.equal(h.calls.waters,0);
  assert.equal(h.calls.tiles.o.referrerPolicy,'strict-origin-when-cross-origin');
  h.tiles.tileerror();h.tiles.tileerror();assert.equal(h.calls.removed,1);
  const local=harness({protocol:'file:'});assert.equal(local.calls.maps,0);assert.match(local.get('map-status').textContent,/localhost/);
});
test('nationwide search loads fish before water selection and filters species',async()=>{
  const h=harness();await h.get('refresh').onclick();assert.equal(h.calls.database,1);
  h.map.zoom=10;await h.get('refresh').onclick();assert.equal(h.get('count').textContent,1);
  h.calls.pinClick();await new Promise(setImmediate);
  assert.ok(h.map.popup.content.children.some(n=>n.textContent==='1 fish types'));
  h.get('water-list').children[0].onclick();await new Promise(setImmediate);
  assert.equal(h.calls.fish,0);assert.equal(h.get('search').value,P.speciesFrom([record()],feature)[0].scientificName);
  h.get('search').value='absent';h.get('search').events.input();assert.equal(h.get('count').textContent,0);
  h.get('region').value='alaska';h.get('region').onchange();assert.equal(h.map.zoom,4);assert.equal(h.map.popup,null);
});
test('a late response after changing regions cannot repopulate the old area',async()=>{
  let finish;const h=harness({fetcher:()=>new Promise(r=>finish=r)});h.map.zoom=10;
  const pending=h.get('refresh').onclick();h.get('region').value='hawaii';h.get('region').onchange();
  finish({ok:true,json:async()=>({features:[feature],limited:false})});await pending;
  assert.equal(h.get('count').textContent,0);assert.equal(h.get('refresh').disabled,false);
});
test('fish sidebar deduplicates species, caps at 20, and restricts results to viewport',()=>{
  const waters=Array.from({length:25},(_,i)=>({...feature,properties:{...feature.properties,id:String(i),pin:[i,42],species:[{commonName:`Fish ${String(i).padStart(2,'0')}`,scientificName:`Species ${i}`}]}}));
  const result=D.fishResults(waters);
  assert.equal(result.total,25);assert.equal(result.species.length,20);assert.equal(result.waters.length,25);
  assert.equal(D.fishResults(waters,'','',[0,41,2,43]).species.length,3);
  assert.equal(D.fishResults(waters,'Species 24').waters.length,1);
  assert.equal(D.fishResults(waters,'','River').total,0);
  const duplicate={...waters[0],properties:{...waters[0].properties,id:'other'}};
  assert.equal(D.fishResults([waters[0],duplicate]).species[0].waters.length,2);
});

test('area fish shares two source requests across waters and preserves geometry matches',async()=>{
  let observations=0,nas=0;
  const result=await P.areaFish([feature,feature],'0,0,1,1',async()=>{observations++;return {results:[record()],total_results:1};},async()=>{nas++;return {results:[]};});
  assert.equal(observations,1);assert.equal(nas,1);
  assert.equal(result[0].species.length,1);assert.equal(result[1].species.length,1);
});


test('state selection fits bounds and clamps database queries without detecting location',async()=>{
  const location=require('../assets/water-explorer-location.js');
  const h=harness({location:{...location,detect:()=>{throw Error('Must not locate');}}});
  h.get('region').value='MA';h.get('region').onchange();
  assert.equal(h.calls.fitOptions.animate,false);
  h.map.getBounds=()=>({getWest:()=>-80,getEast:()=>-60,getSouth:()=>35,getNorth:()=>50});
  await h.flush();
  assert.equal(h.calls.bbox,D.boundsQuery(location.states.MA.bounds));
  assert.equal(h.calls.database,1);assert.equal(h.calls.waters,0);
});

test('pan and zoom reload the visible bounds and filter fish locations',async()=>{
  const h=harness();await h.flush();assert.equal(h.get('count').textContent,1);
  h.map.zoom=12;
  h.map.getBounds=()=>({getWest:()=>10,getEast:()=>11,getSouth:()=>10,getNorth:()=>11});
  h.map.moveend();await h.flush();
  assert.equal(h.calls.bbox,'10.0000,10.0000,11.0000,11.0000');
  assert.equal(h.get('count').textContent,0);assert.equal(h.calls.database,2);
});

for(const mode of ['partial','missing','empty','failure','invalid'])test(`database ${mode} never falls back to live services`,async()=>{
  const h=harness({fetcher:async()=>{
    if(mode==='failure')throw Error('offline');
    return {ok:true,json:async()=>mode==='invalid'?{}:{features:[],partial:mode==='partial'?['MA']:[],unavailable:mode==='missing'?['MA']:[]}};
  }});
  await h.get('refresh').onclick();
  assert.equal(h.calls.waters,0);assert.equal(h.calls.fish,0);
  assert.equal(h.calls.urls.length,1);assert.match(h.calls.urls[0],/^\/api\/fish-database\?/);
  assert.equal(h.get('count').textContent,0);
  if(['failure','invalid'].includes(mode))assert.match(h.get('status').textContent,/database unavailable/);
  if(['partial','missing'].includes(mode))assert.match(h.get('status').textContent,/incomplete or unavailable/);
});

test('complete saved database serves fish without waiting for live sources',async()=>{
  const saved=structuredClone(feature);
  saved.geometry={type:'Point',coordinates:[0,0]};
  Object.assign(saved.properties,{loaded:true,database:true,species:P.speciesFrom([record()],feature)});
  let query;
  const h=harness({waters:async()=>{throw Error('offline');},fetcher:async url=>{
    query=url;return {ok:true,json:async()=>({features:[saved],limited:false,unavailable:[],partial:[]})};
  }});
  await h.get('refresh').onclick();
  assert.match(query,/api\/fish-database/);assert.equal(h.get('count').textContent,1);
  assert.match(h.get('status').textContent,/1 saved water locations/);assert.equal(h.calls.waters,0);
  h.calls.pinClick();assert.ok(h.map.popup.content.children.some(n=>n.textContent==='1 fish types'));
});
