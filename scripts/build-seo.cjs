const fs=require('node:fs');
const config=require('../seo.json');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function origin(value){
  if(!value)return null;
  const url=new URL(value);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('SEO site URL must be a public origin, for example https://example.com');
  return url.origin;
}
function writeSEO(output){
  const base=origin(process.env.SITE_URL||config.siteUrl||process.env.URL);
  const preview=['deploy-preview','branch-deploy'].includes(process.env.CONTEXT);
  for(const page of config.pages){
    const file=require('node:path').join(output,page.file);
    let html=fs.readFileSync(file,'utf8');
    const tags=[];
    if(base){
      const url=base+page.path;
      tags.push(`<link rel="canonical" href="${escape(url)}">`,`<meta property="og:url" content="${escape(url)}">`,`<meta property="og:image" content="${escape(base)}/assets/photos/logo-horizontal-light-transparent.png">`,`<meta property="og:image:alt" content="LJ's Catch fishing logo">`);
      if(page.path==='/')tags.push('<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:"LJ's Catch",url:base+'/',description:page.description,inLanguage:'en'}).replaceAll('<','\\u003c')+'</script>');
    }
    if(preview)tags.push('<meta name="robots" content="noindex, follow">');
    fs.writeFileSync(file,html.replace('</head>',tags.join('\n')+'\n</head>'));
  }
  fs.writeFileSync(require('node:path').join(output,'robots.txt'),'User-agent: *\nAllow: /\n'+(base?'Sitemap: '+base+'/sitemap.xml\n':''));
  const sitemap=require('node:path').join(output,'sitemap.xml');
  if(base)fs.writeFileSync(sitemap,'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+config.pages.map(p=>'  <url><loc>'+escape(base+p.path)+'</loc></url>').join('\n')+'\n</urlset>\n');
  else {if(fs.existsSync(sitemap))fs.unlinkSync(sitemap);console.log('SEO: set siteUrl in seo.json or SITE_URL to enable canonical URLs and sitemap.');}
}
module.exports={writeSEO};
