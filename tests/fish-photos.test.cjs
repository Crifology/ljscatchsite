const {test}=require('node:test');
const assert=require('node:assert/strict');
const {eligible,exactTaxon,imageType}=require('../scripts/import-fish-photos.cjs');
const {usablePhoto,feature}=require('../fish-database-service.cjs');
test('photo selection checks image rights independently and excludes restrictive licenses',()=>{
  const p={id:42,url:'https://static.inaturalist.org/photos/42/square.jpg',license_code:'cc-by'};
  assert.equal(eligible(p),true);
  for(const license_code of [null,'cc-by-nc','cc-by-nc-sa','cc-by-nd','all-rights-reserved'])assert.equal(eligible({...p,license_code}),false);
  assert.equal(eligible({...p,url:'https://other.example/fish.jpg'}),false);
});
test('taxon matching rejects fuzzy names, inactive records and parent substitutions',()=>{
  const t={name:'Esox lucius',is_active:true,ancestor_ids:[47178]};
  assert.ok(exactTaxon(t,'Esox lucius'));assert.ok(!exactTaxon(t,'Esox lucius x masquinongy'));
  assert.ok(!exactTaxon({...t,is_active:false},t.name));assert.ok(!exactTaxon({...t,ancestor_ids:[]},t.name));
});
test('download validation rejects HTML disguised as an image',()=>{
  assert.equal(imageType(Buffer.from('<html>Access denied</html>')),null);
  assert.equal(imageType(Buffer.from([255,216,255,224])),'jpg');
});
test('map keeps approved local photo credits and rejects noncommercial or unsafe photo paths',()=>{
  const p={url:'/assets/fish-photos/inat-42.jpg',sourceUrl:'https://www.inaturalist.org/photos/42',license:'CC-BY',licenseCode:'cc-by',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',displayAllowed:true,label:'Photographer'};
  assert.equal(usablePhoto(p),p);assert.equal(usablePhoto({...p,licenseCode:'cc-by-nc'}),null);
  assert.equal(usablePhoto({...p,url:'/assets/fish-photos/../../secret.jpg'}),null);
  const f=feature({id:'test',name:'Lake',coordinates:[-71,42],species:[{scientificName:'Test fish',photo:p,evidence:[{recordId:1,url:'https://example.org'}]}]},{license:'Public domain'});
  assert.equal(f.properties.species[0].photo,p);
});
