const {test}=require('node:test');
const assert=require('node:assert/strict');
const {handler}=require('../netlify/functions/api.js');
function invoke(path,query={},httpMethod='GET') {
  return handler({httpMethod,path,headers:{host:'localhost'},queryStringParameters:query,requestContext:{},body:null,isBase64Encoded:false},{});
}
test('Netlify function searches packaged state, fish and locations on both URL forms',async()=>{
  for(const path of ['/api/fish-database','/.netlify/functions/api/fish-database']){
    const result=await invoke(path,{state:'MA',bbox:'-73.6,41,-69,43',q:'trout'});
    assert.equal(result.statusCode,200);
    const data=JSON.parse(result.body);
    assert.deepEqual(data.unavailable,[]);
    assert.ok(data.features.length>0);
    assert.ok(data.features.every(f=>f.properties.state==='MA'&&f.properties.species.some(s=>/trout/i.test(s.commonName+' '+s.scientificName))));
    assert.match(result.headers['cache-control'],/max-age=300/);
  }
});
test('Netlify function validates requests and does not expose server files',async()=>{
  assert.equal((await invoke('/api/fish-database',{state:'MA'})).statusCode,400);
  assert.equal((await invoke('/api/fish-database',{},'POST')).statusCode,405);
  assert.equal((await invoke('/api/fish-database',{},'HEAD')).statusCode,405);
  assert.equal((await invoke('/.netlify/functions/api/server.cjs')).statusCode,404);
  assert.equal((await invoke('/.netlify/functions/api/database/MA.json')).statusCode,404);
});
test('Netlify function reads saved stocking summaries',async()=>{
  const result=await invoke('/api/stocking',{state:'MA'});
  assert.equal(result.statusCode,200);
  assert.equal(JSON.parse(result.body).summary.state,'MA');
});
