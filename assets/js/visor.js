/* =====================================================================
   Mosaico — Visor LEADER · FADETA Tajo-Tajuña
   Stack: MapLibre GL JS 2.4 + vanilla ES2019
   ===================================================================== */
(() => {

const STATE = {
  data: { municipios: [], proyectos: [], edlp: null },
  munById: new Map(),
  sectores: [],
  estados: [],
  lineas: [],
  retos: [],
  filters: {
    sectores: new Set(),
    estados: new Set(),
    lineas: new Set(),
    search: ''
  },
  layers: {
    proyectos: true,
    cobertura: true,
    hidro: false,
    natura: false,
    despob: false
  },
  selectedId: null,
  map: null
};

const fmt = {
  eur: (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n),
  eurShort: (n) => {
    if (n >= 1_000_000) return (n/1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' M€';
    if (n >= 1_000)     return Math.round(n/1_000) + ' k€';
    return Math.round(n) + ' €';
  },
  num: (n) => new Intl.NumberFormat('es-ES').format(n),
  pct: (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n) + ' %'
};

/* --------------------------- 1. Datos --------------------------- */
async function loadData() {
  const [mRes, eRes, pRes] = await Promise.all([
    fetch('data/municipios.json'),
    fetch('data/edlp.json'),
    fetch('data/proyectos.json')
  ]);
  const m = await mRes.json();
  const e = await eRes.json();
  const p = await pRes.json();

  STATE.data.municipios = m.municipios;
  STATE.data.proyectos  = p.proyectos;
  STATE.data.edlp       = e;
  STATE.sectores = e.sectores;
  STATE.estados  = e.estados;
  STATE.lineas   = e.lineas_ayuda;
  STATE.retos    = e.retos_priorizados;

  // index
  m.municipios.forEach(mu => STATE.munById.set(mu.ine, mu));

  // initialise filter selection to "all"
  STATE.sectores.forEach(s => STATE.filters.sectores.add(s.id));
  STATE.estados.forEach(s  => STATE.filters.estados.add(s.id));
  STATE.lineas.forEach(l   => STATE.filters.lineas.add(l.id));
}

/* --------------------------- 2. Mapa --------------------------- */
function initMap() {
  const style = {
    version: 8,
    sources: {
      'carto-light': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · © <a href="https://carto.com/attributions">CARTO</a>'
      }
    },
    layers: [
      { id: 'basemap', type: 'raster', source: 'carto-light' }
    ]
  };

  STATE.map = new maplibregl.Map({
    container: 'map',
    style,
    center: [-2.75, 40.68],
    zoom: 9.4,
    minZoom: 8,
    maxZoom: 14,
    attributionControl: false
  });

  STATE.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  STATE.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  STATE.map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-right');

  STATE.map.on('load', () => {
    addStaticLayers();
    addDataLayers();
    applyFilters();
  });
}

/* --------------------------- 3. Capas estáticas --------------------------- */
function addStaticLayers() {
  // ---- Hidrografía (aprox.) ----
  STATE.map.addSource('hidro', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        // Río Tajuña (W-E)
        {
          type: 'Feature',
          properties: { name: 'Río Tajuña' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [-2.50, 40.78], [-2.6262, 40.7872], [-2.70, 40.78],
              [-2.7411, 40.7411], [-2.80, 40.77], [-2.8694, 40.7603],
              [-2.91, 40.71], [-2.9447, 40.6175], [-2.9853, 40.6028], [-3.044, 40.6353], [-3.10, 40.62]
            ]
          }
        },
        // Río Tajo (E-SW)
        {
          type: 'Feature',
          properties: { name: 'Río Tajo' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [-2.40, 40.78], [-2.50, 40.74], [-2.5917, 40.7000],
              [-2.65, 40.68], [-2.7194, 40.6325], [-2.74, 40.55],
              [-2.7311, 40.4856], [-2.78, 40.49], [-2.8181, 40.4853], [-2.90, 40.46], [-2.97, 40.41]
            ]
          }
        }
      ]
    }
  });

  // Embalses (Entrepeñas + Buendía simplificados)
  STATE.map.addSource('embalses', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Embalse de Entrepeñas' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-2.79, 40.55], [-2.74, 40.55], [-2.68, 40.53], [-2.65, 40.50],
              [-2.69, 40.47], [-2.74, 40.46], [-2.80, 40.48], [-2.82, 40.51], [-2.79, 40.55]
            ]]
          }
        },
        {
          type: 'Feature',
          properties: { name: 'Embalse de Buendía' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-2.62, 40.50], [-2.55, 40.49], [-2.50, 40.47], [-2.51, 40.44],
              [-2.57, 40.43], [-2.62, 40.46], [-2.62, 40.50]
            ]]
          }
        }
      ]
    }
  });

  // Red Natura (orientativa)
  STATE.map.addSource('natura', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'ZEC Sierra de Altomira', tipo: 'ZEC' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-2.85, 40.50], [-2.75, 40.49], [-2.65, 40.47], [-2.60, 40.49],
              [-2.62, 40.55], [-2.72, 40.57], [-2.82, 40.55], [-2.85, 40.50]
            ]]
          }
        },
        {
          type: 'Feature',
          properties: { name: 'ZEPA Riberas del Henares', tipo: 'ZEPA' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-3.05, 40.94], [-2.92, 40.93], [-2.85, 40.94], [-2.83, 40.89],
              [-2.95, 40.87], [-3.05, 40.90], [-3.05, 40.94]
            ]]
          }
        },
        {
          type: 'Feature',
          properties: { name: 'ZEC Valle del Tajuña', tipo: 'ZEC' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-2.95, 40.62], [-2.88, 40.60], [-2.82, 40.62], [-2.80, 40.66],
              [-2.85, 40.70], [-2.91, 40.69], [-2.95, 40.65], [-2.95, 40.62]
            ]]
          }
        }
      ]
    }
  });

  // ---- Embalses fill (siempre visible cuando hidro on) ----
  STATE.map.addLayer({
    id: 'embalses-fill',
    type: 'fill',
    source: 'embalses',
    layout: { visibility: 'none' },
    paint: { 'fill-color': '#9CB7C9', 'fill-opacity': 0.45 }
  });
  STATE.map.addLayer({
    id: 'embalses-stroke',
    type: 'line',
    source: 'embalses',
    layout: { visibility: 'none' },
    paint: { 'line-color': '#5E7E92', 'line-width': 1, 'line-opacity': 0.7 }
  });

  // ---- Hidro lines ----
  STATE.map.addLayer({
    id: 'hidro-line',
    type: 'line',
    source: 'hidro',
    layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#5E89A8', 'line-width': 2.2, 'line-opacity': 0.7 }
  });

  // ---- Natura ----
  STATE.map.addLayer({
    id: 'natura-fill',
    type: 'fill',
    source: 'natura',
    layout: { visibility: 'none' },
    paint: { 'fill-color': '#6B8E4E', 'fill-opacity': 0.15 }
  });
  STATE.map.addLayer({
    id: 'natura-line',
    type: 'line',
    source: 'natura',
    layout: { visibility: 'none' },
    paint: { 'line-color': '#3F5A2C', 'line-width': 1.2, 'line-dasharray': [3, 2], 'line-opacity': 0.7 }
  });
}

