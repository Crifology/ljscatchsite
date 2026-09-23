/* Dependency-free first-party host and shared iNaturalist request budget. Node 22+. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {createUSGSService} = require('./usgs-fish-service.cjs');
const {createStockingService} = require('./stocking-service.cjs');
const {createDatabaseService} = require('./fish-database-service.cjs');
const ROOT = __dirname;
const MIME = {'.json':'application/json; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.md':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
function createFishService({fetcher=fetch,now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms)),readBudget,writeBudget}) {
  const cache=new Map(),pending=new Map();
  let queue=Promise.resolve(),next=0,blocked=0;
  function canonical(params) {
    const values=['swlng','swlat','nelng','nelat'].map(k=>Number(params.get(k)));
    if(['swlng','swlat','nelng','nelat'].some(k=>!params.has(k)) || !values.every(Number.isFinite)) throw Error('Invalid bounds');
    const [w,s,e,n]=values;
    if(w < -180 || e>180 || s < -90 || n>90 || w>=e || s>=n) throw Error('Invalid bounds');
    const query=new URLSearchParams({taxon_id:'47178',place_id:'1',quality_grade:'research',captive:'false',geo:'true',license:'cc0,cc-by,cc-by-sa',geoprivacy:'open',taxon_geoprivacy:'open',per_page:'200',order_by:'observed_on',order:'desc'});
    ['swlng','swlat','nelng','nelat'].forEach((k,i)=>query.set(k,values[i].toFixed(5)));
    return query.toString();
  }
  return async params => {
    let key;
    try {key=canonical(params);} catch {return {status:400,data:{error:'Invalid water bounds'}};}
    const hit=cache.get(key);
    if(hit && now()-hit.at<300000) return {status:200,data:hit.data};
    if(pending.has(key)) return pending.get(key);
    if(pending.size>=20) return {status:429,retry:60,data:{error:'Request queue is full'}};
    const task=queue.catch(()=>{}).then(async()=>{
      if(now()<blocked) return {status:429,retry:Math.ceil((blocked-now())/1000),data:{error:'Provider cooling down'}};
      await pause(Math.max(0,next-now()));
      let budget;
      const day=new Date(now()).toISOString().slice(0,10);
      try {budget=readBudget();if(budget.day!==day)budget={day,count:0};}
      catch {return {status:503,retry:60,data:{error:'Request budget unavailable'}};}
      if(budget.count>=9000) return {status:429,retry:Math.ceil((Date.parse(day)+86400000-now())/1000),data:{error:'Daily request budget reached'}};
      try {writeBudget({day,count:budget.count+1});} catch {return {status:503,retry:60,data:{error:'Request budget unavailable'}};}
      next=now()+1100;
      try {
        const response=await fetcher(`https://api.inaturalist.org/v1/observations?${key}`,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'LJsCatchWaterExplorer/1.0',Accept:'application/json'},redirect:'error'});
        if(!response.ok) {
          const header=response.headers.get('Retry-After');
          const until=/^\d+$/.test(header || '')?now()+Number(header)*1000:Date.parse(header);
          blocked=Math.max(now()+60000,Number.isFinite(until)?until:0);
          return {status:response.status===429?429:503,retry:Math.ceil((blocked-now())/1000),data:{error:'Fish provider unavailable'}};
        }
        const data=await response.json();
        if(!Array.isArray(data.results)) throw Error('Invalid provider response');
        // Strip unused text/identifications and never forward private coordinates.
        const safe={total_results:data.total_results,results:data.results.filter(o=>!o.obscured&&!o.private_location&&(!o.geoprivacy||o.geoprivacy==='open')&&(!o.taxon_geoprivacy||o.taxon_geoprivacy==='open')&&['cc0','cc-by','cc-by-sa'].includes(o.license_code)).map(o=>({id:o.id,license_code:o.license_code,quality_grade:o.quality_grade,place_ids:o.place_ids,positional_accuracy:o.positional_accuracy,geojson:o.geojson,observed_on:o.observed_on,taxon:o.taxon,user:{login:o.user?.login},photos:o.photos,captive:o.captive}))};
        if(cache.size>=100)cache.delete(cache.keys().next().value);
        cache.set(key,{at:now(),data:safe});return {status:200,data:safe};
      } catch {blocked=now()+60000;return {status:503,retry:60,data:{error:'Fish provider unavailable'}};}
    });
    queue=task;pending.set(key,task);
    try{return await task;}finally{pending.delete(key);}
  };
}
function createServer({fishService,usgsService=createUSGSService(),stockingService=createStockingService(),databaseService=createDatabaseService()}={}) {
  if(!fishService) {
    const folder=path.join(ROOT,'.tracker-cache'),file=path.join(folder,'budget.json');
    fs.mkdirSync(folder,{recursive:true});
    fishService=createFishService({
      readBudget:()=>{if(!fs.existsSync(file))return {day:'',count:0};const b=JSON.parse(fs.readFileSync(file,'utf8'));if(!Number.isInteger(b.count)||b.count<0)throw Error('Invalid budget');return b;},
      writeBudget:b=>{fs.writeFileSync(file+'.tmp',JSON.stringify(b));fs.renameSync(file+'.tmp',file);}
    });
  }
  return http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
    let url;try{url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);return res.end();}
    if(url.pathname==='/game'){res.writeHead(302,{Location:'/game/'});return res.end();}
    if(['/api/fish-observations','/api/usgs-fish','/api/stocking','/api/fish-database'].includes(url.pathname)) {
      if(req.method==='HEAD'){res.writeHead(405);return res.end();}
      try {
        const service=url.pathname==='/api/fish-database'?databaseService:url.pathname==='/api/stocking'?stockingService:url.pathname==='/api/usgs-fish'?usgsService:fishService;
        const result=await service(url.searchParams);
        res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control',result.status===200?'public, max-age=300':'no-store');
        if(result.retry)res.setHeader('Retry-After',String(result.retry));
        res.writeHead(result.status);return res.end(JSON.stringify(result.data));
      } catch {res.writeHead(503,{'Content-Type':'application/json'});return res.end('{"error":"Fish service unavailable"}');}
    }
    let name;try{name=decodeURIComponent(url.pathname==='/'?'/index.html':['/game','/game/'].includes(url.pathname)?'/game/index.html':url.pathname);}catch{res.writeHead(400);return res.end();}
    const file=path.resolve(ROOT,'.'+name),ext=path.extname(file).toLowerCase();
    if(!file.startsWith(ROOT+path.sep)||name.split(/[\\/]/).some(p=>p.startsWith('.'))||!MIME[ext]||!(name.startsWith('/assets/')||/^\/game\/(?:index\.html|game\.css|game\.js|engine\.js)$/.test(name)||/^\/database\/(?:[A-Z]{2}|index)\.json$/.test(name)||/^\/[\w-]+\.(html|md)$/.test(name))) {res.writeHead(404);return res.end();}
    fs.stat(file,(err,stat)=>{
      if(err||!stat.isFile()){res.writeHead(404);return res.end();}
      res.writeHead(200,{'Content-Type':MIME[ext],'Content-Length':stat.size,'Cache-Control':'public, max-age=60'});
      if(req.method==='HEAD')return res.end();
      const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
    });
  });
}
if(require.main===module)createServer().listen(Number(process.env.PORT)||8000,process.env.HOST||'127.0.0.1',()=>console.log(`Serving HTTP on ${process.env.HOST||'127.0.0.1'} port ${Number(process.env.PORT)||8000}`));
module.exports={createFishService,createServer};
