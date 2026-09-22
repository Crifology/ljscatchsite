const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {usablePhoto}=require('../fish-database-service.cjs');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'database');
const catalog=JSON.parse(fs.readFileSync(path.join(folder,'species-photos.json')));
const approved=new Set(JSON.parse(fs.readFileSync(path.join(folder,'photo-review.json'))).approvedPhotos);
const seen=new Set(),assigned=new Set();let states=0,assignments=0;
for(const file of fs.readdirSync(folder).filter(f=>/^[A-Z]{2}\.json$/.test(f))){
  const data=JSON.parse(fs.readFileSync(path.join(folder,file)));states++;
  for(const water of data.waters)for(const species of water.species){
    const key=species.scientificName.trim().toLowerCase(),entry=catalog.species[key];
    assert.ok(entry,`No photo search recorded for ${key}`);seen.add(key);
    if(!species.photo){assert.notEqual(species.photoStatus,'available');continue;}
    assert.ok(usablePhoto(species.photo));assert.ok(approved.has(species.photo.url));
    assert.deepEqual(species.photo,entry.photo);assert.equal(species.photoStatus,'available');assignments++;
    if(!assigned.has(key)){
      const bytes=fs.readFileSync(path.join(root,species.photo.url));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);assigned.add(key);
    }
  }
}
console.log(JSON.stringify({states,fishTypes:seen.size,withPhotos:assigned.size,withoutPhotos:seen.size-assigned.size,photoAssignments:assignments},null,2));