/* --------------------------- 4. Capas dinámicas (municipios + proyectos) --------------------------- */
function addDataLayers() {
  STATE.map.addSource('municipios', { type: 'geojson', data: municipiosFC([]) });
  STATE.map.addSource('proyectos',  { type: 'geojson', data: proyectosFC([]) });

  // Despoblación (debajo de todo): círculo rojo cuando pop<150
  STATE.map.addLayer({
    id: 'despob-circle',
    type: 'circle',
    source: 'municipios',
    layout: { visibility: 'none' },
    paint: {
      'circle-color': [
        'interpolate', ['linear'], ['get', 'poblacion'],
        20,  '#B73A3A',
        100, '#D08C4A',
        300, '#E8D27A',
        800, '#CCD9B7',
        2000,'#9DB890'
      ],
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        8, 18, 11, 32
      ],
      'circle-opacity': 0.55,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#fff'
    }
  });

  // Cobertura municipal: círculo gris claro, radio proporcional a inversión total
  STATE.map.addLayer({
    id: 'cobertura-circle',
    type: 'circle',
    source: 'municipios',
    paint: {
      'circle-color': '#2D5A3D',
      'circle-opacity': [
        'interpolate', ['linear'], ['get', 'totalInversion'],
        0, 0.05, 50000, 0.10, 250000, 0.18, 800000, 0.26
      ],
      'circle-radius': [
        'interpolate', ['linear'], ['get', 'totalInversion'],
        0, 8, 50000, 14, 250000, 22, 800000, 32
      ],
      'circle-stroke-color': '#2D5A3D',
      'circle-stroke-opacity': 0.4,
      'circle-stroke-width': 1
    }
  });

  // Etiquetas de municipio (siempre)
  STATE.map.addLayer({
    id: 'municipios-label',
    type: 'symbol',
    source: 'municipios',
    layout: {
      'text-field': ['get', 'nombre'],
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-size': [
        'interpolate', ['linear'], ['get', 'poblacion'],
        50, 9, 500, 10.5, 2000, 12
      ],
      'text-offset': [0, 1.0],
      'text-anchor': 'top',
      'text-optional': true,
      'text-allow-overlap': false
    },
    paint: {
      'text-color': '#3D4540',
      'text-halo-color': '#fff',
      'text-halo-width': 1.5
    }
  });

  // Halo de selección
  STATE.map.addLayer({
    id: 'proyectos-halo',
    type: 'circle',
    source: 'proyectos',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-color': 'transparent',
      'circle-stroke-color': '#1B1F1A',
      'circle-stroke-width': 2,
      'circle-radius': [
        'interpolate', ['linear'], ['get', 'inversion'],
        0, 10, 50000, 13, 150000, 18, 320000, 26
      ]
    }
  });

  // Proyectos: círculos coloreados por sector
  const sectorColor = ['match', ['get', 'sector']];
  STATE.sectores.forEach(s => { sectorColor.push(s.id, s.color); });
  sectorColor.push('#777');

  STATE.map.addLayer({
    id: 'proyectos-circle',
    type: 'circle',
    source: 'proyectos',
    paint: {
      'circle-color': sectorColor,
      'circle-opacity': 0.86,
      'circle-radius': [
        'interpolate', ['linear'], ['get', 'inversion'],
        0, 5, 50000, 8, 150000, 13, 320000, 19
      ],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1.5
    }
  });

  // Interacción
  STATE.map.on('click', 'proyectos-circle', (e) => {
    if (!e.features?.length) return;
    const id = e.features[0].properties.id;
    selectProject(id);
  });

  STATE.map.on('mouseenter', 'proyectos-circle', () => STATE.map.getCanvas().style.cursor = 'pointer');
  STATE.map.on('mouseleave', 'proyectos-circle', () => STATE.map.getCanvas().style.cursor = '');

  STATE.map.on('mouseenter', 'cobertura-circle', () => STATE.map.getCanvas().style.cursor = 'pointer');
  STATE.map.on('mouseleave', 'cobertura-circle', () => STATE.map.getCanvas().style.cursor = '');

  // Popup en hover sobre proyectos
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
  STATE.map.on('mousemove', 'proyectos-circle', (e) => {
    if (!e.features?.length) return;
    const f = e.features[0].properties;
    const mun = STATE.munById.get(f.municipio_ine);
    const sec = STATE.sectores.find(s => s.id === f.sector);
    const est = STATE.estados.find(s => s.id === f.estado);
    popup.setLngLat(e.lngLat)
      .setHTML(`
        <div class="popup-title">${escape(f.promotor)}</div>
        <div class="popup-meta">${escape(mun?.nombre || '')} · <span style="color:${sec?.color}">●</span> ${escape(sec?.nombre || '')}</div>
        <div class="popup-stat"><span>Inversión</span><span class="v">${fmt.eur(+f.inversion)}</span></div>
        <div class="popup-stat"><span>Ayuda</span><span class="v">${fmt.eur(+f.ayuda)}</span></div>
        <div class="popup-stat"><span>Estado</span><span class="v">${escape(est?.nombre || '')}</span></div>
      `)
      .addTo(STATE.map);
  });
  STATE.map.on('mouseleave', 'proyectos-circle', () => popup.remove());

  // Popup en hover sobre municipios (cobertura)
  const popupMun = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14 });
  STATE.map.on('mousemove', 'cobertura-circle', (e) => {
    if (!e.features?.length) return;
    const f = e.features[0].properties;
    popupMun.setLngLat(e.lngLat)
      .setHTML(`
        <div class="popup-title">${escape(f.nombre)}</div>
        <div class="popup-meta">${fmt.num(+f.poblacion)} hab · ${(+f.area_km2).toFixed(0)} km²</div>
        <div class="popup-stat"><span>Proyectos</span><span class="v">${f.totalProyectos}</span></div>
        <div class="popup-stat"><span>Inversión</span><span class="v">${fmt.eurShort(+f.totalInversion)}</span></div>
        <div class="popup-stat"><span>Ayuda</span><span class="v">${fmt.eurShort(+f.totalAyuda)}</span></div>
      `)
      .addTo(STATE.map);
  });
  STATE.map.on('mouseleave', 'cobertura-circle', () => popupMun.remove());
}

