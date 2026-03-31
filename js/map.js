/* ============================================================
   map.js - US Power System Map
   Depends on: Leaflet, TopoJSON client, data.js globals,
   lazy-loaded 860M generator JSON assets
   ============================================================ */

(function () {
  'use strict';

  const US_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';
  const EIA_930_BASE_URL = 'https://www.eia.gov/electricity/930-api';
  const GENERATOR_DATA_URL = 'data/generator_data_860m.json';
  const PLANNED_GENERATOR_DATA_URL = 'data/planned_generator_data_860m.json';
  const GENERATOR_CLUSTER_MAX_ZOOM = 7;
  const DAILY_MIX_REFRESH_MS = 60 * 60 * 1000;
  const DATASET_CACHE_VERSION = document.querySelector('meta[name="publish_date"]')?.content || '2026-03-30';
  const DATASET_CACHE_NAME = `us-power-map-datasets-${DATASET_CACHE_VERSION}`;
  const DEFAULT_MAP_CENTER = [39.5, -97.5];
  const DEFAULT_MAP_ZOOM = 5;

  const TRANSMISSION_STYLES = {
    765: { color: '#ff006e', weight: 3.5, opacity: 0.95 },
    500: { color: '#ffbe0b', weight: 2.5, opacity: 0.90 },
    345: { color: '#7b2d8b', weight: 1.8, opacity: 0.80 }
  };

  const DC_STYLE = { color: '#00f5d4', weight: 2.5, opacity: 0.95, dashArray: '9 5' };

  const GENERATOR_FUEL_STYLES = {
    Battery: { color: '#06d6a0', radius: 3.2 },
    Biomass: { color: '#80b918', radius: 3.4 },
    Coal: { color: '#9d8189', radius: 3.8 },
    Geothermal: { color: '#d97706', radius: 3.6 },
    Hydroelectric: { color: '#0077b6', radius: 3.8 },
    'Natural Gas': { color: '#f4a261', radius: 3.6 },
    Nuclear: { color: '#f72585', radius: 4.4 },
    Other: { color: '#6e7681', radius: 3.2 },
    Petroleum: { color: '#b56576', radius: 3.4 },
    'Pumped Storage': { color: '#4361ee', radius: 4.0 },
    Solar: { color: '#ffd60a', radius: 3.4 },
    Wind: { color: '#4cc9f0', radius: 3.4 }
  };

  const DAILY_MIX_REGION_MAP = {
    CAISO: { respondents: ['CAL'], timeZone: 'Pacific', sourceLabel: 'California' },
    ERCOT: { respondents: ['TEX'], timeZone: 'Central', sourceLabel: 'Texas' },
    MISO: { respondents: ['MIDW'], timeZone: 'Eastern', sourceLabel: 'Midwest' },
    PJM: { respondents: ['MIDA'], timeZone: 'Eastern', sourceLabel: 'Mid-Atlantic' },
    SPP: { respondents: ['CENT'], timeZone: 'Central', sourceLabel: 'Central' },
    NYISO: { respondents: ['NY'], timeZone: 'Eastern', sourceLabel: 'New York' },
    'ISO-NE': { respondents: ['NE'], timeZone: 'Eastern', sourceLabel: 'New England' },
    SERC: { respondents: ['CAR', 'FLA', 'SE', 'TEN'], timeZone: 'Eastern', sourceLabel: 'Carolinas + Florida + Southeast + Tennessee' },
    WECC: { respondents: ['NW', 'SW'], timeZone: 'Mountain', sourceLabel: 'Northwest + Southwest' }
  };

  const DAILY_FUEL_LABELS = {
    gas: 'Natural Gas',
    coal: 'Coal',
    nuclear: 'Nuclear',
    wind: 'Wind',
    solar: 'Solar',
    hydro: 'Hydro',
    other: 'Other'
  };

  let generatorDataset = { source: null, plants: [] };
  let plannedGeneratorDataset = { source: null, plants: [] };
  const STATE_ABBR_TO_FIPS = {
    AL: 1, AK: 2, AZ: 4, AR: 5, CA: 6, CO: 8, CT: 9, DE: 10, DC: 11, FL: 12, GA: 13,
    HI: 15, ID: 16, IL: 17, IN: 18, IA: 19, KS: 20, KY: 21, LA: 22, ME: 23, MD: 24,
    MA: 25, MI: 26, MN: 27, MS: 28, MO: 29, MT: 30, NE: 31, NV: 32, NH: 33, NJ: 34,
    NM: 35, NY: 36, NC: 37, ND: 38, OH: 39, OK: 40, OR: 41, PA: 42, RI: 44, SC: 45,
    SD: 46, TN: 47, TX: 48, UT: 49, VT: 50, VA: 51, WA: 53, WV: 54, WI: 55, WY: 56
  };

  function canonicalizeGeneratorTechnologyLabel(technology) {
    const label = String(technology || '').trim();
    const lower = label.toLowerCase();

    if (!label) return 'Other';
    if (lower === 'battery' || lower === 'batteries' || lower.includes('battery storage')) {
      return 'Battery';
    }

    return label;
  }

  function normalizeGeneratorTechnology(technology) {
    const label = canonicalizeGeneratorTechnologyLabel(technology).toLowerCase();

    if (label.includes('hydroelectric pumped')) return 'Pumped Storage';
    if (label.includes('solar')) return 'Solar';
    if (label.includes('wind')) return 'Wind';
    if (label.includes('battery') || label.includes('storage')) return 'Battery';
    if (label.includes('nuclear')) return 'Nuclear';
    if (label.includes('hydro')) return 'Hydroelectric';
    if (label.includes('geothermal')) return 'Geothermal';
    if (label.includes('biomass') || label.includes('wood') || label.includes('landfill') || label.includes('waste')) return 'Biomass';
    if (label.includes('coal')) return 'Coal';
    if (label.includes('petroleum') || label.includes('diesel') || label.includes('oil')) return 'Petroleum';
    if (label.includes('gas')) return 'Natural Gas';
    return 'Other';
  }

  function getGeneratorSummaryLabel(technology) {
    const normalized = normalizeGeneratorTechnology(technology);
    if (normalized === 'Natural Gas') return 'Gas';
    if (normalized === 'Hydroelectric') return 'Hydro';
    if (normalized === 'Pumped Storage') return 'Pumped';
    if (normalized === 'Geothermal') return 'Geo';
    return normalized;
  }

  function mapEiaFuelToMixKey(fuelTypeId) {
    switch (fuelTypeId) {
      case 'BAT':
        return null;
      case 'NG':
        return 'gas';
      case 'COL':
        return 'coal';
      case 'NUC':
        return 'nuclear';
      case 'WND':
        return 'wind';
      case 'SUN':
      case 'SNB':
        return 'solar';
      case 'WAT':
      case 'PS':
        return 'hydro';
      default:
        return 'other';
    }
  }

  function parseEiaTimestamp(value) {
    const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) return null;
    return { month: match[1], day: match[2], year: match[3] };
  }

  function formatEiaDisplayDate(parts) {
    if (!parts) return 'date unavailable';
    const date = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function formatEiaQueryDate(parts) {
    return parts ? `${parts.month}${parts.day}${parts.year}` : '';
  }

  function mapStateAbbrToIso(st) {
    const fips = STATE_ABBR_TO_FIPS[String(st || '').trim().toUpperCase()];
    return FIPS_TO_ISO[fips] || 'OTHER';
  }

  const generatorTypeOptions = Object.keys(GENERATOR_FUEL_STYLES);
  const generatorMaxNameplateMw = 7000;
  const initialUrlState = parseUrlState();
  let generatorPlants = [];
  let plannedGeneratorPlants = [];
  let generatorDatasetPromise = null;
  let plannedGeneratorDatasetPromise = null;
  let visibleGeneratorPlantsCache = [];
  let visiblePlannedGeneratorPlantsCache = [];
  let visibleGeneratorPlantsCacheKey = '';
  let visiblePlannedGeneratorPlantsCacheKey = '';
  let isApplyingUrlState = false;

  function parseUrlState() {
    const hash = window.location.hash.replace(/^#/, '').trim();
    const params = new URLSearchParams(hash);
    const lat = params.has('lat') ? Number(params.get('lat')) : null;
    const lng = params.has('lng') ? Number(params.get('lng')) : null;
    const zoom = params.has('z') ? Number(params.get('z')) : null;

    return {
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      zoom: Number.isFinite(zoom) ? zoom : null,
      layers: new Set((params.get('layers') || '').split(',').filter(Boolean)),
      hasLayers: params.has('layers'),
      iso: params.get('iso') || null,
      minMw: params.has('minMw') ? Number(params.get('minMw')) : null,
      maxMw: params.has('maxMw') ? Number(params.get('maxMw')) : null,
      types: new Set((params.get('types') || '').split(',').filter(Boolean)),
      hasTypes: params.has('types')
    };
  }

  function initialLayerEnabled(id, defaultValue) {
    if (!initialUrlState.hasLayers) return defaultValue;
    return initialUrlState.layers.has(id);
  }

  function normalizeGeneratorPlants(plants) {
    return (plants || []).map((plant) => {
      const dominantTech = canonicalizeGeneratorTechnologyLabel(Object.keys(plant.tech || {})[0] || 'Other');
      return {
        ...plant,
        dominantTech,
        dominantFuel: normalizeGeneratorTechnology(dominantTech),
        isoRegion: mapStateAbbrToIso(plant.st)
      };
    });
  }

  function normalizePlannedGeneratorPlants(plants) {
    return (plants || []).map((plant) => {
    const dominantTech = canonicalizeGeneratorTechnologyLabel(Object.keys(plant.tech || {})[0] || 'Other');
    return {
      ...plant,
      dominantTech,
      dominantFuel: normalizeGeneratorTechnology(dominantTech),
      isoRegion: mapStateAbbrToIso(plant.st)
    };
    });
  }

  const map = L.map('map', {
    center: initialUrlState.lat !== null && initialUrlState.lng !== null
      ? [initialUrlState.lat, initialUrlState.lng]
      : DEFAULT_MAP_CENTER,
    zoom: initialUrlState.zoom !== null ? initialUrlState.zoom : DEFAULT_MAP_ZOOM,
    minZoom: 3,
    maxZoom: 12,
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  const layerRegions = L.layerGroup().addTo(map);
  const layerTransmission = L.layerGroup().addTo(map);
  const layerHifldTransmission = L.layerGroup().addTo(layerTransmission);
  const layerGeneration = L.layerGroup();
  const layerGenerators = L.layerGroup();
  const layerPlannedGenerators = L.layerGroup();
  const HIFLD_TRANSMISSION_CHUNKS = [
    'data/transmission_lines/Transmission_Lines_20250824_021843_chunk0000.geojson.gz',
    'data/transmission_lines/Transmission_Lines_20250824_021843_chunk0001.geojson.gz',
    'data/transmission_lines/Transmission_Lines_20250824_021843_chunk0002.geojson.gz',
    'data/transmission_lines/Transmission_Lines_20250824_021843_chunk0003.geojson.gz',
    'data/transmission_lines/Transmission_Lines_20250824_021843_chunk0004.geojson.gz'
  ];

  let generationLegendDate = 'loading latest previous-day EIA data';
  let generationLegendNote = 'Source: EIA Grid Monitor daily fuel mix';
  let generationDataState = 'loading';
  let generationDataDateKey = null;
  let generationRefreshHandle = null;
  let hifldTransmissionLoaded = false;
  let hifldTransmissionLoadPromise = null;
  let hifldTransmissionFeatures = [];
  let transmissionFeatureEntries = [];
  let regionFeatureEntries = [];
  let legendControlRef = null;
  let layerControlRef = null;
  let generatorFilterControlRef = null;
  let selectedIsoFilter = initialUrlState.iso || null;
  const regionBoundsByIso = new Map();
  let generatorFilterState = {
    types: initialUrlState.hasTypes && initialUrlState.types.size
      ? new Set(Array.from(initialUrlState.types).filter((type) => generatorTypeOptions.includes(type)))
      : new Set(generatorTypeOptions),
    minMw: Number.isFinite(initialUrlState.minMw) ? Math.max(0, initialUrlState.minMw) : 0,
    maxMw: Number.isFinite(initialUrlState.maxMw)
      ? Math.min(generatorMaxNameplateMw, Math.max(Number.isFinite(initialUrlState.minMw) ? initialUrlState.minMw : 0, initialUrlState.maxMw))
      : generatorMaxNameplateMw
  };
  const LAYER_CONTROL_IDS = {
    regions: 'regions',
    transmission: 'transmission',
    generation: 'generation',
    generators: 'generators',
    plannedGenerators: 'planned-generators'
  };

  function buildPieSvg(mix, sizePx, centerValue, centerSubLabel) {
    const radius = 15.9155;
    const cx = 50;
    const cy = 50;
    const total = Object.values(mix).reduce((sum, value) => sum + value, 0);

    if (total === 0) return '';

    let segments = '';
    let cumulativeOffset = 25;

    Object.entries(mix).forEach(([fuel, value]) => {
      const pct = (value / total) * 100;
      const fuelInfo = FUEL_COLORS[fuel] || { color: '#6e7681' };

      segments += `<circle
        cx="${cx}" cy="${cy}" r="${radius}"
        fill="none"
        stroke="${fuelInfo.color}"
        stroke-width="32"
        stroke-dasharray="${pct.toFixed(3)} ${(100 - pct).toFixed(3)}"
        stroke-dashoffset="${cumulativeOffset.toFixed(3)}"
      />`;

      cumulativeOffset -= pct;
    });

    return `<svg xmlns="http://www.w3.org/2000/svg"
      width="${sizePx}" height="${sizePx}"
      viewBox="0 0 100 100">
      <circle cx="${cx}" cy="${cy}" r="32" fill="rgba(13,17,23,0.75)" stroke="#555" stroke-width="1.5"/>
      ${segments}
      <circle cx="${cx}" cy="${cy}" r="10" fill="rgba(13,17,23,0.92)"/>
      <text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="10" fill="#f0f6fc" font-weight="700" font-family="sans-serif">${centerValue}</text>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="6" fill="#8b949e" font-family="sans-serif">${centerSubLabel}</text>
    </svg>`;
  }

  function formatNumber(value, digits = 0) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return 'N/A';
    }

    return Number(value).toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getGenerationLayerLabelText() {
    return `Generation Mix - ${generationLegendDate}`;
  }

  function getLayerSourceNote(id) {
    if (id === LAYER_CONTROL_IDS.regions) {
      return 'Source: US Atlas TopoJSON (Census TIGER) state boundaries; ISO/RTO mapping is approximate from NERC and ISO/RTO maps.';
    }

    if (id === LAYER_CONTROL_IDS.transmission) {
      return 'Sources: simplified major corridors from FERC/NERC public maps plus HIFLD transmission lines, with HIFLD zoom-filtered and grouped for performance.';
    }

    if (id === LAYER_CONTROL_IDS.generators) {
      return generatorDataset.source
        ? `Source: ${generatorDataset.source.name} ${generatorDataset.source.release}.`
        : 'Source: EIA 860M Preliminary Monthly Electric Generator Inventory.';
    }

    if (id === LAYER_CONTROL_IDS.plannedGenerators) {
      return plannedGeneratorDataset.source
        ? `Source: ${plannedGeneratorDataset.source.name} ${plannedGeneratorDataset.source.release}. ${plannedGeneratorDataset.source.notes || ''}`.trim()
        : 'Source: EIA 860M Preliminary Monthly Electric Generator Inventory, Planned tab.';
    }

    if (id === LAYER_CONTROL_IDS.generation) {
      return generationLegendNote;
    }

    return '';
  }

  function updateLayerControlLabel(id, text) {
    if (!layerControlRef) return;
    const labelNode = layerControlRef.querySelector(`[data-layer-label="${id}"]`);
    if (!labelNode) return;
    if (typeof text === 'string') {
      labelNode.textContent = text;
    }
    const sourceNote = getLayerSourceNote(id);
    labelNode.title = sourceNote;
    const rowNode = labelNode.closest('.layer-control-row');
    if (rowNode) rowNode.title = sourceNote;
  }

  function updateGenerationLayerLabel() {
    updateLayerControlLabel(LAYER_CONTROL_IDS.generation, getGenerationLayerLabelText());
  }

  function updateLayerControlTitles() {
    Object.values(LAYER_CONTROL_IDS).forEach((id) => {
      updateLayerControlLabel(id);
    });
    syncLayerControlState();
  }

  function getSelectedIsoBounds() {
    if (!selectedIsoFilter) return null;
    return regionBoundsByIso.get(selectedIsoFilter) || null;
  }

  function featureMatchesSelectedIsoBounds(bounds) {
    const selectedBounds = getSelectedIsoBounds();
    if (!selectedBounds) return true;
    return bounds.intersects(selectedBounds);
  }

  function applyIsoFilter(isoKey) {
    const nextIso = isoKey && isoKey !== selectedIsoFilter ? isoKey : null;
    selectedIsoFilter = nextIso;
    updateLegend();

    if (map.hasLayer(layerRegions)) {
      renderRegions();
    }

    const regionBounds = getSelectedIsoBounds();
    if (regionBounds && regionBounds.isValid()) {
      map.fitBounds(regionBounds.pad(0.1), { maxZoom: 7 });
    } else if (!selectedIsoFilter) {
      map.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
    }

    if (map.hasLayer(layerTransmission)) {
      renderTransmission();
      if (hifldTransmissionLoaded) {
        renderHifldTransmission();
      }
    }

    refreshGeneratorLayers();
    updateUrlFromState();
  }

  function getLayerControlText(id) {
    if (id === LAYER_CONTROL_IDS.regions) return 'ISO/RTO Regions';
    if (id === LAYER_CONTROL_IDS.transmission) return 'Transmission Lines';
    if (id === LAYER_CONTROL_IDS.generation) return getGenerationLayerLabelText();
    if (id === LAYER_CONTROL_IDS.generators) return 'Existing Generators';
    if (id === LAYER_CONTROL_IDS.plannedGenerators) return 'Planned Generators';
    return '';
  }

  function getLayerControlItems() {
    return [
      { id: LAYER_CONTROL_IDS.regions, layer: layerRegions },
      { id: LAYER_CONTROL_IDS.transmission, layer: layerTransmission },
      { id: LAYER_CONTROL_IDS.generators, layer: layerGenerators },
      { id: LAYER_CONTROL_IDS.plannedGenerators, layer: layerPlannedGenerators },
      { id: LAYER_CONTROL_IDS.generation, layer: layerGeneration }
    ];
  }

  function getLayerControlBodyHtml() {
    return getLayerControlItems()
      .map(({ id, layer }) => `
        <label class="layer-control-row" title="${escapeHtml(getLayerSourceNote(id))}">
          <input type="checkbox" data-layer-toggle="${escapeHtml(id)}" ${map.hasLayer(layer) ? 'checked' : ''}>
          <span class="layer-control-label" data-layer-label="${escapeHtml(id)}">${escapeHtml(getLayerControlText(id))}</span>
        </label>
      `)
      .join('');
  }

  function syncLayerControlState() {
    if (!layerControlRef) return;
    getLayerControlItems().forEach(({ id, layer }) => {
      const input = layerControlRef.querySelector(`[data-layer-toggle="${id}"]`);
      if (input) input.checked = map.hasLayer(layer);
    });
  }

  function clampGeneratorFilterRange(minMw, maxMw) {
    const min = Math.max(0, Math.min(Number(minMw) || 0, generatorMaxNameplateMw));
    const max = Math.max(min, Math.min(Number(maxMw) || generatorMaxNameplateMw, generatorMaxNameplateMw));
    return { minMw: min, maxMw: max };
  }

  function isCompactViewport() {
    return window.matchMedia('(max-width: 760px)').matches;
  }

  function getGeneratorFuelStyle(technology) {
    return GENERATOR_FUEL_STYLES[normalizeGeneratorTechnology(technology)] || GENERATOR_FUEL_STYLES.Other;
  }

  function buildTechnologyBreakdown(techMap) {
    const groupedTech = new Map();

    Object.entries(techMap || {}).forEach(([technology, count]) => {
      const label = canonicalizeGeneratorTechnologyLabel(technology);
      groupedTech.set(label, (groupedTech.get(label) || 0) + count);
    });

    return Array.from(groupedTech.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([technology, count]) => {
        const fuelStyle = getGeneratorFuelStyle(technology);
        return `<div class="legend-row">
          <span class="legend-dot" style="background:${fuelStyle.color}"></span>
          <span>${escapeHtml(technology)} (${count})</span>
        </div>`;
      })
      .join('');
  }

  function buildGeneratorRows(generators) {
    return generators
      .map(([generatorId, technology, primeMover, status, nameplateMw, summerMw, winterMw, operatingMonth, operatingYear]) => `
        <tr>
          <td>${escapeHtml(generatorId || 'N/A')}</td>
          <td>${escapeHtml(canonicalizeGeneratorTechnologyLabel(technology || 'Other'))}</td>
          <td>${escapeHtml(primeMover || 'N/A')}</td>
          <td>${escapeHtml(status || 'N/A')}</td>
          <td>${formatNumber(nameplateMw, 1)}</td>
          <td>${formatNumber(summerMw, 1)}</td>
          <td>${escapeHtml([operatingMonth, operatingYear].filter(Boolean).join('/') || 'N/A')}</td>
        </tr>
      `)
      .join('');
  }

  function buildPlantReferenceLinks(plant) {
    const plantName = plant.pn || 'Unnamed plant';
    const placeBits = [plant.city, plant.st].filter(Boolean).join(', ');
    const baseQuery = [plantName, placeBits, 'power plant'].filter(Boolean).join(' ');
    const wikiQuery = [plantName, placeBits].filter(Boolean).join(' ');
    const mapsQuery = Number.isFinite(Number(plant.lat)) && Number.isFinite(Number(plant.lon))
      ? `${Number(plant.lat)},${Number(plant.lon)}`
      : '';

    const links = [
      {
        label: 'Google',
        url: `https://www.google.com/search?q=${encodeURIComponent(baseQuery)}`
      },
      {
        label: 'Wikipedia',
        url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(wikiQuery)}`
      }
    ];

    if (mapsQuery) {
      links.push({
        label: 'Maps',
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
      });
    }

    return `<div class="popup-link-row">${
      links.map(({ label, url }) => `
        <a class="popup-link-chip" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>
      `).join('')
    }</div>`;
  }

  function buildGeneratorPopup(plant) {
    const location = [plant.city, plant.st].filter(Boolean).join(', ');
    const technologyBreakdown = buildTechnologyBreakdown(plant.tech);
    const generatorRows = buildGeneratorRows(plant.g || []);
    const referenceLinks = buildPlantReferenceLinks(plant);

    return `
      <div class="popup-header">${escapeHtml(plant.pn || 'Unnamed plant')}</div>
      <div class="popup-sub">${escapeHtml(location || 'Unknown location')} · ${formatNumber(plant.gc)} operable units</div>
      ${referenceLinks}
      <table class="popup-table">
        <tbody>
          <tr><td>Utility</td><td>${escapeHtml(plant.u || 'N/A')}</td></tr>
          <tr><td>County</td><td>${escapeHtml(plant.co || 'N/A')}</td></tr>
          <tr><td>Nameplate Capacity</td><td>${formatNumber(plant.nmw, 1)} MW</td></tr>
          <tr><td>Summer Capacity</td><td>${formatNumber(plant.smw, 1)} MW</td></tr>
          <tr><td>Winter Capacity</td><td>${formatNumber(plant.wmw, 1)} MW</td></tr>
        </tbody>
      </table>
      <div class="popup-section-label">Technology Mix</div>
      <div class="popup-tech-list">${technologyBreakdown}</div>
      <div class="popup-section-label">Operable Generator Units</div>
      <div class="popup-scroll">
        <table class="popup-table popup-generator-table">
          <thead>
            <tr style="color:#6e7681;font-size:10px">
              <td>Unit</td><td>Technology</td><td>Prime Mover</td><td>Status</td><td>Nameplate MW</td><td>Summer MW</td><td>Online</td>
            </tr>
          </thead>
          <tbody>${generatorRows}</tbody>
        </table>
      </div>
      <div class="popup-source">Source: ${escapeHtml(generatorDataset.source?.name || 'EIA 860M Preliminary Monthly Electric Generator Inventory')} ${escapeHtml(generatorDataset.source?.release || '')}</div>`;
  }

  function buildClusterTooltip(cluster) {
    return `<strong>${escapeHtml(cluster.tech)}</strong><br>${formatNumber(cluster.count)} plants · ${formatNumber(cluster.nmw, 1)} MW nameplate`;
  }

  function generatorClusterCellSize(zoom) {
    if (zoom <= 3) return 96;
    if (zoom <= 4) return 82;
    if (zoom <= 5) return 68;
    if (zoom <= 6) return 54;
    if (zoom <= GENERATOR_CLUSTER_MAX_ZOOM) return 40;
    return 0;
  }

  function generatorZoomRadiusBoost(zoom) {
    if (zoom <= 6) return 0;
    if (zoom === 7) return 0.8;
    if (zoom === 8) return 1.6;
    if (zoom === 9) return 2.4;
    if (zoom === 10) return 3.4;
    if (zoom === 11) return 4.6;
    return 5.8;
  }

  function buildDailyGenerationPopup(isoKey, genData) {
    const region = ISO_REGIONS[isoKey] || { fullName: isoKey };
    const mix = genData.mix;
    const total = Object.values(mix).reduce((sum, value) => sum + value, 0);
    const avgGw = total / 24 / 1000;
    const pieSvg = buildPieSvg(mix, 110, avgGw.toFixed(1), 'avg GW');

    const rows = Object.entries(mix)
      .sort(([, a], [, b]) => b - a)
      .map(([fuel, mwh]) => {
        const fuelInfo = FUEL_COLORS[fuel] || { color: '#6e7681', label: DAILY_FUEL_LABELS[fuel] || fuel };
        const pct = total > 0 ? ((mwh / total) * 100).toFixed(1) : '0.0';
        return `<tr>
          <td><span class="fuel-dot" style="background:${fuelInfo.color}"></span>${fuelInfo.label || DAILY_FUEL_LABELS[fuel] || fuel}</td>
          <td>${formatNumber(mwh, 0)} MWh</td>
          <td>${pct}%</td>
        </tr>`;
      })
      .join('');

    return `
      <div class="popup-header">${region.fullName || isoKey}</div>
      <div class="popup-sub">${escapeHtml(genData.displayDate)} · ${formatNumber(total, 0)} MWh total · ${avgGw.toFixed(1)} avg GW</div>
      <div class="popup-pie-container">
        ${pieSvg}
        <div style="font-size:11px;color:#8b949e;line-height:1.6">
          ${Object.entries(mix)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 4)
            .map(([fuel]) => {
              const fuelInfo = FUEL_COLORS[fuel] || { color: '#6e7681', label: DAILY_FUEL_LABELS[fuel] || fuel };
              return `<div><span class="fuel-dot" style="background:${fuelInfo.color}"></span>${fuelInfo.label || DAILY_FUEL_LABELS[fuel] || fuel}</div>`;
            })
            .join('')}
        </div>
      </div>
      <table class="popup-table">
        <thead><tr style="color:#6e7681;font-size:10px">
          <td>Fuel</td><td>Daily</td><td>Share</td>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="popup-source">Source: EIA Grid Monitor daily fuel mix · battery storage and other negative values are excluded from pie totals · region mapping is approximate to this map’s ISO/RTO layer</div>`;
  }

  function createGenerationMarkerIcon(genData) {
    const total = Object.values(genData.mix).reduce((sum, value) => sum + value, 0);
    const avgGw = total / 24 / 1000;
    const base = 72;
    const zoom = map.getZoom();
    const zoomScale = zoom <= 4
      ? 1
      : zoom === 5
        ? 1.1
        : zoom === 6
          ? 1.22
          : zoom === 7
            ? 1.36
            : zoom === 8
              ? 1.52
              : zoom === 9
                ? 1.7
                : zoom === 10
                  ? 1.9
                  : zoom === 11
                    ? 2.1
                    : 2.3;
    const scale = Math.sqrt(Math.max(total, 1) / 380000) * zoomScale;
    const sizePx = Math.max(66, Math.min(210, Math.round(base * scale)));
    const svg = buildPieSvg(genData.mix, sizePx, avgGw.toFixed(1), 'avg GW');

    return L.divIcon({
      html: `<div class="gen-marker-icon">${svg}</div>`,
      iconSize: [sizePx, sizePx],
      iconAnchor: [sizePx / 2, sizePx / 2],
      className: ''
    });
  }

  const infoPanel = document.getElementById('info-panel');
  const infoContent = document.getElementById('info-content');
  let generatorSummarySection = null;
  let generatorSummaryContent = null;

  function showInfo(stateName, isoKey) {
    const region = ISO_REGIONS[isoKey] || ISO_REGIONS.OTHER;
    const gen = GENERATION_MIX[isoKey];
    const daily = regionGenerationMix[isoKey];

    let detailRows = '';
    let note = region.description || '';

    if (daily) {
      const total = Object.values(daily.mix).reduce((sum, value) => sum + value, 0);
      detailRows = `<div class="info-row"><span>Daily Gen</span><span>${formatNumber(total, 0)} MWh</span></div>
        <div class="info-row"><span>Mix Date</span><span>${daily.shortDate}</span></div>`;
      note = `Daily fuel mix from EIA Grid Monitor for ${daily.sourceLabel}. Mapping to this map's ISO/RTO regions is approximate.`;
    } else if (gen) {
      detailRows = `<div class="info-row"><span>Annual Gen</span><span>${gen.totalTwh.toFixed(0)} TWh</span></div>
        <div class="info-row"><span>Peak Demand</span><span>${gen.peakGw.toFixed(1)} GW</span></div>`;
    }

    infoContent.innerHTML = `
      <h3>${stateName}</h3>
      <span class="iso-badge" style="background:${region.color}22;color:${region.color};border:1px solid ${region.color}44">
        ${region.name}
      </span>
      <div class="info-row"><span>RTO/ISO</span><span>${region.fullName || region.name}</span></div>
      ${detailRows}
      <div style="font-size:10px;color:#484f58;margin-top:6px">${escapeHtml(note)}</div>`;

    infoPanel.classList.remove('hidden');
  }

  function hideInfo() {
    infoPanel.classList.add('hidden');
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  }

  async function readCachedJson(url) {
    if (!('caches' in window)) return null;

    try {
      const cache = await window.caches.open(DATASET_CACHE_NAME);
      const cachedResponse = await cache.match(url);
      if (!cachedResponse) return null;
      return cachedResponse.json();
    } catch (error) {
      console.warn(`Failed to read cached dataset for ${url}:`, error);
      return null;
    }
  }

  async function writeCachedJson(url, response) {
    if (!('caches' in window)) return;

    try {
      const cache = await window.caches.open(DATASET_CACHE_NAME);
      await cache.put(url, response.clone());
    } catch (error) {
      console.warn(`Failed to cache dataset for ${url}:`, error);
    }
  }

  async function cleanupOldDatasetCaches() {
    if (!('caches' in window)) return;

    try {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames
        .filter((name) => name.startsWith('us-power-map-datasets-') && name !== DATASET_CACHE_NAME)
        .map((name) => window.caches.delete(name)));
    } catch (error) {
      console.warn('Failed to clean up older dataset caches:', error);
    }
  }

  async function fetchCachedDatasetJson(url) {
    const cachedPayload = await readCachedJson(url);
    if (cachedPayload) return cachedPayload;

    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    await writeCachedJson(url, response);
    return response.json();
  }

  function ensureGeneratorDatasetLoaded() {
    if (generatorPlants.length) return Promise.resolve();
    if (generatorDatasetPromise) return generatorDatasetPromise;

    generatorDatasetPromise = fetchCachedDatasetJson(GENERATOR_DATA_URL)
      .then((payload) => {
        generatorDataset = payload || { source: null, plants: [] };
        generatorPlants = normalizeGeneratorPlants(generatorDataset.plants);
        updateLayerControlTitles();
        updateLegend();
      })
      .finally(() => {
        generatorDatasetPromise = null;
      });

    return generatorDatasetPromise;
  }

  function ensurePlannedGeneratorDatasetLoaded() {
    if (plannedGeneratorPlants.length) return Promise.resolve();
    if (plannedGeneratorDatasetPromise) return plannedGeneratorDatasetPromise;

    plannedGeneratorDatasetPromise = fetchCachedDatasetJson(PLANNED_GENERATOR_DATA_URL)
      .then((payload) => {
        plannedGeneratorDataset = payload || { source: null, plants: [] };
        plannedGeneratorPlants = normalizePlannedGeneratorPlants(plannedGeneratorDataset.plants);
        updateLayerControlTitles();
        updateLegend();
      })
      .finally(() => {
        plannedGeneratorDatasetPromise = null;
      });

    return plannedGeneratorDatasetPromise;
  }

  async function fetchLatestDailyMixBounds() {
    const url = `${EIA_930_BASE_URL}/data_bounds/data?type[0]=NG_BY_FUEL`;
    const payload = await fetchJson(url);
    const dailyRow = (payload.data || []).find((row) => row.FREQUENCY === 'D');
    if (!dailyRow) {
      throw new Error('Daily NG_BY_FUEL bounds were not available.');
    }
    return dailyRow;
  }

  async function fetchRegionDailyFuelMix(isoKey, dateParts) {
    const config = DAILY_MIX_REGION_MAP[isoKey];
    if (!config) return null;

    const queryDate = formatEiaQueryDate(dateParts);
    const totals = { gas: 0, coal: 0, nuclear: 0, wind: 0, solar: 0, hydro: 0, other: 0 };

    const responses = await Promise.all(
      config.respondents.map(async (respondentId) => {
        const params = new URLSearchParams();
        params.append('type[0]', 'NG');
        params.append('respondent[0]', respondentId);
        params.append('start', queryDate);
        params.append('end', queryDate);
        params.append('frequency', 'daily');
        params.append('timezone', config.timeZone);

        const payload = await fetchJson(`${EIA_930_BASE_URL}/region_data_by_fuel_type/series_data?${params.toString()}`);
        return Array.isArray(payload) ? payload[0]?.data || [] : [];
      })
    );

    responses.flat().forEach((row) => {
      const fuelKey = mapEiaFuelToMixKey(row.FUEL_TYPE_ID);
      const value = Number(row?.VALUES?.DATA?.[0]) || 0;
      if (!fuelKey) return;
      if (value <= 0) return;
      totals[fuelKey] += value;
    });

    return {
      isoKey,
      mix: totals,
      dateKey: queryDate,
      isoDate: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
      displayDate: formatEiaDisplayDate(dateParts),
      shortDate: `${dateParts.month}/${dateParts.day}/${dateParts.year}`,
      sourceLabel: config.sourceLabel
    };
  }

  const regionGenerationMix = {};

  function clearGenerationMarkers() {
    layerGeneration.clearLayers();
  }

  function renderGenerationMixLayer() {
    clearGenerationMarkers();

    Object.entries(regionGenerationMix).forEach(([isoKey, genData]) => {
      const regionMeta = GENERATION_MIX[isoKey];
      if (!regionMeta) return;

      const [lon, lat] = regionMeta.center;
      const icon = createGenerationMarkerIcon(genData);
      const marker = L.marker([lat, lon], { icon, zIndexOffset: 500 });

      marker.bindPopup(buildDailyGenerationPopup(isoKey, genData), { maxWidth: 340 });
      marker.bindTooltip(
        `<strong>${(ISO_REGIONS[isoKey] || {}).name || isoKey}</strong><br>${escapeHtml(genData.displayDate)} · click for previous-day mix`,
        { opacity: 0.95 }
      );
      marker.addTo(layerGeneration);
    });
  }

  async function refreshDailyGenerationMix() {
    try {
      generationDataState = 'loading';
      generationLegendDate = 'updating latest previous-day EIA data';
      generationLegendNote = 'Source: EIA Grid Monitor daily fuel mix. Battery storage and any negative values are excluded from pie totals.';
      updateGenerationLayerLabel();

      const bounds = await fetchLatestDailyMixBounds();
      const dateParts = parseEiaTimestamp(bounds.LAST_DATA);
      const dateKey = formatEiaQueryDate(dateParts);

      if (!dateKey) {
        throw new Error('Unable to parse the latest EIA daily mix date.');
      }

      if (generationDataDateKey === dateKey) {
        generationDataState = 'ready';
        generationLegendDate = formatEiaDisplayDate(dateParts);
        generationLegendNote = `Latest previous full day available from EIA Grid Monitor: ${formatEiaDisplayDate(dateParts)}. EIA LAST_UPDATE ${bounds.LAST_UPDATE}. Battery storage and any negative values are excluded from pie totals.`;
        updateGenerationLayerLabel();
        return;
      }

      const mixEntries = await Promise.all(
        Object.keys(DAILY_MIX_REGION_MAP).map((isoKey) => fetchRegionDailyFuelMix(isoKey, dateParts))
      );

      Object.keys(regionGenerationMix).forEach((key) => delete regionGenerationMix[key]);
      mixEntries.forEach((entry) => {
        if (entry) {
          regionGenerationMix[entry.isoKey] = entry;
        }
      });

      generationDataDateKey = dateKey;
      generationDataState = 'ready';
      generationLegendDate = formatEiaDisplayDate(dateParts);
      generationLegendNote = `Latest previous full day available from EIA Grid Monitor: ${formatEiaDisplayDate(dateParts)}. EIA LAST_UPDATE ${bounds.LAST_UPDATE}. Battery storage and any negative values are excluded from pie totals. Region mapping to this map's ISO/RTO layer is approximate.`;
      updateGenerationLayerLabel();
      renderGenerationMixLayer();
    } catch (error) {
      console.error('Failed to refresh daily generation mix:', error);
      generationDataState = 'error';
      generationLegendDate = 'daily mix unavailable';
      generationLegendNote = 'Unable to load EIA previous-day generation mix right now.';
      updateGenerationLayerLabel();
      clearGenerationMarkers();
    }
  }

  async function loadRegions() {
    let topology;

    try {
      const res = await fetch(US_ATLAS_URL);
      topology = await res.json();
    } catch (err) {
      console.error('Failed to load US Atlas TopoJSON:', err);
      return;
    }

    const geojson = topojson.feature(topology, topology.objects.states);
    regionFeatureEntries = geojson.features.map((feature) => {
      const fips = parseInt(feature.id, 10);
      const isoKey = FIPS_TO_ISO[fips] || 'OTHER';
      return { feature, isoKey };
    });

    regionFeatureEntries.forEach(({ feature, isoKey }) => {
      const layerBounds = L.geoJSON(feature).getBounds();
      if (layerBounds?.isValid()) {
        const existing = regionBoundsByIso.get(isoKey);
        if (existing) {
          existing.extend(layerBounds);
        } else {
          regionBoundsByIso.set(isoKey, L.latLngBounds(layerBounds.getSouthWest(), layerBounds.getNorthEast()));
        }
      }
    });

    renderRegions();
  }

  function renderRegions() {
    layerRegions.clearLayers();
    if (!map.hasLayer(layerRegions)) return;

    const visibleFeatures = regionFeatureEntries
      .filter(({ isoKey }) => !selectedIsoFilter || isoKey === selectedIsoFilter)
      .map(({ feature }) => feature);

    if (!visibleFeatures.length) return;

    L.geoJSON({ type: 'FeatureCollection', features: visibleFeatures }, {
      style(feature) {
        const fips = parseInt(feature.id, 10);
        const isoKey = FIPS_TO_ISO[fips] || 'OTHER';
        const region = ISO_REGIONS[isoKey] || ISO_REGIONS.OTHER;

        return {
          fillColor: region.color,
          fillOpacity: 0.35,
          color: '#ffffff',
          weight: 1.0,
          opacity: 0.5
        };
      },
      onEachFeature(feature, layer) {
        const fips = parseInt(feature.id, 10);
        const stateName = FIPS_TO_STATE[fips] || 'Unknown';
        const isoKey = FIPS_TO_ISO[fips] || 'OTHER';
        const region = ISO_REGIONS[isoKey] || ISO_REGIONS.OTHER;

        layer.bindTooltip(`<strong>${stateName}</strong> &mdash; ${region.name}`, {
          sticky: true,
          opacity: 0.95
        });

        layer.on({
          mouseover(event) {
            event.target.setStyle({ fillOpacity: 0.60, color: '#ffffff', weight: 1.8, opacity: 0.9 });
            showInfo(stateName, isoKey);
          },
          mouseout(event) {
            event.target.setStyle({ fillOpacity: 0.35, color: '#ffffff', weight: 1.0, opacity: 0.5 });
            hideInfo();
          }
        });
      }
    }).addTo(layerRegions);
  }

  function renderTransmission() {
    layerTransmission.clearLayers();
    layerHifldTransmission.addTo(layerTransmission);
    if (!map.hasLayer(layerTransmission)) return;

    const visibleFeatures = transmissionFeatureEntries
      .filter((entry) => featureMatchesSelectedIsoBounds(entry.bounds))
      .map((entry) => entry.feature);

    if (!visibleFeatures.length) return;

    L.geoJSON({ type: 'FeatureCollection', features: visibleFeatures }, {
      style(feature) {
        const { voltageKv, type } = feature.properties;
        if (type === 'DC') return DC_STYLE;

        const style = TRANSMISSION_STYLES[voltageKv] || TRANSMISSION_STYLES[345];
        return { ...style, dashArray: null };
      },
      onEachFeature(feature, layer) {
        const { name, voltageKv, type, operator } = feature.properties;

        layer.bindTooltip(
          `<strong>${name}</strong><br>${voltageKv} kV ${type} · ${operator || ''}`,
          { sticky: true, opacity: 0.95 }
        );

        layer.on({
          mouseover(event) {
            event.target.setStyle({ weight: event.target.options.weight + 2, opacity: 1 });
          },
          mouseout(event) {
            event.target.setStyle({ weight: event.target.options.weight - 2 });
          }
        });
      }
    }).addTo(layerTransmission);
  }

  function loadTransmission() {
    transmissionFeatureEntries = (TRANSMISSION_LINES.features || [])
      .map((feature) => {
        const bounds = L.geoJSON(feature).getBounds();
        if (!bounds.isValid()) return null;
        return { feature, bounds };
      })
      .filter(Boolean);
    renderTransmission();
  }

  function getHifldTransmissionStyle(feature) {
    const voltage = Number(feature?.properties?.VOLTAGE);
    const type = String(feature?.properties?.TYPE || '').toUpperCase();
    const dashArray = type === 'UNDERGROUND' ? '4 4' : null;

    if (Number.isFinite(voltage) && voltage >= 700) {
      return { ...TRANSMISSION_STYLES[765], weight: 2.6, opacity: 0.6, dashArray };
    }

    if (Number.isFinite(voltage) && voltage >= 500) {
      return { ...TRANSMISSION_STYLES[500], weight: 2.1, opacity: 0.5, dashArray };
    }

    if (Number.isFinite(voltage) && voltage >= 300) {
      return { ...TRANSMISSION_STYLES[345], weight: 1.5, opacity: 0.42, dashArray };
    }

    return { color: '#8ecae6', weight: 1.1, opacity: 0.3, dashArray };
  }

  function getHifldVoltageBucket(feature) {
    const voltage = Number(feature?.properties?.VOLTAGE);
    if (Number.isFinite(voltage) && voltage >= 700) return '765';
    if (Number.isFinite(voltage) && voltage >= 500) return '500';
    if (Number.isFinite(voltage) && voltage >= 300) return '345';
    return 'other';
  }

  function hifldMinVoltageForZoom(zoom) {
    if (zoom <= 4) return 500;
    if (zoom <= 5) return 345;
    if (zoom <= 7) return 230;
    return 0;
  }

  function hifldClusterCellSize(zoom) {
    if (zoom <= 4) return 220;
    if (zoom <= 5) return 170;
    if (zoom <= 6) return 130;
    if (zoom <= 7) return 95;
    if (zoom <= 8) return 70;
    return 0;
  }

  function analyzeHifldFeature(feature) {
    const coordinates = feature?.geometry?.coordinates || [];
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    let totalLength = 0;
    let previous = null;

    coordinates.forEach((coordinate) => {
      const [lon, lat] = coordinate;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);

      if (previous) {
        const dx = lon - previous[0];
        const dy = lat - previous[1];
        totalLength += Math.sqrt(dx * dx + dy * dy);
      }

      previous = [lon, lat];
    });

    if (!Number.isFinite(minLat) || !Number.isFinite(minLon)) {
      return null;
    }

    return {
      feature,
      bounds: L.latLngBounds([minLat, minLon], [maxLat, maxLon]),
      center: [(minLat + maxLat) / 2, (minLon + maxLon) / 2],
      lengthScore: totalLength,
      voltage: Number(feature?.properties?.VOLTAGE) || 0,
      bucket: getHifldVoltageBucket(feature)
    };
  }

  function bindHifldFeatureInteractions(feature, layer) {
    const props = feature.properties || {};
    const voltage = Number(props.VOLTAGE);
    const voltageLabel = Number.isFinite(voltage) && voltage > 0
      ? `${formatNumber(voltage, 0)} kV`
      : escapeHtml(props.VOLT_CLASS || 'Voltage unavailable');
    const ownerLabel = escapeHtml(props.OWNER || 'Owner unavailable');
    const statusLabel = escapeHtml(props.STATUS || 'Status unavailable');
    const typeLabel = escapeHtml(props.TYPE || 'Transmission');
    const idLabel = escapeHtml(props.ID || 'Unknown');

    layer.bindTooltip(
      `<strong>HIFLD Line ${idLabel}</strong><br>${voltageLabel} · ${typeLabel}<br>${ownerLabel}<br>${statusLabel}`,
      { sticky: true, opacity: 0.95 }
    );

    layer.on({
      mouseover(event) {
        event.target.setStyle({ weight: event.target.options.weight + 1.4, opacity: Math.min(1, event.target.options.opacity + 0.25) });
      },
      mouseout(event) {
        event.target.setStyle(getHifldTransmissionStyle(feature));
      }
    });
  }

  function getVisibleHifldFeatures() {
    const paddedBounds = map.getBounds().pad(0.25);
    const zoom = map.getZoom();
    const minVoltage = hifldMinVoltageForZoom(zoom);
    const cellSize = hifldClusterCellSize(zoom);

    const visible = hifldTransmissionFeatures.filter((entry) => (
      entry.bounds.intersects(paddedBounds)
      && entry.voltage >= minVoltage
      && featureMatchesSelectedIsoBounds(entry.bounds)
    ));

    if (cellSize <= 0) {
      return visible.map((entry) => entry.feature);
    }

    const grouped = new Map();

    visible.forEach((entry) => {
      const point = map.project(entry.center, zoom);
      const key = [
        entry.bucket,
        Math.floor(point.x / cellSize),
        Math.floor(point.y / cellSize)
      ].join(':');

      const existing = grouped.get(key);
      if (!existing || entry.voltage > existing.voltage || (entry.voltage === existing.voltage && entry.lengthScore > existing.lengthScore)) {
        grouped.set(key, entry);
      }
    });

    return Array.from(grouped.values()).map((entry) => entry.feature);
  }

  function renderHifldTransmission() {
    layerHifldTransmission.clearLayers();
    if (!map.hasLayer(layerTransmission) || !hifldTransmissionLoaded) return;

    const visibleFeatures = getVisibleHifldFeatures();
    if (!visibleFeatures.length) return;

    L.geoJSON(visibleFeatures, {
      style: getHifldTransmissionStyle,
      onEachFeature: bindHifldFeatureInteractions
    }).addTo(layerHifldTransmission);
  }

  async function fetchHifldChunkFeatures(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Unable to load ${url}: ${response.status}`);
    }

    let text = '';

    if (typeof DecompressionStream === 'function') {
      const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'));
      text = await new Response(decompressed).text();
    } else {
      const buffer = await response.arrayBuffer();
      text = new TextDecoder().decode(buffer);
    }

    return text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }

  async function loadHifldTransmission() {
    if (hifldTransmissionLoaded) return;
    if (hifldTransmissionLoadPromise) return hifldTransmissionLoadPromise;

    hifldTransmissionLoadPromise = (async () => {
      for (const chunkUrl of HIFLD_TRANSMISSION_CHUNKS) {
        const features = await fetchHifldChunkFeatures(chunkUrl);
        hifldTransmissionFeatures.push(
          ...features
            .map((feature) => analyzeHifldFeature(feature))
            .filter(Boolean)
        );
        continue;
        L.geoJSON(features, {
          style: getHifldTransmissionStyle,
          onEachFeature(feature, layer) {
            const props = feature.properties || {};
            const voltage = Number(props.VOLTAGE);
            const voltageLabel = Number.isFinite(voltage) && voltage > 0
              ? `${formatNumber(voltage, 0)} kV`
              : escapeHtml(props.VOLT_CLASS || 'Voltage unavailable');
            const ownerLabel = escapeHtml(props.OWNER || 'Owner unavailable');
            const statusLabel = escapeHtml(props.STATUS || 'Status unavailable');
            const typeLabel = escapeHtml(props.TYPE || 'Transmission');
            const idLabel = escapeHtml(props.ID || 'Unknown');

            layer.bindTooltip(
              `<strong>HIFLD Line ${idLabel}</strong><br>${voltageLabel} · ${typeLabel}<br>${ownerLabel}<br>${statusLabel}`,
              { sticky: true, opacity: 0.95 }
            );

            layer.on({
              mouseover(event) {
                event.target.setStyle({ weight: event.target.options.weight + 1.4, opacity: Math.min(1, event.target.options.opacity + 0.25) });
              },
              mouseout(event) {
                event.target.setStyle(getHifldTransmissionStyle(feature));
              }
            });
          }
        }).addTo(layerHifldTransmission);
      }

      hifldTransmissionLoaded = true;
      renderHifldTransmission();
      hifldTransmissionLoadPromise = null;
    })().catch((error) => {
      hifldTransmissionLoadPromise = null;
      throw error;
    });

    return hifldTransmissionLoadPromise;
  }

  function plantToGeneratorMarker(plant) {
    const fuelStyle = getGeneratorFuelStyle(plant.dominantTech);
    const nameplateMw = Number(plant.nmw) || 0;
    const capacityRadius = 5.2 + Math.sqrt(Math.max(nameplateMw, 1)) / 7.2;
    const baseRadius = Math.max(fuelStyle.radius + 2.8, Math.min(21, capacityRadius));
    const zoomBoost = generatorZoomRadiusBoost(map.getZoom()) * 1.15;
    const radius = Math.min(30, baseRadius + zoomBoost);

    const marker = L.circleMarker([plant.lat, plant.lon], {
      radius,
      fillColor: fuelStyle.color,
      color: '#0d1117',
      weight: 0.5,
      opacity: 0.9,
      fillOpacity: 0.62
    });

    marker.bindTooltip(
      `<strong>${escapeHtml(plant.pn || 'Unnamed plant')}</strong><br>${escapeHtml(plant.dominantTech)} · ${formatNumber(plant.nmw, 1)} MW nameplate · ${formatNumber(plant.gc)} units`,
      { sticky: true, opacity: 0.95 }
    );
    marker.bindPopup(buildGeneratorPopup(plant), { maxWidth: 420 });

    return marker;
  }

  function clusterToMarker(cluster) {
    const fuelStyle = getGeneratorFuelStyle(cluster.tech);
    const diameter = Math.max(28, Math.min(52, 24 + Math.sqrt(cluster.count) * 3.8));
    const icon = L.divIcon({
      html: `<div class="generator-cluster" style="--cluster-color:${fuelStyle.color};width:${diameter}px;height:${diameter}px">
        <span class="generator-cluster-count">${cluster.count}</span>
      </div>`,
      iconSize: [diameter, diameter],
      iconAnchor: [diameter / 2, diameter / 2],
      className: ''
    });

    const marker = L.marker(cluster.center, { icon, zIndexOffset: 300 });
    marker.bindTooltip(buildClusterTooltip(cluster), { sticky: true, opacity: 0.95 });
    marker.on('click', () => {
      map.fitBounds(cluster.bounds.pad(0.25), { maxZoom: GENERATOR_CLUSTER_MAX_ZOOM + 1 });
    });

    return marker;
  }

  function clusterVisibleGenerators(visiblePlants, zoom) {
    const cellSize = generatorClusterCellSize(zoom);
    if (cellSize <= 0) {
      return { plants: visiblePlants, clusters: [] };
    }

    const groups = new Map();

    visiblePlants.forEach((plant) => {
      const point = map.project([plant.lat, plant.lon], zoom);
      const key = [
        plant.dominantFuel,
        Math.floor(point.x / cellSize),
        Math.floor(point.y / cellSize)
      ].join(':');

      if (!groups.has(key)) {
        groups.set(key, {
          tech: plant.dominantTech,
          dominantFuel: plant.dominantFuel,
          plants: [],
          nmw: 0,
          bounds: L.latLngBounds([[plant.lat, plant.lon], [plant.lat, plant.lon]])
        });
      }

      const group = groups.get(key);
      group.plants.push(plant);
      group.nmw += Number(plant.nmw) || 0;
      group.bounds.extend([plant.lat, plant.lon]);
    });

    const plants = [];
    const clusters = [];

    groups.forEach((group) => {
      if (group.plants.length === 1) {
        plants.push(group.plants[0]);
        return;
      }

      clusters.push({
        tech: group.tech,
        dominantFuel: group.dominantFuel,
        count: group.plants.length,
        nmw: group.nmw,
        bounds: group.bounds,
        center: group.bounds.getCenter()
      });
    });

    return { plants, clusters };
  }

  function plantMatchesGeneratorFilters(plant) {
    const nameplateMw = Number(plant.nmw ?? plant.mw) || 0;
    return generatorFilterState.types.has(plant.dominantFuel)
      && nameplateMw >= generatorFilterState.minMw
      && nameplateMw <= generatorFilterState.maxMw;
  }

  function getVisibleGeneratorPlants() {
    const paddedBounds = map.getBounds().pad(0.2);
    return generatorPlants.filter((plant) => (
      plantMatchesGeneratorFilters(plant)
      && (!selectedIsoFilter || plant.isoRegion === selectedIsoFilter)
      && paddedBounds.contains([plant.lat, plant.lon])
    ));
  }

  function getGeneratorVisibilityCacheKey() {
    const bounds = map.getBounds();
    const types = Array.from(generatorFilterState.types).sort().join(',');
    return [
      map.getZoom(),
      bounds.getSouth().toFixed(3),
      bounds.getWest().toFixed(3),
      bounds.getNorth().toFixed(3),
      bounds.getEast().toFixed(3),
      selectedIsoFilter || '',
      generatorFilterState.minMw,
      generatorFilterState.maxMw,
      types
    ].join('|');
  }

  function setVisibleGeneratorPlantsCache(type, plants, cacheKey) {
    if (type === 'existing') {
      visibleGeneratorPlantsCache = plants;
      visibleGeneratorPlantsCacheKey = cacheKey;
      return;
    }

    visiblePlannedGeneratorPlantsCache = plants;
    visiblePlannedGeneratorPlantsCacheKey = cacheKey;
  }

  function clearVisibleGeneratorPlantsCache(type) {
    if (!type || type === 'existing') {
      visibleGeneratorPlantsCache = [];
      visibleGeneratorPlantsCacheKey = '';
    }

    if (!type || type === 'planned') {
      visiblePlannedGeneratorPlantsCache = [];
      visiblePlannedGeneratorPlantsCacheKey = '';
    }
  }

  function getActiveLayerIds() {
    return getLayerControlItems()
      .filter(({ layer }) => map.hasLayer(layer))
      .map(({ id }) => id);
  }

  function hasDefaultViewState() {
    const center = map.getCenter();
    const activeLayers = getActiveLayerIds();
    const defaultLayers = [
      LAYER_CONTROL_IDS.regions,
      LAYER_CONTROL_IDS.transmission,
      LAYER_CONTROL_IDS.generators
    ];

    return Math.abs(center.lat - DEFAULT_MAP_CENTER[0]) < 0.0001
      && Math.abs(center.lng - DEFAULT_MAP_CENTER[1]) < 0.0001
      && map.getZoom() === DEFAULT_MAP_ZOOM
      && activeLayers.length === defaultLayers.length
      && defaultLayers.every((id) => activeLayers.includes(id))
      && !selectedIsoFilter
      && generatorFilterState.minMw === 0
      && generatorFilterState.maxMw === generatorMaxNameplateMw
      && generatorFilterState.types.size === generatorTypeOptions.length;
  }

  function updateUrlFromState() {
    if (isApplyingUrlState) return;

    if (hasDefaultViewState()) {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      return;
    }

    const center = map.getCenter();
    const params = new URLSearchParams();
    params.set('lat', center.lat.toFixed(4));
    params.set('lng', center.lng.toFixed(4));
    params.set('z', String(map.getZoom()));
    params.set('layers', getActiveLayerIds().join(','));

    if (selectedIsoFilter) {
      params.set('iso', selectedIsoFilter);
    }

    if (generatorFilterState.minMw > 0) {
      params.set('minMw', String(generatorFilterState.minMw));
    }

    if (generatorFilterState.maxMw < generatorMaxNameplateMw) {
      params.set('maxMw', String(generatorFilterState.maxMw));
    }

    if (generatorFilterState.types.size !== generatorTypeOptions.length) {
      params.set('types', Array.from(generatorFilterState.types).sort().join(','));
    }

    const nextHash = `#${params.toString()}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }
  }

  function applyUrlState(state) {
    isApplyingUrlState = true;

    selectedIsoFilter = state.iso || null;
    generatorFilterState = {
      types: state.hasTypes && state.types.size
        ? new Set(Array.from(state.types).filter((type) => generatorTypeOptions.includes(type)))
        : new Set(generatorTypeOptions),
      minMw: Number.isFinite(state.minMw) ? Math.max(0, state.minMw) : 0,
      maxMw: Number.isFinite(state.maxMw)
        ? Math.min(generatorMaxNameplateMw, Math.max(Number.isFinite(state.minMw) ? state.minMw : 0, state.maxMw))
        : generatorMaxNameplateMw
    };

    if (Number.isFinite(state.lat) && Number.isFinite(state.lng) && Number.isFinite(state.zoom)) {
      map.setView([state.lat, state.lng], state.zoom, { animate: false });
    }

    getLayerControlItems().forEach(({ id, layer }) => {
      const shouldEnable = state.hasLayers
        ? state.layers.has(id)
        : (id === LAYER_CONTROL_IDS.regions || id === LAYER_CONTROL_IDS.transmission || id === LAYER_CONTROL_IDS.generators);

      if (shouldEnable && !map.hasLayer(layer)) {
        map.addLayer(layer);
      } else if (!shouldEnable && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });

    syncGeneratorFilterControl();
    updateLegend();
    updateLayerControlTitles();
    refreshGeneratorLayers();
    isApplyingUrlState = false;
    updateUrlFromState();
  }

  function resetMapToDefaultView() {
    applyUrlState({
      lat: DEFAULT_MAP_CENTER[0],
      lng: DEFAULT_MAP_CENTER[1],
      zoom: DEFAULT_MAP_ZOOM,
      layers: new Set([
        LAYER_CONTROL_IDS.regions,
        LAYER_CONTROL_IDS.transmission,
        LAYER_CONTROL_IDS.generators
      ]),
      hasLayers: true,
      iso: null,
      minMw: 0,
      maxMw: generatorMaxNameplateMw,
      types: new Set(generatorTypeOptions),
      hasTypes: false
    });
  }

  function getVisiblePlannedGeneratorPlants() {
    const paddedBounds = map.getBounds().pad(0.2);
    return plannedGeneratorPlants.filter((plant) => (
      plantMatchesGeneratorFilters(plant)
      && (!selectedIsoFilter || plant.isoRegion === selectedIsoFilter)
      && paddedBounds.contains([plant.lat, plant.lon])
    ));
  }

  function formatCompactMw(value) {
    const mw = Number(value) || 0;
    if (mw >= 1000) {
      return `${(mw / 1000).toFixed(1)} GW`;
    }
    return `${formatNumber(mw, 0)} MW`;
  }

  function updateGeneratorSummaryPanel() {
    if (!generatorSummarySection || !generatorSummaryContent) return;
    const existingLayerOn = map.hasLayer(layerGenerators);
    const plannedLayerOn = map.hasLayer(layerPlannedGenerators);

    if (!existingLayerOn && !plannedLayerOn) {
      generatorSummarySection.classList.add('hidden');
      return;
    }

    const waitingOnExisting = existingLayerOn && !generatorPlants.length && generatorDatasetPromise;
    const waitingOnPlanned = plannedLayerOn && !plannedGeneratorPlants.length && plannedGeneratorDatasetPromise;
    if (waitingOnExisting || waitingOnPlanned) {
      generatorSummarySection.classList.remove('hidden');
      generatorSummaryContent.innerHTML = `
        <div class="summary-sub">Loading generator data...</div>
        <div style="font-size:11px;color:#8b949e">Generator layers will render after their datasets finish loading.</div>`;
      return;
    }

    const cacheKey = getGeneratorVisibilityCacheKey();
    const visibleExistingPlants = existingLayerOn
      ? (visibleGeneratorPlantsCacheKey === cacheKey ? visibleGeneratorPlantsCache : getVisibleGeneratorPlants())
      : [];
    const visiblePlannedPlants = plannedLayerOn
      ? (visiblePlannedGeneratorPlantsCacheKey === cacheKey ? visiblePlannedGeneratorPlantsCache : getVisiblePlannedGeneratorPlants())
      : [];

    if (existingLayerOn && visibleGeneratorPlantsCacheKey !== cacheKey) {
      setVisibleGeneratorPlantsCache('existing', visibleExistingPlants, cacheKey);
    }

    if (plannedLayerOn && visiblePlannedGeneratorPlantsCacheKey !== cacheKey) {
      setVisibleGeneratorPlantsCache('planned', visiblePlannedPlants, cacheKey);
    }

    const visiblePlants = [...visibleExistingPlants, ...visiblePlannedPlants];
    const totalMw = visiblePlants.reduce((sum, plant) => sum + (Number(plant.nmw ?? plant.mw) || 0), 0);

    if (!visiblePlants.length) {
      const emptyLabel = existingLayerOn && plannedLayerOn
        ? '0 existing plants and 0 planned plants in current map view'
        : existingLayerOn
          ? '0 existing plants in current map view'
          : '0 planned plants in current map view';
      generatorSummarySection.classList.remove('hidden');
      generatorSummaryContent.innerHTML = `
        <div class="summary-sub">${emptyLabel}</div>
        <div style="font-size:11px;color:#8b949e">No matching generators are in view for the current map extent and filters.</div>`;
      return;
    }

    const byFuel = new Map();
    visiblePlants.forEach((plant) => {
      const normalized = normalizeGeneratorTechnology(plant.dominantTech);
      const label = getGeneratorSummaryLabel(normalized);
      const fuelStyle = getGeneratorFuelStyle(normalized);
      const current = byFuel.get(normalized) || { label, color: fuelStyle.color, mw: 0 };
      current.mw += Number(plant.nmw ?? plant.mw) || 0;
      byFuel.set(normalized, current);
    });

    let summaryLine = '';
    if (existingLayerOn && plannedLayerOn) {
      summaryLine = `${formatNumber(visibleExistingPlants.length)} of existing plants and ${formatNumber(visiblePlannedPlants.length)} of planned plants in current map view`;
    } else if (existingLayerOn) {
      summaryLine = `${formatNumber(visibleExistingPlants.length)} existing plants in current map view`;
    } else {
      summaryLine = `${formatNumber(visiblePlannedPlants.length)} planned plants in current map view`;
    }

    const rows = Array.from(byFuel.values())
      .sort((a, b) => b.mw - a.mw)
      .slice(0, 6)
      .map((entry) => {
        const width = totalMw > 0 ? Math.max(10, (entry.mw *1.6/ totalMw) * 100) : 0;
        return `<div class="summary-chart-row">
          <span class="summary-chart-label">${escapeHtml(entry.label)}</span>
          <div class="summary-chart-track">
            <div class="summary-chart-fill" style="width:${width}%;background:${entry.color}"></div>
          </div>
          <span class="summary-chart-value">${formatCompactMw(entry.mw)}</span>
        </div>`;
      })
      .join('');

    generatorSummarySection.classList.remove('hidden');
    generatorSummaryContent.innerHTML = `
      <div class="summary-sub">${summaryLine}</div>
      <div class="summary-total">
        <strong>${formatCompactMw(totalMw)}</strong>
        <span>Total</span>
      </div>
      <div class="summary-chart">${rows}</div>`;
  }

  function syncGeneratorFilterControl() {
    if (!generatorFilterControlRef) return;

    generatorFilterControlRef
      .querySelectorAll('input[data-filter-type]')
      .forEach((input) => {
        input.checked = generatorFilterState.types.has(input.value);
      });

    const minInput = generatorFilterControlRef.querySelector('input[data-filter-bound="min"]');
    const maxInput = generatorFilterControlRef.querySelector('input[data-filter-bound="max"]');
    const summaryNode = generatorFilterControlRef.querySelector('[data-filter-summary]');

    if (minInput) minInput.value = generatorFilterState.minMw;
    if (maxInput) maxInput.value = generatorFilterState.maxMw;
    if (summaryNode) {
      summaryNode.textContent = `${generatorFilterState.types.size}/${generatorTypeOptions.length} types | ${formatNumber(generatorFilterState.minMw)}-${formatNumber(generatorFilterState.maxMw)} MW`;
    }
  }

  function applyGeneratorFiltersFromControl() {
    if (!generatorFilterControlRef) return;

    const selectedTypes = new Set(
      Array.from(generatorFilterControlRef.querySelectorAll('input[data-filter-type]:checked'))
        .map((input) => input.value)
    );

    const minInput = generatorFilterControlRef.querySelector('input[data-filter-bound="min"]');
    const maxInput = generatorFilterControlRef.querySelector('input[data-filter-bound="max"]');
    const range = clampGeneratorFilterRange(minInput?.value, maxInput?.value);

    generatorFilterState = {
      types: selectedTypes,
      minMw: range.minMw,
      maxMw: range.maxMw
    };

    syncGeneratorFilterControl();
    refreshGeneratorLayers();
    updateUrlFromState();
  }

  function renderGenerators() {
    layerGenerators.clearLayers();
    if (!map.hasLayer(layerGenerators)) {
      clearVisibleGeneratorPlantsCache('existing');
      return;
    }
    if (!generatorPlants.length) {
      ensureGeneratorDatasetLoaded()
        .then(() => {
          if (map.hasLayer(layerGenerators)) {
            renderGenerators();
            updateGeneratorSummaryPanel();
          }
        })
        .catch((error) => {
          console.error('Failed to load existing generator dataset:', error);
        });
      updateGeneratorSummaryPanel();
      return;
    }

    const cacheKey = getGeneratorVisibilityCacheKey();
    const visiblePlants = getVisibleGeneratorPlants();
    setVisibleGeneratorPlantsCache('existing', visiblePlants, cacheKey);
    const { plants, clusters } = clusterVisibleGenerators(visiblePlants, map.getZoom());

    plants.forEach((plant) => {
      plantToGeneratorMarker(plant).addTo(layerGenerators);
    });

    clusters.forEach((cluster) => {
      clusterToMarker(cluster).addTo(layerGenerators);
    });
  }

  function loadGenerators() {
    renderGenerators();
  }

  function refreshGeneratorLayers() {
    renderGenerators();

    if (!map.hasLayer(layerPlannedGenerators)) {
      layerPlannedGenerators.clearLayers();
      clearVisibleGeneratorPlantsCache('planned');
      updateGeneratorSummaryPanel();
      return Promise.resolve();
    }

    return renderPlannedGenerators()
      .catch((error) => {
        console.error('Failed to render planned generators:', error);
      })
      .finally(() => {
        updateGeneratorSummaryPanel();
      });
  }

  function buildPlannedProjectRows(projects) {
    return projects
      .slice(0, 80)
      .map(([generatorId, projectName, technology, mwTotal, status, primeMover, summerMw, winterMw, proposedMonth, proposedYear]) => `
        <tr>
          <td>${escapeHtml(generatorId || 'Unnamed unit')}</td>
          <td>${escapeHtml(canonicalizeGeneratorTechnologyLabel(technology || 'Other'))}</td>
          <td>${formatNumber(mwTotal, 1)}</td>
          <td>${escapeHtml(status || 'N/A')}</td>
          <td>${escapeHtml(primeMover || 'N/A')}</td>
          <td>${escapeHtml([proposedMonth, proposedYear].filter(Boolean).join('/') || 'N/A')}</td>
        </tr>
      `)
      .join('');
  }

  function buildPlannedGeneratorPopup(record) {
    const location = [record.co, record.st].filter(Boolean).join(', ');
    const technologyBreakdown = buildTechnologyBreakdown(record.tech);
    const projectRows = buildPlannedProjectRows(record.items || []);
    const sourceName = plannedGeneratorDataset.source?.name || 'EIA 860M Preliminary Monthly Electric Generator Inventory';
    const sourceRelease = plannedGeneratorDataset.source?.release || '';
    const extraCount = Math.max(0, (record.items || []).length - 80);

    return `
      <div class="popup-header">${escapeHtml(record.pn || 'Planned generators')}</div>
      <div class="popup-sub">${escapeHtml(location || 'Unknown location')} · ${formatNumber(record.projects)} planned units · ${formatNumber(record.mw, 1)} MW nameplate</div>
      <table class="popup-table">
        <tbody>
          <tr><td>Utility</td><td>${escapeHtml(record.u || 'N/A')}</td></tr>
          <tr><td>County</td><td>${escapeHtml(record.co || 'N/A')}</td></tr>
          <tr><td>Plant ID</td><td>${escapeHtml(record.pc || 'N/A')}</td></tr>
          <tr><td>Summer Capacity</td><td>${formatNumber(record.smw, 1)} MW</td></tr>
          <tr><td>Dominant Tech</td><td>${escapeHtml(record.dominantTech || 'Other')}</td></tr>
        </tbody>
      </table>
      <div class="popup-section-label">Technology Mix</div>
      <div class="popup-tech-list">${technologyBreakdown}</div>
      <div class="popup-section-label">Planned Units</div>
      <div class="popup-scroll">
        <table class="popup-table popup-generator-table">
          <thead>
            <tr style="color:#6e7681;font-size:10px">
              <td>Unit</td><td>Technology</td><td>MW</td><td>Status</td><td>Prime Mover</td><td>Online</td>
            </tr>
          </thead>
          <tbody>${projectRows}</tbody>
        </table>
      </div>
      ${extraCount ? `<div class="popup-source">${formatNumber(extraCount)} additional planned units omitted from this table for readability.</div>` : ''}
      <div class="popup-source">Source: ${escapeHtml(sourceName)} ${escapeHtml(sourceRelease)}</div>`;
  }

  function plantToPlannedGeneratorMarker(record) {
    const fuelStyle = getGeneratorFuelStyle(record.dominantTech);
    const baseRadius = 5.4 + Math.sqrt(Math.max(Number(record.mw) || 1, 1)) / 17;
    const zoomBoost = generatorZoomRadiusBoost(map.getZoom()) * 0.55;
    const radius = Math.min(24, Math.max(fuelStyle.radius + 2.2, baseRadius + zoomBoost));

    const marker = L.circleMarker([record.lat, record.lon], {
      radius,
      fillColor: fuelStyle.color,
      color: '#f0f6fc',
      weight: 0.7,
      opacity: 0.92,
      fillOpacity: 0.42,
      dashArray: '3 2'
    });

    marker.bindTooltip(
      `<strong>${escapeHtml(record.pn || 'Unnamed plant')}</strong><br>${escapeHtml(record.dominantTech)} · ${formatNumber(record.mw, 1)} MW planned · ${formatNumber(record.projects)} units`,
      { sticky: true, opacity: 0.95 }
    );
    marker.bindPopup(buildPlannedGeneratorPopup(record), { maxWidth: 460 });

    return marker;
  }

  function buildPlannedClusterTooltip(cluster) {
    return `<strong>${escapeHtml(cluster.tech)}</strong><br>${formatNumber(cluster.count)} plants · ${formatNumber(cluster.projects)} units · ${formatNumber(cluster.mw, 1)} MW planned`;
  }

  function plannedClusterToMarker(cluster) {
    const fuelStyle = getGeneratorFuelStyle(cluster.tech);
    const diameter = Math.max(28, Math.min(54, 24 + Math.sqrt(cluster.count) * 4.1));
    const icon = L.divIcon({
      html: `<div class="generator-cluster generator-cluster-planned" style="--cluster-color:${fuelStyle.color};width:${diameter}px;height:${diameter}px">
        <span class="generator-cluster-count">${cluster.count}</span>
      </div>`,
      iconSize: [diameter, diameter],
      iconAnchor: [diameter / 2, diameter / 2],
      className: ''
    });

    const marker = L.marker(cluster.center, { icon, zIndexOffset: 320 });
    marker.bindTooltip(buildPlannedClusterTooltip(cluster), { sticky: true, opacity: 0.95 });
    marker.on('click', () => {
      map.fitBounds(cluster.bounds.pad(0.25), { maxZoom: GENERATOR_CLUSTER_MAX_ZOOM + 1 });
    });

    return marker;
  }

  function clusterVisiblePlannedGenerators(visiblePlants, zoom) {
    const cellSize = generatorClusterCellSize(zoom);
    if (cellSize <= 0) {
      return { plants: visiblePlants, clusters: [] };
    }

    const groups = new Map();

    visiblePlants.forEach((record) => {
      const point = map.project([record.lat, record.lon], zoom);
      const key = [
        record.dominantFuel,
        Math.floor(point.x / cellSize),
        Math.floor(point.y / cellSize)
      ].join(':');

      if (!groups.has(key)) {
        groups.set(key, {
          tech: record.dominantTech,
          dominantFuel: record.dominantFuel,
          plants: [],
          projects: 0,
          mw: 0,
          bounds: L.latLngBounds([[record.lat, record.lon], [record.lat, record.lon]])
        });
      }

      const group = groups.get(key);
      group.plants.push(record);
      group.projects += Number(record.projects) || 0;
      group.mw += Number(record.mw) || 0;
      group.bounds.extend([record.lat, record.lon]);
    });

    const plants = [];
    const clusters = [];

    groups.forEach((group) => {
      if (group.plants.length === 1) {
        plants.push(group.plants[0]);
        return;
      }

      clusters.push({
        tech: group.tech,
        dominantFuel: group.dominantFuel,
        count: group.plants.length,
        projects: group.projects,
        mw: group.mw,
        bounds: group.bounds,
        center: group.bounds.getCenter()
      });
    });

    return { plants, clusters };
  }

  async function renderPlannedGenerators() {
    layerPlannedGenerators.clearLayers();
    if (!map.hasLayer(layerPlannedGenerators)) {
      clearVisibleGeneratorPlantsCache('planned');
      return;
    }
    if (!plannedGeneratorPlants.length) {
      try {
        await ensurePlannedGeneratorDatasetLoaded();
      } catch (error) {
        console.error('Failed to load planned generator dataset:', error);
        return;
      }
      if (!map.hasLayer(layerPlannedGenerators)) return;
    }

    const cacheKey = getGeneratorVisibilityCacheKey();
    const visiblePlants = getVisiblePlannedGeneratorPlants();
    setVisibleGeneratorPlantsCache('planned', visiblePlants, cacheKey);
    const { plants, clusters } = clusterVisiblePlannedGenerators(visiblePlants, map.getZoom());

    plants.forEach((record) => {
      plantToPlannedGeneratorMarker(record).addTo(layerPlannedGenerators);
    });

    clusters.forEach((cluster) => {
      plannedClusterToMarker(cluster).addTo(layerPlannedGenerators);
    });
  }

  function getLegendBodyHtml() {
    const sections = [];

    const isoRows = Object.entries(ISO_REGIONS)
      .filter(([key]) => key !== 'OTHER')
      .map(([key, region]) => `
        <button type="button" class="legend-row legend-filter-row${selectedIsoFilter === key ? ' is-active' : ''}" data-iso-filter="${escapeHtml(key)}">
          <span class="legend-swatch" style="background:${region.color}"></span>
          <span>${escapeHtml(region.name)}</span>
        </button>
      `)
      .join('');

    sections.push(`
      <h4>ISO / RTO SELECTOR</h4>
      <button type="button" class="legend-row legend-filter-row${selectedIsoFilter === null ? ' is-active' : ''}" data-iso-filter="">
        <span class="legend-swatch" style="background:linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04))"></span>
        <span>All Regions</span>
      </button>
      ${isoRows}
    `);

    const transmissionRows = [
      { label: 'HVDC', style: DC_STYLE },
      { label: '765+ kV', style: TRANSMISSION_STYLES[765] },
      { label: '500-734 kV', style: TRANSMISSION_STYLES[500] },
      { label: '300-499 kV', style: TRANSMISSION_STYLES[345] }
    ]
      .map(({ label, style }) => {
        const dash = style.dashArray ? `stroke-dasharray="${style.dashArray}"` : '';
        return `<div class="legend-row">
          <svg width="28" height="10" viewBox="0 0 28 10" xmlns="http://www.w3.org/2000/svg">
            <line x1="0" y1="5" x2="28" y2="5"
              stroke="${style.color}" stroke-width="${style.weight}" ${dash} opacity="${style.opacity}"/>
          </svg>
          <span>${label}</span>
        </div>`;
      })
      .join('');

    sections.push(`
      <h4>Transmission</h4>
      ${transmissionRows}
      <div class="legend-row">
        <svg width="28" height="10" viewBox="0 0 28 10" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="5" x2="28" y2="5"
            stroke="#8ecae6" stroke-width="1.1" opacity="0.3"/>
        </svg>
        <span>&lt;300 kV</span>
      </div>
    `);

    const assetRows = [];

    assetRows.push(`
      <div class="legend-row">
        <svg width="28" height="14" viewBox="0 0 28 14" xmlns="http://www.w3.org/2000/svg">
          <circle cx="14" cy="7" r="5" fill="rgba(13,17,23,0.75)" stroke="#555" stroke-width="1.2"/>
          <circle cx="14" cy="7" r="2.6" fill="rgba(13,17,23,0.92)"/>
        </svg>
        <span>Generation Mix Pies</span>
      </div>
    `);

    assetRows.push(`
      <div class="legend-row">
        <svg width="28" height="14" viewBox="0 0 28 14" xmlns="http://www.w3.org/2000/svg">
          <circle cx="14" cy="7" r="4.2" fill="#f4a261" fill-opacity="0.62" stroke="#0d1117" stroke-width="0.7"/>
        </svg>
        <span>Existing Generators</span>
      </div>
    `);

    assetRows.push(`
      <div class="legend-row">
        <svg width="28" height="14" viewBox="0 0 28 14" xmlns="http://www.w3.org/2000/svg">
          <circle cx="14" cy="7" r="4.2" fill="#ffd60a" fill-opacity="0.42" stroke="#f0f6fc" stroke-width="0.7" stroke-dasharray="3 2"/>
        </svg>
        <span>Planned Generators</span>
      </div>
    `);

    sections.push(`
      <h4>Generation Assets</h4>
      ${assetRows.join('')}
    `);

    return sections.join('');
  }

  function updateLegend() {
    if (!legendControlRef) return;
    const body = legendControlRef.querySelector('.legend-section');
    if (!body) return;
    body.innerHTML = getLegendBodyHtml();
  }

  function buildLayerLegendControl() {
    const LegendControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const div = L.DomUtil.create('div', 'legend-panel');
        L.DomEvent.disableScrollPropagation(div);
        L.DomEvent.disableClickPropagation(div);

        div.innerHTML = `
          <div class="legend-header">
            <h4 class="legend-title">Layer Selector</h4>
            <div class="legend-actions">
              <button type="button" class="legend-toggle" data-legend-action="reset">Reset</button>
              <button type="button" class="legend-toggle" data-legend-action="toggle">${isCompactViewport() ? 'Show' : 'Hide'}</button>
            </div>
          </div>
          <div class="legend-body">
            <div class="layer-control-section">
              <h4></h4>
              <div class="layer-control-body">${getLayerControlBodyHtml()}</div>
            </div>
            <div class="legend-separator"></div>
            <div class="legend-section">${getLegendBodyHtml()}</div>
          </div>`;

        if (isCompactViewport()) {
          div.classList.add('is-collapsed');
        }

        div.addEventListener('change', (event) => {
          const toggleId = event.target?.dataset?.layerToggle;
          if (!toggleId) return;
          const layerItem = getLayerControlItems().find((item) => item.id === toggleId);
          if (!layerItem) return;
          if (event.target.checked) {
            map.addLayer(layerItem.layer);
          } else {
            map.removeLayer(layerItem.layer);
          }

          if (toggleId === LAYER_CONTROL_IDS.generators || toggleId === LAYER_CONTROL_IDS.plannedGenerators) {
            refreshGeneratorLayers();
          }

          updateUrlFromState();
        });

        div.addEventListener('click', (event) => {
          const isoButton = event.target?.closest?.('[data-iso-filter]');
          if (isoButton) {
            event.preventDefault();
            applyIsoFilter(isoButton.dataset.isoFilter || null);
            return;
          }

          const action = event.target?.dataset?.legendAction;
          if (action === 'reset') {
            event.preventDefault();
            resetMapToDefaultView();
            return;
          }

          if (action !== 'toggle') return;
          event.preventDefault();
          div.classList.toggle('is-collapsed');
          event.target.textContent = div.classList.contains('is-collapsed') ? 'Show' : 'Hide';
        });
        return div;
      }
    });

    const legend = new LegendControl();
    legend.addTo(map);
    legendControlRef = legend.getContainer();
    layerControlRef = legendControlRef;
    updateLayerControlTitles();
    updateLegend();
  }

  function buildGeneratorFilterControl() {
    const GeneratorFilterControl = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd() {
        const div = L.DomUtil.create('div', 'generator-filter-panel');
        L.DomEvent.disableScrollPropagation(div);
        L.DomEvent.disableClickPropagation(div);

        const typeRows = generatorTypeOptions
          .map((type) => {
            const style = GENERATOR_FUEL_STYLES[type];
            return `<label class="generator-filter-option">
              <input type="checkbox" data-filter-type value="${escapeHtml(type)}" checked>
              <span class="legend-dot" style="background:${style.color}"></span>
              <span>${escapeHtml(type)}</span>
            </label>`;
          })
          .join('');

        div.innerHTML = `
          <div class="generator-filter-header">
            <h4>Generators</h4>
            <button type="button" class="generator-filter-toggle" data-filter-action="toggle">Hide</button>
          </div>
          <div class="generator-filter-body">
            <div class="generator-summary-section hidden" data-generator-summary-section>
              <div class="generator-summary-content" data-generator-summary-content>Loading visible generator summary...</div>
            </div>
            <div class="generator-filter-summary" data-filter-summary></div>
            <div class="generator-filter-actions">
              <button type="button" data-filter-action="all-types">All types</button>
              <button type="button" data-filter-action="clear-types">Clear types</button>
              <button type="button" data-filter-action="reset">Reset</button>
            </div>
            <div class="generator-filter-group">
              <div class="generator-filter-label">Type</div>
              <div class="generator-filter-grid">${typeRows}</div>
            </div>
            <div class="generator-filter-group">
              <div class="generator-filter-label">Nameplate MW</div>
              <div class="generator-filter-range">
                <label>
                  <span>Min</span>
                  <input type="number" min="0" max="${generatorMaxNameplateMw}" step="10" value="0" data-filter-bound="min">
                </label>
                <label>
                  <span>Max</span>
                  <input type="number" min="0" max="${generatorMaxNameplateMw}" step="10" value="${generatorMaxNameplateMw}" data-filter-bound="max">
                </label>
              </div>
            </div>
          </div>`;

        generatorFilterControlRef = div;
        generatorSummarySection = div.querySelector('[data-generator-summary-section]');
        generatorSummaryContent = div.querySelector('[data-generator-summary-content]');
        syncGeneratorFilterControl();
        updateGeneratorSummaryPanel();

        if (isCompactViewport()) {
          div.classList.add('is-collapsed');
          const toggleButton = div.querySelector('[data-filter-action="toggle"]');
          if (toggleButton) toggleButton.textContent = 'Show';
        }

        div.addEventListener('change', (event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) return;
          if (!target.matches('[data-filter-type], [data-filter-bound]')) return;
          applyGeneratorFiltersFromControl();
        });

        div.addEventListener('click', (event) => {
          const action = event.target?.dataset?.filterAction;
          if (!action) return;
          event.preventDefault();

          if (action === 'toggle') {
            div.classList.toggle('is-collapsed');
            event.target.textContent = div.classList.contains('is-collapsed') ? 'Show' : 'Hide';
            return;
          }

          if (action === 'all-types') {
            generatorFilterState.types = new Set(generatorTypeOptions);
          } else if (action === 'clear-types') {
            generatorFilterState.types = new Set();
          } else if (action === 'reset') {
            generatorFilterState = {
              types: new Set(generatorTypeOptions),
              minMw: 0,
              maxMw: generatorMaxNameplateMw
            };
          }

          syncGeneratorFilterControl();
          refreshGeneratorLayers();
          updateUrlFromState();
        });

        return div;
      }
    });

    new GeneratorFilterControl().addTo(map);
  }

  function startGenerationMixRefreshLoop() {
    if (generationRefreshHandle) {
      clearInterval(generationRefreshHandle);
    }
    generationRefreshHandle = window.setInterval(() => {
      refreshDailyGenerationMix();
    }, DAILY_MIX_REFRESH_MS);
  }

  async function init() {
    if (initialLayerEnabled(LAYER_CONTROL_IDS.generators, true)) {
      layerGenerators.addTo(map);
    }
    if (initialLayerEnabled(LAYER_CONTROL_IDS.plannedGenerators, false)) {
      layerPlannedGenerators.addTo(map);
    }
    if (initialLayerEnabled(LAYER_CONTROL_IDS.generation, false)) {
      layerGeneration.addTo(map);
    }
    if (!initialLayerEnabled(LAYER_CONTROL_IDS.regions, true)) {
      map.removeLayer(layerRegions);
    }
    if (!initialLayerEnabled(LAYER_CONTROL_IDS.transmission, true)) {
      map.removeLayer(layerTransmission);
    }

    cleanupOldDatasetCaches();
    await loadRegions();
    loadTransmission();
    loadHifldTransmission().catch((error) => {
      console.error('Failed to load HIFLD transmission layer:', error);
    });
    loadGenerators();
    buildLayerLegendControl();
    buildGeneratorFilterControl();
    await refreshDailyGenerationMix();
    startGenerationMixRefreshLoop();

    map.on('zoomend moveend overlayadd overlayremove', (event) => {
      if (event.type === 'overlayadd' || event.type === 'overlayremove') {
        updateLayerControlTitles();
        updateLegend();
        updateUrlFromState();
      }

      if (event.type === 'overlayremove' && event.layer === layerGenerators) {
        layerGenerators.clearLayers();
      }

      if (event.type === 'overlayremove' && event.layer === layerPlannedGenerators) {
        layerPlannedGenerators.clearLayers();
      }

      if (event.type === 'overlayadd' && event.layer === layerTransmission) {
        renderTransmission();
        loadHifldTransmission().catch((error) => {
          console.error('Failed to load HIFLD transmission layer:', error);
        });
      }

      if (event.type === 'overlayadd' && event.layer === layerRegions) {
        renderRegions();
      }

      if ((event.type === 'zoomend' || event.type === 'moveend') && map.hasLayer(layerTransmission) && hifldTransmissionLoaded) {
        renderHifldTransmission();
      }

      if ((event.type === 'zoomend' || event.type === 'moveend') && map.hasLayer(layerGeneration) && generationDataState === 'ready') {
        renderGenerationMixLayer();
      }

      if ((event.type === 'zoomend' || event.type === 'moveend') && (map.hasLayer(layerGenerators) || map.hasLayer(layerPlannedGenerators))) {
        refreshGeneratorLayers();
      }

      if (event.type === 'zoomend' || event.type === 'moveend') {
        updateUrlFromState();
      }

      if (event.type === 'overlayadd' && event.layer === layerGeneration) {
        if (generationDataState === 'ready') {
          renderGenerationMixLayer();
        } else {
          refreshDailyGenerationMix();
        }
      }

      if (event.type === 'overlayremove' && event.layer === layerGeneration) {
        clearGenerationMarkers();
      }

      if (
        (event.type === 'overlayadd' || event.type === 'overlayremove')
        && (event.layer === layerGenerators || event.layer === layerPlannedGenerators)
      ) {
        refreshGeneratorLayers();
      }
    });

    window.addEventListener('hashchange', () => {
      applyUrlState(parseUrlState());
    });

    updateUrlFromState();

  }

  init();
})();
