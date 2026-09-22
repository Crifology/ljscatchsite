/* Approximate state overview centers; never used to infer a stocking location. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports ? require('./water-state-bounds.js') : root.WaterStateBounds);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WaterLocation=api;
})(typeof window==='undefined'?globalThis:window,function(boundaries){
  'use strict';
  const rows=[
    ['AL','Alabama',32.8,-86.8,6],['AK','Alaska',64,-152,4],['AZ','Arizona',34.2,-111.7,6],
    ['AR','Arkansas',34.9,-92.4,6],['CA','California',37.2,-119.7,5],['CO','Colorado',39,-105.5,6],
    ['CT','Connecticut',41.6,-72.7,8],['DE','Delaware',39,-75.5,8],['DC','District of Columbia',38.9,-77,11],
    ['FL','Florida',28,-83,6],['GA','Georgia',32.6,-83.4,6],['HI','Hawaii',20.8,-157,6],
    ['ID','Idaho',44.3,-114.5,6],['IL','Illinois',40,-89.2,6],['IN','Indiana',40,-86.1,7],
    ['IA','Iowa',42.1,-93.5,7],['KS','Kansas',38.5,-98.4,6],['KY','Kentucky',37.8,-85.7,7],
    ['LA','Louisiana',31,-92,7],['ME','Maine',45.2,-69.1,6],['MD','Maryland',39,-76.7,7],
    ['MA','Massachusetts',42.2,-71.8,7],['MI','Michigan',44.3,-85.4,6],['MN','Minnesota',46,-94.5,6],
    ['MS','Mississippi',32.7,-89.7,6],['MO','Missouri',38.5,-92.5,6],['MT','Montana',47,-109.6,5],
    ['NE','Nebraska',41.5,-99.8,6],['NV','Nevada',39.3,-116.6,6],['NH','New Hampshire',43.9,-71.6,7],
    ['NJ','New Jersey',40.1,-74.5,7],['NM','New Mexico',34.5,-106,6],['NY','New York',42.9,-75.5,6],
    ['NC','North Carolina',35.6,-79.8,6],['ND','North Dakota',47.5,-100.5,6],['OH','Ohio',40.4,-82.8,7],
    ['OK','Oklahoma',35.6,-97.5,6],['OR','Oregon',44,-120.5,6],['PA','Pennsylvania',40.9,-77.8,7],
    ['RI','Rhode Island',41.7,-71.5,9],['SC','South Carolina',33.9,-80.9,7],['SD','South Dakota',44.4,-100.2,6],
    ['TN','Tennessee',35.8,-86.4,7],['TX','Texas',31,-99.3,5],['UT','Utah',39.3,-111.7,6],
    ['VT','Vermont',44,-72.7,7],['VA','Virginia',37.5,-79,7],['WA','Washington',47.4,-120.7,6],
    ['WV','West Virginia',38.6,-80.6,7],['WI','Wisconsin',44.6,-89.7,6],['WY','Wyoming',43,-107.5,6]
  ];
  const states=Object.fromEntries(rows.map(([code,label,lat,lng,zoom])=>[code,{label,center:[lat,lng],zoom,...boundaries?.[label]}]));
  function stateFrom(data){
    if(data?.success!==true||data.country_code!=='US')return null;
    const code=typeof data.region_code==='string'?data.region_code.toUpperCase():'';
    return Object.hasOwn(states,code)?code:null;
  }
  async function detect(fetcher=fetch){
    try {
      // Browser-origin request locates this visitor, not our server or proxy.
      // No IP, city or precise coordinates are requested, stored or logged by this app.
      const r=await fetcher('https://ipwho.is/?fields=success,country_code,region_code',{signal:AbortSignal.timeout(5000),credentials:'omit',referrerPolicy:'strict-origin-when-cross-origin'});
      if(!r.ok)return null; // No retries, including 429.
      return stateFrom(await r.json());
    }catch{return null;}
  }
  function populate(select,regions,create){
    for(const [code,area] of Object.entries(states)){
      regions[code]=area;
      const option=create('option');option.value=code;option.textContent=area.label;select.append(option);
    }
  }
  return {states,stateFrom,detect,populate};
});