/* --------------------------- 5. Construcción de FeatureCollections --------------------------- */
function proyectosFC(proyectosFiltrados) {
  return {
    type: 'FeatureCollection',
    features: proyectosFiltrados.map(p => {
      const mun = STATE.munById.get(p.municipio_ine);
      // jitter para evitar overlap exacto cuando >1 proyecto/muni
      const jitter = jitterFor(p.id);
      return {
        type: 'Feature',
        properties: { ...p },
        geometry: { type: 'Point', coordinates: [mun.lon + jitter[0], mun.lat + jitter[1]] }
      };
    })
  };
}
function jitterFor(id) {
  let h = 0;
  for (let i=0;i<id.length;i++) h = (h*31 + id.charCodeAt(i)) >>> 0;
  const a = (h % 1000) / 1000 * Math.PI * 2;
  const r = 0.012 + ((h >> 10) % 600) / 1000 * 0.018;
  return [Math.cos(a)*r, Math.sin(a)*r*0.6];
}

function municipiosFC(proyectosFiltrados) {
  const aggByMun = new Map();
  proyectosFiltrados.forEach(p => {
    const agg = aggByMun.get(p.municipio_ine) || { count: 0, inv: 0, ayu: 0, emp: 0 };
    agg.count += 1;
    agg.inv += p.inversion;
    agg.ayu += p.ayuda;
    agg.emp += p.empleos;
    aggByMun.set(p.municipio_ine, agg);
  });
  return {
    type: 'FeatureCollection',
    features: STATE.data.municipios.map(mu => {
      const agg = aggByMun.get(mu.ine) || { count: 0, inv: 0, ayu: 0, emp: 0 };
      return {
        type: 'Feature',
        properties: {
          ...mu,
          totalProyectos: agg.count,
          totalInversion: agg.inv,
          totalAyuda: agg.ayu,
          totalEmpleos: agg.emp
        },
        geometry: { type: 'Point', coordinates: [mu.lon, mu.lat] }
      };
    })
  };
}

