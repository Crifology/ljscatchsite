/* Audit every generated state file without contacting external services. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {states}=require('../assets/water-explorer-location.js');
function validate(folder=path.resolve(__dirname,'../database')){
  const index=JSON.parse(fs.readFileSync(path.join(folder,'index.json'),'utf8'));
  const codes=Object.keys(states).filter(c=>c!=='DC');
  assert.deepEqual(index.states.map(s=>s.code).sort(),[...codes].sort());
  let waters=0,evidence=0,pairs=0;
  const names=new Set(),recordIds=new Set();
  for(const code of codes){
    const data=JSON.parse(fs.readFileSync(path.join(folder,`${code}.json`),'utf8'));
    assert.equal(data.schemaVersion,1);assert.equal(data.state.code,code);assert.equal(data.state.name,states[code].label);
    assert.equal(data.coverage.complete,true,`${code}: import incomplete`);assert.equal(data.coverage.error,null);
    assert.ok(data.coverage.queries.length>0);assert.ok(Number.isFinite(Date.parse(data.generatedAt)));
    const ids=new Set(),species=new Set();let stateEvidence=0,statePairs=0;
    for(const water of data.waters){
      assert.ok(water.name.trim());assert.equal(water.state,code);assert.ok(!ids.has(water.id));ids.add(water.id);
      assert.equal(water.coordinates.length,2);assert.ok(water.coordinates.every(Number.isFinite));
      assert.ok(Math.abs(water.coordinates[0])<=180&&Math.abs(water.coordinates[1])<=90);
      assert.ok(water.species.length>0);
      const localSpecies=new Set();
      for(const s of water.species){
        assert.ok(s.commonName.trim());assert.ok(s.scientificName.trim());assert.equal(s.status,'established');
        const key=s.scientificName.toLowerCase();assert.ok(!localSpecies.has(key));localSpecies.add(key);species.add(key);names.add(key);
        assert.ok(s.evidence.length>0);statePairs++;
        for(const e of s.evidence){
          assert.equal(e.sourceId,'usgs-nas');assert.ok(Number.isInteger(e.recordId));assert.ok(!recordIds.has(e.recordId),`Duplicate record ${e.recordId}`);recordIds.add(e.recordId);
          assert.equal(e.url,`https://nas.er.usgs.gov/queries/SpecimenViewer.aspx?SpecimenID=${e.recordId}`);
          assert.ok(e.coordinates.every(Number.isFinite));stateEvidence++;
        }
      }
    }
    assert.equal(data.counts.waters,data.waters.length);assert.equal(data.counts.species,species.size);
    assert.equal(data.counts.waterSpeciesPairs,statePairs);assert.equal(data.counts.evidence,stateEvidence);
    assert.equal(data.coverage.acceptedRecords,stateEvidence);
    const entry=index.states.find(s=>s.code===code);
    for(const [key,value] of Object.entries(data.counts))assert.equal(entry[key],value,`${code}: manifest ${key}`);
    waters+=data.waters.length;evidence+=stateEvidence;pairs+=statePairs;
  }
  return {states:codes.length,waterLocations:waters,uniqueScientificNames:names.size,waterSpeciesPairs:pairs,evidenceRecords:evidence};
}
if(require.main===module){try{console.log(JSON.stringify(validate(),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={validate};
