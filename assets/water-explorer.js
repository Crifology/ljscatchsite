(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const D = window.WaterExplorerData, config = window.WaterExplorerConfig;
  window.WaterLocation?.populate($('region'),D.regions,tag=>document.createElement(tag));
  let map, layers, features = [], revision = 0, busy = false;
  let reloadTimer, mapReady=false, fitting=false;
  function scheduleLoad() {
    if(!mapReady)return;
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
  function select(feature, location) {
    if (map) {
      const [lng,lat] = feature.properties.pin;
      window.L.popup({maxWidth:340,maxHeight:380,autoPan:false}).setLatLng(location || [lat,lng]).setContent(details(feature)).openOn(map);
    } else {
      $('water-details').replaceChildren(details(feature)); $('water-dialog').showModal();
    }
  }
  function render() {
    $('clear-fish').disabled = !$('search').value.trim();
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

  function clear() { features = []; map?.closePopup(); render(); }
  function overview() {
    if(!map)return;
    fitting=true; revision++;
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
    $('refresh').disabled=!mapReady;
    scheduleLoad();
  }
  async function load() {
    if (!mapReady) return;
    if(busy){scheduleLoad();return;}
    const token = ++revision;
    busy = true; $('refresh').disabled = true; clear();
    $('status').textContent = 'Loading saved fish locations in this area...';
    try {
      const b=map.getBounds(),area=D.regions[$('region').value];
      const extent=[Math.max(-180,b.getWest()),Math.max(-85,b.getSouth()),Math.min(180,b.getEast()),Math.min(85,b.getNorth())];
      const bounds=area.bounds ? [Math.max(extent[0],area.bounds[0]),Math.max(extent[1],area.bounds[1]),Math.min(extent[2],area.bounds[2]),Math.min(extent[3],area.bounds[3])] : extent;
      if(bounds[0]>=bounds[2] || bounds[1]>=bounds[3]){
        $('status').textContent='Move back into the selected state or choose another region.';return;
      }
      const params=new URLSearchParams({state:$('region').value,bbox:D.boundsQuery(bounds),q:$('search').value,kind:$('water-type').value});
      const response=await fetch(`/api/fish-database?${params}`,{signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('Saved database unavailable');
      const database=await response.json();
      if(!Array.isArray(database.features))throw Error('Invalid saved database');
      if(token!==revision)return;
      features=database.features;
      $('status').textContent=`${features.length} saved water locations. ${database.limited?'Saved results capped; search a fish or zoom in for more. ':''}${database.unavailable?.length||database.partial?.length?'Some state imports are incomplete or unavailable. ':''}Select a fish to filter pins, or a pin to see all its recorded fish.`;
    } catch {
      if(token===revision)$('status').textContent='Saved fish database unavailable. Try Search this area again later.';
    } finally { busy=false; render(); $('refresh').disabled=!mapReady; }
  }
  const filterChanged=()=>{revision++;render();scheduleLoad();};
  $('clear-fish').onclick = () => { $('search').value=''; map?.closePopup(); filterChanged(); };
  $('search').addEventListener('input',filterChanged);
  $('water-type').onchange = () => { $('search').value=''; filterChanged(); };
  $('region').onchange = () => { $('search').value=''; overview(); };
  $('reset-map').onclick = overview; $('refresh').onclick = load;
  $('close-dialog').onclick = () => $('water-dialog').close();
  const mapStatus = $('map-status');
  if (!['http:','https:'].includes(window.location.protocol)) {
    mapStatus.hidden = false; mapStatus.textContent = 'Open the localhost web preview to display the map. Run node server.cjs and visit http://localhost:8000/trackerapp.html.';
  } else if (window.L) {
    map = window.L.map('catch-map',{scrollWheelZoom:true,minZoom:3,maxBounds:[[-85,-180],[85,180]],maxBoundsViscosity:1});
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
      if(fitting)return;
      revision++; render(); scheduleLoad();
    });
  } else { mapStatus.hidden = false; mapStatus.textContent = 'The Leaflet map could not load. Check your connection and reload.'; }
  if (map) overview();
  else $('status').textContent = 'The map must be available before searching for waters.';
  $('refresh').disabled = !mapReady; $('reset-map').disabled = !map;
  render();
})();