/* --------------------------- 6. Filtros UI --------------------------- */
function renderFilters() {
  const elSec = document.getElementById('filter-sector');
  elSec.innerHTML = '';
  STATE.sectores.forEach(s => {
    const div = document.createElement('div');
    div.className = 'row active';
    div.dataset.id = s.id;
    div.dataset.group = 'sectores';
    div.innerHTML = `<span class="sw" style="background:${s.color}"></span><span class="lbl">${s.nombre}</span><span class="count" data-count></span>`;
    div.addEventListener('click', () => toggleFilter('sectores', s.id, div));
    elSec.appendChild(div);
  });

  const elEst = document.getElementById('filter-estado');
  elEst.innerHTML = '';
  STATE.estados.forEach(s => {
    const div = document.createElement('div');
    div.className = 'row active';
    div.dataset.id = s.id;
    div.dataset.group = 'estados';
    div.innerHTML = `<span class="sw" style="background:${s.color}"></span><span class="lbl">${s.nombre}</span><span class="count" data-count></span>`;
    div.addEventListener('click', () => toggleFilter('estados', s.id, div));
    elEst.appendChild(div);
  });

  const elLin = document.getElementById('filter-linea');
  elLin.innerHTML = '';
  STATE.lineas.forEach(l => {
    const div = document.createElement('div');
    div.className = 'row active';
    div.dataset.id = l.id;
    div.dataset.group = 'lineas';
    div.innerHTML = `<span class="sw" style="background:var(--accent)"></span><span class="lbl">${l.nombre}</span><span class="count" data-count></span>`;
    div.addEventListener('click', () => toggleFilter('lineas', l.id, div));
    elLin.appendChild(div);
  });

  // Legend at map
  const lg = document.getElementById('legend-sectors');
  lg.innerHTML = '';
  STATE.sectores.forEach(s => {
    const r = document.createElement('div');
    r.className = 'legend-row';
    r.innerHTML = `<span class="sw" style="background:${s.color}"></span><span>${s.nombre}</span>`;
    lg.appendChild(r);
  });
}

