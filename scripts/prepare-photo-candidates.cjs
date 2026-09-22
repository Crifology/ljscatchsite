const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {eligible,imageType}=require('./import-fish-photos.cjs');
const root=path.resolve(__dirname,'..'),catalog=require('../database/species-photos.json'),review=require('../database/photo-review.json');
const names=process.argv.slice(2),records=[];
for(const file of fs.readdirSync(path.join(root,'.tracker-cache/photo-import'))){const d=JSON.parse(fs.readFileSync(path.join(root,'.tracker-cache/photo-import',file)));for(const r of d.results||[])if(r.taxon&&r.photos)records.push(r);}
const candidates={};
async function main(){
 for(const name of names){
  const entry=catalog.species[name],seen=new Set(review.rejectedPhotoIds);if(entry.photoId)seen.add(entry.photoId);
  let photos=[];
  for(const o of records){
   if(o.taxon.id!==entry.taxonId&&!o.taxon.ancestor_ids?.includes(entry.taxonId))continue;
   const p=o.photos.find(p=>eligible(p)&&!seen.has(p.id));if(p){seen.add(p.id);photos.push(p);}
  }
  for(const p of photos.slice(0,8)){
   try{
    const remote=(p.medium_url||p.url).replace('/square.','/medium.');
    const response=await fetch(remote,{signal:AbortSignal.timeout(20000)});if(!response.ok)continue;
    const bytes=Buffer.from(await response.arrayBuffer()),ext=imageType(bytes);if(!ext)continue;
    const local='/assets/fish-photos/inat-'+p.id+'.'+ext;fs.writeFileSync(path.join(root,local),bytes);
    candidates[name+' #'+p.id]={...entry,scientificName:name+' #'+p.id,status:'available',photoId:p.id,downloadUrl:remote,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),verifiedAt:new Date().toISOString(),
     photo:{url:local,sourceUrl:'https://www.inaturalist.org/photos/'+p.id,label:p.attribution||p.attribution_name||'iNaturalist contributor',license:p.license_code.toUpperCase(),licenseCode:p.license_code,licenseUrl:p.license_code==='cc0'?'https://creativecommons.org/publicdomain/zero/1.0/':'https://creativecommons.org/licenses/'+p.license_code.slice(3)+'/4.0/',displayAllowed:true}};
   }catch{}
  }
  console.log(name+': '+photos.slice(0,8).length+' candidates');
 }
 fs.writeFileSync(path.join(root,'.tracker-cache/photo-candidates.json'),JSON.stringify(candidates,null,2));
}
main();
