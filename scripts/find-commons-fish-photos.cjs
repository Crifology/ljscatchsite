const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {imageType}=require('./import-fish-photos.cjs');
const root=path.resolve(__dirname,'..'),catalogPath=path.join(root,'database/species-photos.json');
const output=path.join(root,'database/photo-alternatives.json');
const strip=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
async function run(){
 const catalog=JSON.parse(fs.readFileSync(catalogPath)),reject=JSON.parse(fs.readFileSync(path.join(root,'database/photo-review.json')));
 const alternatives=fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):{};
 const work=Object.entries(catalog.species).filter(([name,e])=>e.status!=='available'&&!/\bsp\.|\bcf\.|\u00d7|\//.test(name));
 for(const [name,entry] of work){
  if(alternatives[name])continue;
  await new Promise(r=>setTimeout(r,6500));
  const query='https://commons.wikimedia.org/w/api.php?'+new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:'"'+entry.scientificName+'"',gsrnamespace:'6',gsrlimit:'10',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'640'});
  const r=await fetch(query,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'LJsCatchSpeciesPhotos/1.0'}});
  if(!r.ok)throw Error('Commons HTTP '+r.status+'; Retry-After '+(r.headers.get('retry-after')||'not supplied'));
  const data=await r.json();let picked=null;
  for(const page of Object.values(data.query?.pages||{}).sort((a,b)=>a.index-b.index)){
   const info=page.imageinfo?.[0],meta=info?.extmetadata;
   if(!meta)continue;
   const text=strip(page.title+' '+meta.ImageDescription?.value).toLowerCase();
   if(!text.includes(name)||/map|distribution|range/i.test(page.title)||/illustration|drawing|skeleton|skull|map|artwork/i.test(meta.Categories?.value||''))continue;
   const license=meta.LicenseShortName?.value||'';
   const isPublicDomain=license==='Public domain'&&meta.Copyrighted?.value==='False';
   const licenseUrl=meta.LicenseUrl?.value||(isPublicDomain?'https://creativecommons.org/publicdomain/mark/1.0/':null);
   const code=/^CC BY-SA /i.test(license)?'cc-by-sa':/^CC BY /i.test(license)?'cc-by':/^CC0/i.test(license)?'cc0':isPublicDomain?'public-domain':null;
   if(!code||!licenseUrl||strip(meta.Restrictions?.value)||!meta.Artist?.value)continue;
   const remote=info.thumburl||info.url;
   if(!['upload.wikimedia.org','thumb.wikimedia.org'].includes(new URL(remote).hostname))continue;
   const response=await fetch(remote,{signal:AbortSignal.timeout(30000)});if(!response.ok)continue;
   const bytes=Buffer.from(await response.arrayBuffer()),ext=imageType(bytes);if(!ext||bytes.length>10*1024*1024)continue;
   const local='/assets/fish-photos/commons-'+page.pageid+'.'+ext;
   fs.writeFileSync(path.join(root,local),bytes);
   picked={scientificName:entry.scientificName,status:'available',provider:'Wikimedia Commons',verifiedAt:new Date().toISOString(),query,
    sha256:crypto.createHash('sha256').update(bytes).digest('hex'),downloadUrl:remote,
    photo:{url:local,sourceUrl:info.descriptionurl,label:strip(meta.Artist.value)+' — '+strip(page.title.replace(/^File:/,'')),license,licenseCode:code,licenseUrl:licenseUrl.replace(/^http:/,'https:'),displayAllowed:true}};
   break;
  }
  alternatives[name]=picked||{status:'unavailable',scientificName:entry.scientificName,query,reason:'No exact-name reusable photograph found on Commons'};
  fs.writeFileSync(output,JSON.stringify(alternatives,null,2)+'\n');console.log(name+': '+alternatives[name].status);
 }
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