function toggleFilter(group, id, el) {
  const set = STATE.filters[group];
  if (set.has(id)) set.delete(id); else set.add(id);
  el.classList.toggle('active', set.has(id));
  applyFilters();
}

function isAllSelected(group) {
  const sourceLen = group === 'sectores' ? STATE.sectores.length
                  : group === 'estados'  ? STATE.estados.length
                  : STATE.lineas.length;
  return STATE.filters[group].size === sourceLen;
}

/* --------------------------- 7. Aplicar filtros ----- ---------------------- */
function getFiltered() {
  const q = STATE.filters.search.trim().toLowerCase();
  return STATE.data.proyectos.filter(p => {
    if (!STATE.filters.sectores.has(p.sector)) return false;
    if (!STATE.filters.estados.has(p.estado)) return false;
    if (!STATE.filters.lineas.has(p.linea)) return false;
    if (q) {
      const mun = STATE.munById.get(p.municipio_ine);
      const hay = (p.promotor + ' ' + (mun?.nombre || '') + ' ' + p.sector).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function applyFilters() {
  const filtered = getFiltered();
  if (STATE.map.isStyleLoaded()) {
    STATE.map.getSource('proyectos').setData(proyectosFC(filtered));
    STATE.map.getSource('municipios').setData(municipiosFC(filtered));
  }
  updateKPIs(filtered);
  updateDashboard(filtered);
  updateFilterCounts();

  const allDefault = isAllSelected('sectores') && isAllSelected('estados') && isAllSelected('lineas') && !STATE.filters.search;
  document.getElementById('reset-filters').style.display = allDefault ? 'none' : 'inline-flex';
}

function updateFilterCounts() {
  const counts = { sectores: {}, estados: {}, lineas: {} };
  STATE.data.proyectos.forEach(p => {
    counts.sectores[p.sector] = (counts.sectores[p.sector] || 0) + 1;
    counts.estados[p.estado]  = (counts.estados[p.estado]  || 0) + 1;
    counts.lineas[p.linea]    = (counts.lineas[p.linea]    || 0) + 1;
  });
  document.querySelectorAll('.filter-group .row').forEach(row => {
    const g = row.dataset.group; const id = row.dataset.id;
    const c = counts[g]?.[id] ?? 0;
    row.querySelector('[data-count]').textContent = c;
  });
}

/* --------------------------- 8. KPIs --------------------------- */
function updateKPIs(filtered) {
  const totals = filtered.reduce((acc, p) => {
    acc.inv += p.inversion; acc.ayu += p.ayuda; acc.emp += p.empleos;
    if (p.estado === 'ejecutado' || p.estado === 'justificado') acc.ayuCert += p.ayuda;
    return acc;
  }, { inv: 0, ayu: 0, emp: 0, ayuCert: 0 });
  document.getElementById('kpi-promotores').textContent = filtered.length;
  document.getElementById('kpi-ayuda').innerHTML = fmt.eurShort(totals.ayu).replace('€','<span class="sub">€</span>');
  document.getElementById('kpi-inversion').innerHTML = fmt.eurShort(totals.inv).replace('€','<span class="sub">€</span>');
  document.getElementById('kpi-empleos').textContent = totals.emp;

  const marco = STATE.data.edlp._meta.presupuesto_total_eur;
  const pct = (totals.ayuCert / marco) * 100;
  document.getElementById('kpi-pct-bar').style.width = Math.min(100, pct).toFixed(1) + '%';
  document.getElementById('kpi-pct-label').textContent = fmt.pct(pct);
}

/* --------------------------- 9. Dashboard --------------------------- */
function updateDashboard(filtered) {
  // 1) por sector
  const bySec = new Map();
  filtered.forEach(p => bySec.set(p.sector, (bySec.get(p.sector) || 0) + p.inversion));
  const maxSec = Math.max(1, ...bySec.values());
  const elSec = document.getElementById('dash-sector');
  elSec.innerHTML = '';
  STATE.sectores
    .map(s => [s, bySec.get(s.id) || 0])
    .sort((a, b) => b[1] - a[1])
    .forEach(([s, v]) => {
      elSec.insertAdjacentHTML('beforeend', `
        <div class="row">
          <div class="lbl"><span class="sw" style="background:${s.color}"></span>${s.nombre}</div>
          <div class="bar"><div class="fill" style="width:${(v/maxSec)*100}%; background:${s.color}"></div></div>
          <div class="val">${fmt.eurShort(v)}</div>
        </div>`);
    });

  // 2) top municipios (por ayuda)
  const byMun = new Map();
  filtered.forEach(p => byMun.set(p.municipio_ine, (byMun.get(p.municipio_ine) || 0) + p.ayuda));
  const ordered = [...byMun.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  const maxMun = Math.max(1, ...ordered.map(o => o[1]));
  const elMun = document.getElementById('dash-muni');
  elMun.innerHTML = '';
  ordered.forEach(([ine, v]) => {
    const mu = STATE.munById.get(ine);
    elMun.insertAdjacentHTML('beforeend', `
      <div class="row">
        <div class="lbl">${escape(mu?.nombre || ine)}</div>
        <div class="bar"><div class="fill" style="width:${(v/maxMun)*100}%"></div></div>
        <div class="val">${fmt.eurShort(v)}</div>
      </div>`);
  });

  // 3) cobertura territorial
  const munSinProyectos = STATE.data.municipios.filter(m => !byMun.has(m.ine));
  const elCob = document.getElementById('dash-cobertura');
  const totalMun = STATE.data.municipios.length;
  const munCubiertos = totalMun - munSinProyectos.length;
  const pctCub = (munCubiertos / totalMun) * 100;
  elCob.innerHTML = `
    <div class="row">
      <div class="lbl">Municipios con proyectos</div>
      <div class="bar"><div class="fill" style="width:${pctCub}%"></div></div>
      <div class="val">${munCubiertos}/${totalMun}</div>
    </div>
    <div class="row">
      <div class="lbl">Sin proyecto LEADER</div>
      <div class="bar"><div class="fill" style="width:${100-pctCub}%; background:#C97B3F"></div></div>
      <div class="val">${munSinProyectos.length}</div>
    </div>
  `;
  const note = document.getElementById('coverage-note');
  if (munSinProyectos.length > 0) {
    note.style.display = 'flex';
    const sample = munSinProyectos.slice(0, 4).map(m => m.nombre).join(', ');
    const tail = munSinProyectos.length > 4 ? ` y ${munSinProyectos.length - 4} más` : '';
    document.getElementById('coverage-note-text').innerHTML =
      `${munSinProyectos.length} municipios sin proyecto bajo los filtros actuales: <em>${sample}${tail}</em>. Considera reforzar comunicación o convocatoria específica.`;
  } else {
    note.style.display = 'none';
  }

  // 4) Retos EDLP (objetivo_edlp R1..R5)
  const byReto = new Map();
  filtered.forEach(p => byReto.set(p.objetivo_edlp, (byReto.get(p.objetivo_edlp) || 0) + 1));
  const maxRet = Math.max(1, ...byReto.values());
  const elRet = document.getElementById('dash-retos');
  elRet.innerHTML = '';
  STATE.retos.forEach(r => {
    const v = byReto.get(r.id) || 0;
    elRet.insertAdjacentHTML('beforeend', `
      <div class="row">
        <div class="lbl">${escape(r.nombre)}</div>
        <div class="bar"><div class="fill" style="width:${(v/maxRet)*100}%"></div></div>
        <div class="val">${v} proy.</div>
      </div>`);
  });
}

/* --------------------------- 10. Ficha proyecto --------------------------- */
function selectProject(id) {
  STATE.selectedId = id;
  const p = STATE.data.proyectos.find(x => x.id === id);
  if (!p) return;
  const mun = STATE.munById.get(p.municipio_ine);
  const sec = STATE.sectores.find(s => s.id === p.sector);
  const est = STATE.estados.find(s => s.id === p.estado);
  const lin = STATE.lineas.find(s => s.id === p.linea);
  const ret = STATE.retos.find(s => s.id === p.objetivo_edlp);
  const pctAyuda = (p.ayuda / p.inversion) * 100;

  const html = `
    <div class="details-head">
      <div class="id">${p.id}</div>
      <h3>${escape(p.promotor)}</h3>
      <div class="meta">
        <span class="pill-sec"><span class="dot" style="background:${sec.color}"></span>${escape(sec.nombre)}</span>
        <span class="pill-sec"><span class="dot" style="background:${est.color}"></span>${escape(est.nombre)}</span>
      </div>
    </div>
    <div class="details-body">
      <div class="field"><span class="k">Municipio</span><span class="v">${escape(mun?.nombre || '')}</span></div>
      <div class="field"><span class="k">Inversión total</span><span class="v">${fmt.eur(p.inversion)}</span></div>
      <div class="field"><span class="k">Ayuda LEADER</span><span class="v">${fmt.eur(p.ayuda)} <span class="muted small">(${pctAyuda.toFixed(0)} %)</span></span></div>
      <div class="field"><span class="k">Línea de ayuda</span><span class="v">${escape(lin?.nombre || '')}</span></div>
      <div class="field"><span class="k">Objetivo EDLP</span><span class="v">${escape(ret?.nombre || '')}</span></div>
      <div class="field"><span class="k">Empleos</span><span class="v">${p.empleos}</span></div>
      <div class="field"><span class="k">Año</span><span class="v">${p.ano}</span></div>
      <div class="descripcion">${escape(p.descripcion)}</div>
    </div>
  `;
  const content = document.getElementById('ficha-content');
  content.innerHTML = html;
  content.classList.remove('hidden');
  document.getElementById('ficha-empty').classList.add('hidden');

  switchTab('ficha');
  highlightProject(id);

  if (mun) {
    STATE.map.flyTo({ center: [mun.lon, mun.lat], zoom: Math.max(STATE.map.getZoom(), 10.5), duration: 700 });
  }
}

function highlightProject(id) {
  if (STATE.map.getLayer('proyectos-halo')) {
    STATE.map.setFilter('proyectos-halo', ['==', ['get', 'id'], id]);
  }
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.getElementById('pane-dash').classList.toggle('hidden', name !== 'dash');
  document.getElementById('pane-ficha').classList.toggle('hidden', name !== 'ficha');
}

/* --------------------------- 11. UI handlers --------------------------- */
function bindUI() {
  // search
  const input = document.getElementById('search-input');
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { STATE.filters.search = input.value; applyFilters(); }, 120);
  });

  // tabs
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  // reset filters chip
  document.getElementById('reset-filters').addEventListener('click', () => {
    STATE.filters.sectores = new Set(STATE.sectores.map(s => s.id));
    STATE.filters.estados  = new Set(STATE.estados.map(s => s.id));
    STATE.filters.lineas   = new Set(STATE.lineas.map(s => s.id));
    STATE.filters.search = '';
    document.getElementById('search-input').value = '';
    document.querySelectorAll('.filter-group .row').forEach(r => r.classList.add('active'));
    applyFilters();
  });

  // layer toggles
  document.querySelectorAll('.layer-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const layer = el.dataset.layer;
      const sw = el.querySelector('.switch');
      const willOn = sw.dataset.state !== 'on';
      sw.dataset.state = willOn ? 'on' : 'off';
      sw.classList.toggle('on', willOn);
      STATE.layers[layer] = willOn;
      syncLayerVisibility();
    });
  });

  // export
  document.getElementById('btn-export').addEventListener('click', () => {
    const filtered = getFiltered();
    const headers = ['id','promotor','municipio','sector','linea','objetivo_edlp','inversion','ayuda','estado','ano','empleos'];
    const rows = filtered.map(p => {
      const mun = STATE.munById.get(p.municipio_ine);
      return [p.id, p.promotor, mun?.nombre || '', p.sector, p.linea, p.objetivo_edlp, p.inversion, p.ayuda, p.estado, p.ano, p.empleos];
    });
    const csv = [headers.join(','), ...rows.map(r => r.map(v => {
      const s = String(v ?? '');
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mosaico_fadeta_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  // share
  document.getElementById('btn-share').addEventListener('click', () => {
    navigator.clipboard?.writeText(location.href).then(() => {
      const b = document.getElementById('btn-share');
      const orig = b.innerHTML;
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg> Copiado';
      setTimeout(() => b.innerHTML = orig, 1400);
    });
  });
}

function syncLayerVisibility() {
  const v = (l, on) => STATE.map.getLayer(l) && STATE.map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none');
  v('proyectos-circle', STATE.layers.proyectos);
  v('proyectos-halo',   STATE.layers.proyectos);
  v('cobertura-circle', STATE.layers.cobertura);
  v('municipios-label', STATE.layers.cobertura);
  v('hidro-line',       STATE.layers.hidro);
  v('embalses-fill',    STATE.layers.hidro);
  v('embalses-stroke',  STATE.layers.hidro);
  v('natura-fill',      STATE.layers.natura);
  v('natura-line',      STATE.layers.natura);
  v('despob-circle',    STATE.layers.despob);

  // si despob ON, oculta cobertura para no solapar
  if (STATE.layers.despob) v('cobertura-circle', false);
}

/* --------------------------- 12. Utils --------------------------- */
function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
}

/* --------------------------- 13. Boot --------------------------- */
(async () => {
  try {
    await loadData();
    renderFilters();
    initMap();
    bindUI();
  } catch (err) {
    console.error('Mosaico boot error', err);
    document.getElementById('map').innerHTML = `<div style="padding:24px; color:#777; font-family:Inter;">Error cargando datos: ${escape(err.message)}</div>`;
  }
})();

})();
