const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDatabaseService}=require('../fish-database-service.cjs');
const D=require('../assets/water-explorer-data.js');
const evidence=[{recordId:1,url:'https://nas.er.usgs.gov/queries/SpecimenViewer.aspx?SpecimenID=1'}];
const species=(name)=>({commonName:name,scientificName:name,evidence});
const water=(id,name,fish)=>({id,name,kind:'Lake',state:'TN',coordinates:[-86,36],species:fish});
const service=(waters,limit=1500)=>createDatabaseService({limit,read:()=>({schemaVersion:1,coverage:{complete:true},sources:[{label:'USGS',license:'Public domain',url:'https://nas.er.usgs.gov/'}],waters})});
const query=q=>new URLSearchParams({state:'TN',bbox:'-87,35,-85,37',q});
test('bass and trout search requires fish evidence, never a matching water name alone',()=>{
  const api=service([water('a','Bass Lake',[species('Rainbow trout')]),water('b','Other Lake',[species('Largemouth bass'),species('Bluegill')])]);
  const bass=api(query('bass')).data;
  assert.deepEqual(bass.features.map(f=>f.properties.name),['Other Lake']);
  assert.equal(bass.features[0].properties.species.length,2); // Popup retains all fish.
  assert.equal(D.fishResults(bass.features,'bass').species.length,1);
  assert.equal(api(query('trout')).data.features[0].properties.name,'Bass Lake');
  assert.equal(D.fishResults(api(query('')).data.features,'bass').waters.length,1);
});
test('first 20 fish in the full viewport remain represented despite the water pin cap',()=>{
  const waters=Array.from({length:30},(_,i)=>water(String(i),'Early Lake',[species('Zebra fish')]));
  for(let i=0;i<25;i++)waters.push(water('late'+i,'Late Lake',[species('Fish '+String(i).padStart(2,'0'))]));
  const data=service(waters,25)(query('')).data;
  assert.equal(data.limited,true);assert.equal(data.matchingSpecies,26);
  assert.deepEqual(D.fishResults(data.features).species.map(s=>s.commonName),Array.from({length:20},(_,i)=>'Fish '+String(i).padStart(2,'0')));
});
