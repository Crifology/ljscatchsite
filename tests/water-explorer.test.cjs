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
function harness({protocol='https:',fish,waters,location}={}) {
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  get('region').value='us';
  const calls={maps:0,removed:0,fish:0,waters:0};
  const map={zoom:4,setView(c,z){this.zoom=z;return this;},getZoom(){return this.zoom;},closePopup(){this.popup=null;},removeLayer(){calls.removed++;},on(n,f){this[n]=f;return this;},hasLayer(p){return this.popup===p;},panTo(){},getBounds(){return {getWest:()=>-72,getEast:()=>-71,getSouth:()=>42,getNorth:()=>43};}};
  const layer=()=>({addTo(){return this;},on(){return this;},clearLayers(){},bindTooltip(){return this;}});
  const tiles={...layer(),on(n,f){this[n]=f;return this;}};
  const L={map(){calls.maps++;return map;},layerGroup:layer,geoJSON:layer,marker:layer,tileLayer(u,o){calls.tiles={u,o};return tiles;},popup(){return {setLatLng(){return this;},setContent(c){this.content=c;return this;},openOn(m){m.popup=this;return this;}};}};
  const context={document:{getElementById:get,createElement:()=>new Element()},window:{location:{protocol},L,WaterExplorerData:D,WaterExplorerConfig:{tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',tileAttribution:'OpenStreetMap'},TrackerNetwork:{request:()=>{}},WaterProviders:{waters:async()=>{calls.waters++;return waters?waters():{type:'FeatureCollection',features:[structuredClone(feature)],limited:false};},fish:async()=>{calls.fish++;return fish?fish():{species:P.speciesFrom([record()],feature),loaded:true,limited:false};}}}};
  if(location)context.window.WaterLocation=location;
  vm.runInNewContext(fs.readFileSync('assets/water-explorer.js','utf8'),context);
  return {get,map,calls,tiles};
}
test('map starts nationwide without API queries; file previews do not request tiles',()=>{
  const h=harness();assert.equal(h.map.zoom,4);assert.equal(h.calls.waters,0);
  assert.equal(h.calls.tiles.o.referrerPolicy,'strict-origin-when-cross-origin');
  h.tiles.tileerror();h.tiles.tileerror();assert.equal(h.calls.removed,1);
  const local=harness({protocol:'file:'});assert.equal(local.calls.maps,0);assert.match(local.get('map-status').textContent,/localhost/);
});
test('zoom gate, water selection, popup species, filter and region reset work together',async()=>{
  const h=harness();await h.get('refresh').onclick();assert.equal(h.calls.waters,0);
  h.map.zoom=10;await h.get('refresh').onclick();assert.equal(h.get('count').textContent,1);
  h.get('water-list').children[0].onclick();await new Promise(setImmediate);
  assert.equal(h.calls.fish,1);assert.ok(h.map.popup.content.children.some(n=>n.textContent==='1 fish types'));
  h.get('search').value='absent';h.get('search').events.input();assert.equal(h.get('count').textContent,0);
  h.get('region').value='alaska';h.get('region').onchange();assert.equal(h.map.zoom,4);assert.equal(h.map.popup,null);
});
test('a late response after changing regions cannot repopulate the old area',async()=>{
  let finish;const h=harness({waters:()=>new Promise(r=>finish=r)});h.map.zoom=10;
  const pending=h.get('refresh').onclick();h.get('region').value='hawaii';h.get('region').onchange();
  finish({type:'FeatureCollection',features:[feature],limited:false});await pending;
  assert.equal(h.get('count').textContent,0);assert.equal(h.get('refresh').disabled,false);
});
test('default state lookup changes overview but never overrides user navigation',async()=>{
  const location=require('../assets/water-explorer-location.js');
  const h=harness({location:{...location,detect:async()=> 'MA'}});
  await new Promise(setImmediate);assert.equal(h.get('region').value,'MA');assert.equal(h.map.zoom,7);
  let finish;
  const moved=harness({location:{...location,detect:()=>new Promise(r=>finish=r)}});
  moved.map.movestart();finish('CA');await new Promise(setImmediate);
  assert.equal(moved.get('region').value,'us');assert.equal(moved.map.zoom,4);
});
