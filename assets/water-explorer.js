(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const D = window.WaterExplorerData, config = window.WaterExplorerConfig;
  window.WaterLocation?.populate($('region'),D.regions,tag=>document.createElement(tag));
  let map, layers, request, features = [], revision = 0, busy = false, selection = 0;
  let summaryRevision=0, reloadTimer, mapReady=false, locating=Boolean(window.WaterLocation), fitting=false, interacted=false;
  const nasRequest = async bbox => {
    const response=await fetch(`/api/usgs-fish?${new URLSearchParams({bbox})}`,{signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw Error("USGS fish service unavailable");
    const data=await response.json();
    if(!Array.isArray(data.results))throw Error("Invalid USGS response");
    return data;
  };
  function scheduleLoad() {
    if(!mapReady || locating)return;
    clearTimeout(reloadTimer);
    reloadTimer=setTimeout(()=>load(),450);
  }
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  function sourceLink(s) {
    const a = node('a', `${s.label} · ${s.license}`);
    a.href = D.https(s.sourceUrl || s.url); a.target = '_blank'; a.rel = 'noopener noreferrer';
    const wrapper = node('span'); wrapper.append(a);
    if (s.licenseCode) {
      const license = node('a','License');
      license.href = D.https(s.licenseUrl) || (s.licenseCode === 'cc0' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : `https://creativecommons.org/licenses/${s.licenseCode.slice(3)}/4.0/`);
      license.target = '_blank'; license.rel = 'noopener noreferrer'; wrapper.append(node('span',' · '),license);
    }
    return wrapper;
  }
  function details(feature) {
    const p = feature.properties, content = node('div', '', 'water-popup');
    content.append(node('p','WATER GUIDE','eyebrow'),node('h3',p.name),node('p',[p.kind,p.state].filter(Boolean).join(' · ')));
    const linear = feature.geometry.type.includes('LineString');
    if(p.database)content.append(node('p','Reported water locality from the saved USGS database. This point is a source location, not a water boundary or public access point.','data-note'));
    if (linear) content.append(node('p','Fish associated with this river segment from nearby records.','data-note'));
    if (!p.loaded) { content.append(node('p',p.error || 'Loading fish types…','fish-status')); if(!p.species.length)return content; }
    content.append(node('h4', `${p.species.length} fish types`));
    if(p.unavailable?.length)content.append(node('p',`${p.unavailable.join(', ')} unavailable; this list may be incomplete.`,'coverage-warning'));
    if (p.limited) content.append(node('p','Species information is available for part of the source data; this list may be incomplete.','coverage-warning'));
    if (!p.species.length) content.append(node('p','Species information is not available for this water yet.'));
    for (const s of p.species) {
      const card = node('article','','species-card');
      card.append(node('h4',s.commonName),node('p',s.scientificName,'scientific-name'));
      if(s.usgs)card.append(node('p','USGS: established introduced population','source-badge'));
      if(s.stocked)card.append(node('p',`Stocked species · nearest mapped water estimate (${s.stockingMeters} m)`,'source-badge'));
      if (s.photo) {
        const figure = node('figure'), img = node('img');
        img.src = s.photo.url; img.alt = `Representative ${s.commonName}; not a photo from this water`;
        img.loading = 'lazy'; img.referrerPolicy = 'strict-origin-when-cross-origin';
        img.addEventListener('error', () => img.replaceWith(node('p','Species photo unavailable.')), {once:true});
        const caption = node('figcaption','Representative species photo · '); caption.append(sourceLink(s.photo));
        figure.append(img,caption); card.append(figure);
      } else card.append(node('p','Licensed species photo unavailable.','photo-unavailable'));
      const evidence = node('details','','species-source');
      evidence.append(node('summary','Data source & credit'),sourceLink(s.evidence)); card.append(evidence);
      for(const source of s.extraEvidence||[])evidence.append(node('br'),sourceLink(source));
      content.append(card);
    }
    const sources = node('details','','species-source');
    sources.append(node('summary','About this species list'),node('p','Species are compiled from available location records across all dates. Coverage is incomplete and does not guarantee current fish presence. River segments use nearby records.'),sourceLink(p.source));
    content.append(sources);
    return content;
  }
  async function select(feature, location) {
    const token = ++selection;
    let popup;
    if (map) {
      const [lng,lat] = feature.properties.pin;
      popup = window.L.popup({maxWidth:340,maxHeight:380,autoPan:false}).setLatLng(location || [lat,lng]).setContent(details(feature)).openOn(map);
    } else {
      $('water-details').replaceChildren(details(feature)); $('water-dialog').showModal();
    }
    if (feature.properties.loaded) return;
    try { Object.assign(feature.properties,await window.WaterProviders.fish(feature,window.TrackerNetwork.request,async bbox=>{
      const response=await fetch(`/api/usgs-fish?${new URLSearchParams({bbox})}`,{signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw Error('USGS fish service unavailable');
      const data=await response.json();
      if(!Array.isArray(data.results))throw Error('Invalid USGS response');
      return data;
    }),{error:null}); }
    catch { feature.properties.error = 'Fish types are unavailable. Close and select this water later to try again.'; }
    for(const s of feature.properties.stockingSpecies||[])window.WaterStocking?.merge(feature,s);
    if (token !== selection) return;
    if (popup && map.hasLayer(popup)) popup.setContent(details(feature));
    else if (!map) $('water-details').replaceChildren(details(feature));
    render();
  }
  function render() {
    const b=mapReady ? map.getBounds() : null;
    const result=D.fishResults(features,$('search').value,$('water-type').value,b ? [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()] : null);
    const visible=result.waters;
    layers?.clearLayers(); $('water-list').replaceChildren(); $('count').textContent = result.species.length;
    for (const feature of visible) {
      const p = feature.properties;
      if (map) {
        if (feature.geometry.type !== 'Point') {
          window.L.geoJSON(feature,{style:{color:'#087b92',weight:3,fillColor:'#36bac3',fillOpacity:.25}})
            .on('click', e => select(feature,e.latlng)).addTo(layers);
        }
        window.L.marker([p.pin[1],p.pin[0]],{title:p.name,alt:`View fish in ${p.name}`})
          .bindTooltip(node('span',p.name)).on('click',() => select(feature)).addTo(layers);
      }
    }
    for(const species of result.species){
      const button=node('button',species.commonName,'water-button');button.type='button';
      button.append(node('small',`${species.waters.length} matching waters`));
      button.onclick=()=>{ $('search').value=species.scientificName;revision++;render();scheduleLoad(); };
      $('water-list').append(button);
    }
    if(result.total>20)$('water-list').append(node('p',`Showing 20 of ${result.total} fish types. Narrow your search or zoom in.`,'list-hint'));
    if(!result.species.length)$('water-list').append(node('p',busy ? 'Finding fish records for this area...' : 'No fish records match this view. Try another area or search.','empty-state'));
  }

  function clear() { selection++; features = []; map?.closePopup(); if($('stocking-status'))$('stocking-status').textContent=''; render(); }
  async function stockingSummary(){
    if(!window.WaterStocking)return;
    const token=++summaryRevision,region=$('region').value;
    const state=region==='alaska'?'AK':region==='hawaii'?'HI':region;
    const panel=$('stocking-summary');panel.textContent='Loading state stocking summary...';
    try{
      const r=await fetch(`/api/stocking?${new URLSearchParams({state})}`,{signal:AbortSignal.timeout(5000)});
      if(!r.ok)throw Error('Summary unavailable');
      const data=await r.json();if(token!==summaryRevision)return;
      panel.replaceChildren();
      if(data.summary){
        const s=data.summary;
        panel.append(node('strong',`${s.stateName} · ${s.annualCount===null?'Count not verified in source':`${s.annualCount.toLocaleString()} fish reported${s.year?` (${s.year})`:''}`}`));
        panel.append(node('p',s.agency));
        panel.append(node('p',s.source.replace(/\u00e2\u20ac\u201d/g,'—')));
      }else panel.append(node('p',`${data.states} state summaries; ${data.reportedCounts} supplied counts. Select a state to view its stocking information.`));
      panel.append(node('p','These are state summaries, not individual stocking locations. They cannot identify which fish were stocked in a particular lake or river.'));
      panel.append(sourceLink({label:'FishFig · state stocking aggregation',license:'CC BY 4.0',licenseCode:'cc-by',url:'https://fishfig.com/data/'}));
    }catch{if(token===summaryRevision)panel.textContent='State stocking summary unavailable. The other map sources remain available.';}
  }
  function overview() {
    if(!map)return;
    locating=false; fitting=true; revision++;
    const area = D.regions[$('region').value];
    try {
      map.invalidateSize({pan:false});
      if(area.bounds){
        const [w,s,e,n]=area.bounds;
        map.fitBounds([[s,w],[n,e]],{padding:[24,24],maxZoom:11,animate:false});
      }else map.setView(area.center,area.zoom,{animate:false});
      mapReady=true;
    } finally { fitting=false; }
    clear();
    $('refresh').disabled=!request;
    if (request) scheduleLoad();
    stockingSummary();
  }
  async function load() {
    if (!request || !mapReady || locating) return;
    if(busy){scheduleLoad();return;}
    const token = ++revision;
    busy = true; $('refresh').disabled = true; clear();
    $('status').textContent = 'Finding water guides in this area…';
    let localFeatures=[],databaseNote='';
    try {
      const b=map.getBounds(),area=D.regions[$('region').value];
      const extent=[Math.max(-180,b.getWest()),Math.max(-85,b.getSouth()),Math.min(180,b.getEast()),Math.min(85,b.getNorth())];
      const bounds=area.bounds ? [Math.max(extent[0],area.bounds[0]),Math.max(extent[1],area.bounds[1]),Math.min(extent[2],area.bounds[2]),Math.min(extent[3],area.bounds[3])] : extent;
      if(bounds[0]>=bounds[2] || bounds[1]>=bounds[3]){
        $('status').textContent='Move back into the selected state or choose another region.';return;
      }
      const bbox = D.boundsQuery(bounds);
      const inState=feature=>!area.geometry || window.WaterProviders.contains(feature.properties.pin,area.geometry);
      try {
        const params=new URLSearchParams({state:$('region').value,bbox,q:$('search').value,kind:$('water-type').value});
        const stored=await fetch(`/api/fish-database?${params}`,{signal:AbortSignal.timeout(10000)});
        if(!stored.ok)throw Error('Local database unavailable');
        const database=await stored.json();
        if(!Array.isArray(database.features))throw Error('Invalid local database');
        if(token!==revision)return;
        // The database already uses the source's state assignment, which is more
        // reliable than our simplified state polygon near shores and borders.
        localFeatures=database.features;
        features=localFeatures;render();
        databaseNote=`${localFeatures.length} saved water locations. ${database.limited?'Saved results capped; search a fish or zoom in for more. ':''}${database.unavailable?.length||database.partial?.length?'Some state imports are incomplete or unavailable. ':''}`;
        $('status').textContent=`${databaseNote}Select a fish to filter pins, or a pin to see all its recorded fish.`;
        // Complete local imports are the primary search source. Live services are
        // a fallback, so their latency cannot hold up the next species search.
        if(!database.unavailable?.length&&!database.partial?.length)return;
        $('status').textContent+=' Checking live sources for incomplete imports...';
      }catch{databaseNote='Saved database unavailable; using live sources. ';}
      const response = await request(bbox), result = D.normalize(response);
      if (token !== revision) return;
      const liveFeatures=result.features.filter(inState);
      features=[...localFeatures,...liveFeatures];
      $('status').textContent='Finding fish records for these waters...';
      const fish=await window.WaterProviders.areaFish(liveFeatures,bbox,window.TrackerNetwork.request,nasRequest);
      if(token!==revision)return;
      liveFeatures.forEach((feature,i)=>Object.assign(feature.properties,fish[i]));
      render();
      $('status').textContent = `${databaseNote}${features.filter(f=>f.properties.species.length).length} waters with fish records loaded. ${response.partial ? 'Some USGS layers are unavailable. ' : ''}${result.limited ? 'Coverage is limited; zoom in to see a smaller area. ' : ''}${fish.some(f=>f.limited)?'Fish records are capped; zoom in for more local results. ':''}${fish.some(f=>!f.loaded||f.unavailable?.length)?'Some fish sources are unavailable. ':''}Select a fish to filter pins, or a pin to see all its fish.`;
      if(window.WaterStocking){
        $('stocking-status').textContent='Checking stocking locations in this area...';
        try{
          const r=await fetch(`/api/stocking?${new URLSearchParams({bbox})}`,{signal:AbortSignal.timeout(10000)});
          if(!r.ok)throw Error('Stocking event data is not available.');
          const stock=await r.json();
          if(token!==revision)return;
          if(!Array.isArray(stock.events))throw Error('Stocking file could not be read.');
          if(stock.aggregateOnly){$('stocking-status').textContent='Stocking file loaded: state summaries only. No location-level stocking entries are available to place on water pins.';return;}
          const combined=await window.WaterStocking.attach(features,stock.events,request,window.WaterProviders,()=>token===revision);
          if(token!==revision)return;
          features=combined.features.filter(f=>f.properties.database||inState(f));render();
          $('stocking-status').textContent=`${combined.matched} stocking entries matched to nearby waters; ${combined.unmatched} could not be matched reliably.${stock.limited?' Only the first 10 entries were checked; zoom in for a smaller area.':''}${stock.rejected?' Some source entries lack eligible event details.':''}`;
        }catch(error){if(token===revision)$('stocking-status').textContent=error.message;}
      }
    } catch (error) {
      if (token === revision) $('status').textContent = `${localFeatures.length?databaseNote:'Water guides unavailable. '}Live sources unavailable. ${error.message}`;
    } finally { busy = false; render(); $('refresh').disabled = !request || !mapReady || locating; }
  }
  const filterChanged=()=>{revision++;render();scheduleLoad();};
  $('search').addEventListener('input',filterChanged); $('water-type').onchange = filterChanged;
  $('region').onchange = overview; $('reset-map').onclick = overview; $('refresh').onclick = load;
  $('close-dialog').onclick = () => $('water-dialog').close();
  const mapStatus = $('map-status');
  if (!['http:','https:'].includes(window.location.protocol)) {
    mapStatus.hidden = false; mapStatus.textContent = 'Open the localhost web preview to display the map. Run node server.cjs and visit http://localhost:8000/trackerapp.html.';
  } else if (window.L) {
    map = window.L.map('catch-map',{scrollWheelZoom:false,minZoom:3,maxBounds:[[-85,-180],[85,180]],maxBoundsViscosity:1});
    const tiles = window.L.tileLayer(config.tileUrl,{maxZoom:18,noWrap:true,referrerPolicy:'strict-origin-when-cross-origin',attribution:config.tileAttribution});
    let failed = false;
    tiles.on('tileerror',() => {
      if (failed) return; failed = true; map.removeLayer(tiles);
      mapStatus.hidden = false; mapStatus.textContent = 'Map tiles are unavailable; tile requests have been paused. Loaded water guides remain accessible in the list.';
    });
    // Leaflet requires a center and zoom before getBounds or rendering.
    const initial=D.regions.us;
    map.setView(initial.center,initial.zoom,{animate:false});mapReady=true;
    layers = window.L.layerGroup().addTo(map); tiles.addTo(map);
    map.on('moveend',() => {
      if(fitting || locating)return;
      revision++; render(); scheduleLoad();
    });
  } else { mapStatus.hidden = false; mapStatus.textContent = 'The Leaflet map could not load. Check your connection and reload.'; }
  if (map) {
    request = bbox => window.WaterProviders.waters(bbox,window.TrackerNetwork.request);
    $('status').textContent = locating ? 'Finding your state before loading fish...' : 'Loading fish in this area...';
    if(!locating)overview();
  } else $('status').textContent = 'The map must be available before searching for waters.';
  $('refresh').disabled = !request || !mapReady || locating; $('reset-map').disabled = !map;
  render();
  if(map && window.WaterLocation){
    map.on('movestart',()=>{if(!fitting){interacted=true;locating=false;$('refresh').disabled=!request;}});
    $('region').addEventListener('change',()=>{interacted=true;});
    $('refresh').addEventListener('click',()=>{interacted=true;});
    $('reset-map').addEventListener('click',()=>{interacted=true;});
    (async()=>{try{return await window.WaterLocation.detect();}catch{return null;}})().then(code=>{
      if(interacted){$('location-status').textContent='Using your selected map area.';return;}
      if(code){
        $('region').value=code;overview();
        $('location-status').textContent=`Starting in ${D.regions[code].label}, estimated from your connection. You can choose another state.`;
      }else {
        overview();
        $('location-status').textContent='Your state could not be determined. Showing the US overview; choose a state using Explore.';
      }
    });
  }else if($('location-status'))$('location-status').textContent='Choose a state using Explore when the map is available.';
})();
