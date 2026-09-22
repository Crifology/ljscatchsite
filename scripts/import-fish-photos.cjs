const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),DB=path.join(ROOT,'database');
const CATALOG=path.join(DB,'species-photos.json'),CACHE=path.join(ROOT,'.tracker-cache','photo-import');
const LICENSES={cc0:'https://creativecommons.org/publicdomain/zero/1.0/','cc-by':'https://creativecommons.org/licenses/by/4.0/','cc-by-sa':'https://creativecommons.org/licenses/by-sa/4.0/'};
const key=name=>name.trim().toLowerCase();
const files=()=>fs.readdirSync(DB).filter(f=>/^[A-Z]{2}\.json$/.test(f));
function eligible(p){
  if(!p||!LICENSES[p.license_code]||!Number.isInteger(p.id)||p.flags?.length)return false;
  try{const u=new URL(p.medium_url||p.url);return u.protocol==='https:'&&['static.inaturalist.org','inaturalist-open-data.s3.amazonaws.com'].includes(u.hostname);}catch{return false;}
}
function exactTaxon(t,name){return t.is_active!==false && (key(t.name||'')===key(name)||key(t.matched_term||'')===key(name)) && (t.ancestor_ids?.includes(47178)||t.ancestor_ids?.includes(49231)||t.iconic_taxon_name==='Actinopterygii');}
function imageType(b){
  if(b[0]===255&&b[1]===216&&b[2]===255)return 'jpg';
  if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
  if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'webp';
  return null;
}
function save(file,data){fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2)+'\n');fs.renameSync(file+'.tmp',file);}
let last=0;
async function json(url){
  const file=path.join(CACHE,crypto.createHash('sha256').update(url).digest('hex')+'.json');
  if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file));
  const delay=Math.max(0,last+1200-Date.now());last=Date.now()+delay;
  await new Promise(r=>setTimeout(r,delay));
  const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'LJsCatchSpeciesPhotos/1.0'}});
  if(!response.ok){const e=Error(`HTTP ${response.status}; Retry-After ${response.headers.get('retry-after')||'not supplied'}`);e.stop=[403,429].includes(response.status);throw e;}
  const data=await response.json();save(file,data);return data;
}
async function find(name){
  const query=`https://api.inaturalist.org/v1/taxa?${new URLSearchParams({q:name,is_active:'true',per_page:'30'})}`;
  const data=await json(query);
  const direct=data.results.filter(t=>exactTaxon(t,name)&&key(t.name)===key(name));
  const speciesRank=direct.filter(t=>t.rank==='species');
  const taxa=speciesRank.length?speciesRank:direct.length?direct:data.results.filter(t=>exactTaxon(t,name));
  // Never substitute a fuzzy match or one of a hybrid's parent species.
  if(taxa.length!==1)return {status:'unmatched',reason:taxa.length?'Ambiguous scientific-name match':'No exact scientific-name match',query};
  const reviewFile=path.join(DB,'photo-review.json');
  const review=fs.existsSync(reviewFile)?JSON.parse(fs.readFileSync(reviewFile)):{};
  const rejected=new Set(review.rejectedPhotoIds||[]);
  const taxon=taxa[0];let photo=eligible(taxon.default_photo)&&!rejected.has(taxon.default_photo.id)?taxon.default_photo:null;
  if(!photo){
    const result=await json(`https://api.inaturalist.org/v1/observations?${new URLSearchParams({taxon_id:String(taxon.id),photos:'true',photo_license:'cc0,cc-by,cc-by-sa',quality_grade:'research',per_page:'30',order_by:'observed_on',order:'desc'})}`);
    // Restrict to this taxon or a documented child, not a similarly named species.
    photo=result.results.filter(o=>o.taxon?.id===taxon.id||o.taxon?.ancestor_ids?.includes(taxon.id)).flatMap(o=>o.photos||[]).find(p=>eligible(p)&&!rejected.has(p.id));
  }
  if(!photo)return {status:'unavailable',reason:'No CC0, CC BY or CC BY-SA photo found in eligible results',taxonId:taxon.id,query};
  const remote=(photo.medium_url||photo.url).replace('/square.','/medium.');
  const response=await fetch(remote,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Image HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer()),ext=imageType(bytes);
  if(!ext||bytes.length>10*1024*1024)throw Error('Image failed format/size validation');
  const local=`/assets/fish-photos/inat-${photo.id}.${ext}`;fs.writeFileSync(path.join(ROOT,local),bytes);
  return {status:'available',taxonId:taxon.id,matchedScientificName:taxon.name,query,verifiedAt:new Date().toISOString(),
    sha256:crypto.createHash('sha256').update(bytes).digest('hex'),downloadUrl:remote,photoId:photo.id,
    photo:{url:local,sourceUrl:`https://www.inaturalist.org/photos/${photo.id}`,label:photo.attribution||photo.attribution_name||'iNaturalist contributor',
      license:photo.license_code.toUpperCase(),licenseCode:photo.license_code,licenseUrl:LICENSES[photo.license_code],displayAllowed:true}};
}
function apply(catalog){
  const reviewFile=path.join(DB,'photo-review.json');
  const approved=new Set(fs.existsSync(reviewFile)?JSON.parse(fs.readFileSync(reviewFile)).approvedPhotos||[]:[]);
  const coverage={};
  for(const file of files()){
    const data=JSON.parse(fs.readFileSync(path.join(DB,file)));
    const taxa=new Map();
    for(const water of data.waters)for(const species of water.species){
      const entry=catalog.species[key(species.scientificName)];
      const ready=entry?.status==='available'&&approved.has(entry.photo.url);
      species.photo=ready?entry.photo:null;
      species.photoStatus=entry?.status==='available'&&!ready?'needs-visual-review':entry?.status||'pending';
      taxa.set(key(species.scientificName),Boolean(species.photo));
    }
    data.photosUpdatedAt=catalog.updatedAt;
    data.photoCoverage={fishTypes:taxa.size,withPhotos:[...taxa.values()].filter(Boolean).length};
    data.photoCoverage.withoutPhotos=taxa.size-data.photoCoverage.withPhotos;
    coverage[data.state.code]=data.photoCoverage;
    save(path.join(DB,file),data);
  }
  const indexFile=path.join(DB,'index.json');
  if(fs.existsSync(indexFile)){
    const index=JSON.parse(fs.readFileSync(indexFile));
    for(const state of index.states)state.photoCoverage=coverage[state.code];
    save(indexFile,index);
  }
}
async function main(){
  fs.mkdirSync(CACHE,{recursive:true});fs.mkdirSync(path.join(ROOT,'assets/fish-photos'),{recursive:true});
  const species=new Map();
  for(const f of files())for(const w of JSON.parse(fs.readFileSync(path.join(DB,f))).waters)for(const s of w.species)species.set(key(s.scientificName),s.scientificName);
  const catalog=fs.existsSync(CATALOG)?JSON.parse(fs.readFileSync(CATALOG)):{schemaVersion:1,species:{}};
  let processed=0,cursor=0,stopped=false;
  const pending=[...species].sort().filter(([id])=>!catalog.species[id] || process.argv.includes('--retry-missing')&&catalog.species[id].status!=='available');
  async function worker(){
    while(cursor<pending.length&&!stopped){
      const [id,name]=pending[cursor++];
      try{catalog.species[id]={scientificName:name,...await find(name)};}
      catch(e){catalog.species[id]={scientificName:name,status:'error',reason:e.message};if(e.stop){stopped=true;process.exitCode=1;}}
      catalog.updatedAt=new Date().toISOString();save(CATALOG,catalog);
      console.log(`${++processed} ${name}: ${catalog.species[id].status}`);
    }
  }
  // Overlap response/download time, but reserve API starts at least 1.2s apart.
  await Promise.all([worker(),worker(),worker()]);

  apply(catalog);
  console.log(JSON.stringify(Object.values(catalog.species).reduce((s,e)=>(s[e.status]=(s[e.status]||0)+1,s),{})));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={eligible,exactTaxon,imageType,apply};
