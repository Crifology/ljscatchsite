(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const D = window.WaterExplorerData, config = window.WaterExplorerConfig;
  window.WaterLocation?.populate($('region'),D.regions,tag=>document.createElement(tag));
  let map, layers, request, features = [], revision = 0, busy = false, selection = 0;
  let summaryRevision=0;
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
      license.href = s.licenseCode === 'cc0' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : `https://creativecommons.org/licenses/${s.licenseCode.slice(3)}/4.0/`;
      license.target = '_blank'; license.rel = 'noopener noreferrer'; wrapper.append(node('span',' · '),license);
    }
    return wrapper;
  }
  function details(feature) {
    const p = feature.properties, content = node('div', '', 'water-popup');
    content.append(node('p','WATER GUIDE','eyebrow'),node('h3',p.name),node('p',[p.kind,p.state].filter(Boolean).join(' · ')));
    const linear = feature.geometry.type.includes('LineString');
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
      popup = window.L.popup({maxWidth:340,maxHeight:380}).setLatLng(location || [lat,lng]).setContent(details(feature)).openOn(map);
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
    const visible = D.filter(features,$('search').value,$('water-type').value);
    layers?.clearLayers(); $('water-list').replaceChildren(); $('count').textContent = visible.length;
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
      const button = node('button',p.name,'water-button'); button.type = 'button';
      button.append(node('small',`${p.kind} · ${p.loaded ? `${p.species.length} fish types` : 'Select to discover fish'}`));
      button.onclick = () => { if (map) map.panTo([p.pin[1],p.pin[0]]); select(feature); };
      $('water-list').append(button);
    }
    if (!visible.length) $('water-list').append(node('p',features.length ? 'No waters match these filters.' : 'Water guides will appear here when data is available.','empty-state'));
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
    revision++; clear();
    const area = D.regions[$('region').value]; map?.setView(area.center,area.zoom);
    if (request) $('status').textContent = 'Zoom in, then select Search this area to load water guides.';
    stockingSummary();
  }
  async function load() {
    if (!request || !map || busy) return;
    if (map.getZoom() < 8) { $('status').textContent = 'Zoom in closer to search lakes, rivers, and coastal waters.'; return; }
    const token = ++revision, b = map.getBounds();
    busy = true; $('refresh').disabled = true; clear();
    $('status').textContent = 'Finding water guides in this area…';
    try {
      const bbox = D.boundsQuery([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]);
      const response = await request(bbox), result = D.normalize(response);
      if (token !== revision) return;
      features = result.features; render();
      $('status').textContent = `${features.length} mapped waters loaded. ${response.partial ? 'Some USGS layers are unavailable. ' : ''}${result.limited ? 'Coverage is limited; zoom in to see a smaller area. ' : ''}Select a pin to see fish names and species photos.`;
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
          features=combined.features;render();
          $('stocking-status').textContent=`${combined.matched} stocking entries matched to nearby waters; ${combined.unmatched} could not be matched reliably.${stock.limited?' Only the first 10 entries were checked; zoom in for a smaller area.':''}${stock.rejected?' Some source entries lack eligible event details.':''}`;
        }catch(error){if(token===revision)$('stocking-status').textContent=error.message;}
      }
    } catch (error) {
      if (token === revision) $('status').textContent = `Water guides unavailable. ${error.message}`;
    } finally { busy = false; $('refresh').disabled = !request || !map; }
  }
  $('search').addEventListener('input',render); $('water-type').onchange = render;
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
    layers = window.L.layerGroup().addTo(map); overview(); tiles.addTo(map);
    map.on('moveend',() => {
      if (busy) { revision++; $('status').textContent = 'Map area changed. Select Search this area after the current request finishes.'; }
    });
  } else { mapStatus.hidden = false; mapStatus.textContent = 'The Leaflet map could not load. Check your connection and reload.'; }
  if (map) {
    request = bbox => window.WaterProviders.waters(bbox,window.TrackerNetwork.request);
    $('status').textContent = 'Zoom in, then select Search this area. Select a water pin to see its fish types and species photos.';
  } else $('status').textContent = 'The map must be available before searching for waters.';
  $('refresh').disabled = !request || !map; $('reset-map').disabled = !map;
  render();
  if(map && window.WaterLocation){
    let interacted=false;
    map.on('movestart',()=>{interacted=true;});
    $('region').addEventListener('change',()=>{interacted=true;});
    $('refresh').addEventListener('click',()=>{interacted=true;});
    $('reset-map').addEventListener('click',()=>{interacted=true;});
    window.WaterLocation.detect().then(code=>{
      if(interacted){$('location-status').textContent='Using your selected map area.';return;}
      if(code){
        $('region').value=code;overview();
        $('location-status').textContent=`Starting in ${D.regions[code].label}, estimated from your connection. You can choose another state.`;
      }else $('location-status').textContent='Your state could not be determined. Choose a state using Explore.';
    });
  }else if($('location-status'))$('location-status').textContent='Choose a state using Explore when the map is available.';
})();
