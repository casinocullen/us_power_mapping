/* ============================================================
   map.js - US Power System Map
   Depends on: Leaflet, TopoJSON client, data.js globals,
   generator_data_2024.js globals
   ============================================================ */

(function () {
  'use strict';

  const US_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';
  const EIA_930_BASE_URL = 'https://www.eia.gov/electricity/930-api';
  const GENERATOR_CLUSTER_MAX_ZOOM = 7;
  const DAILY_MIX_REFRESH_MS = 60 * 60 * 1000;

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

  const generatorDataset = window.GENERATOR_PLANT_DATA || { source: null, plants: [] };

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

  const generatorPlants = (generatorDataset.plants || []).map((plant) => {
    const dominantTech = canonicalizeGeneratorTechnologyLabel(Object.keys(plant.tech || {})[0] || 'Other');
    return {
      ...plant,
      dominantTech,
      dominantFuel: normalizeGeneratorTechnology(dominantTech)
    };
  });
  const generatorTypeOptions = Object.keys(GENERATOR_FUEL_STYLES);
  const generatorMaxNameplateMw = Math.max(
    100,
    Math.ceil(
      generatorPlants.reduce((max, plant) => Math.max(max, Number(plant.nmw) || 0), 0) / 100
    ) * 100
  );

  const map = L.map('map', {
    center: [39.5, -97.5],
    zoom: 4,
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
  const layerGeneration = L.layerGroup();
  const layerGenerators = L.layerGroup().addTo(map);

  let generationLegendDate = 'loading latest previous-day EIA data';
  let generationLegendNote = 'Source: EIA Grid Monitor daily fuel mix';
  let generationDataState = 'loading';
  let generationDataDateKey = null;
  let generationRefreshHandle = null;
  let layerControlRef = null;
  let generatorFilterControlRef = null;
  let generatorFilterState = {
    types: new Set(generatorTypeOptions),
    minMw: 0,
    maxMw: generatorMaxNameplateMw
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

  function updateGenerationLayerLabel() {
    if (!layerControlRef) return;
    const labelNode = layerControlRef.querySelector('[data-layer-label="generation"]');
    if (!labelNode) return;
    labelNode.textContent = getGenerationLayerLabelText();
    labelNode.title = generationLegendNote;
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
      .map(([generatorId, technology, primeMover, status, nameplateMw, summerMw]) => `
        <tr>
          <td>${escapeHtml(generatorId || 'N/A')}</td>
          <td>${escapeHtml(canonicalizeGeneratorTechnologyLabel(technology || 'Other'))}</td>
          <td>${escapeHtml(primeMover || 'N/A')}</td>
          <td>${escapeHtml(status || 'N/A')}</td>
          <td>${formatNumber(nameplateMw, 1)}</td>
          <td>${formatNumber(summerMw, 1)}</td>
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
              <td>Unit</td><td>Technology</td><td>Prime Mover</td><td>Status</td><td>Nameplate MW</td><td>Summer MW</td>
            </tr>
          </thead>
          <tbody>${generatorRows}</tbody>
        </table>
      </div>
      <div class="popup-source">Source: EIA Form 860 final 2024 data, released September 9, 2025</div>`;
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
    const scale = Math.sqrt(Math.max(total, 1) / 380000);
    const sizePx = Math.max(66, Math.min(132, Math.round(base * scale)));
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

    L.geoJSON(geojson, {
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
          },
          click(event) {
            const gen = regionGenerationMix[isoKey];
            if (!gen) return;

            L.popup({ maxWidth: 340 })
              .setLatLng(event.latlng)
              .setContent(buildDailyGenerationPopup(isoKey, gen))
              .openOn(map);
          }
        });
      }
    }).addTo(layerRegions);
  }

  function loadTransmission() {
    L.geoJSON(TRANSMISSION_LINES, {
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

  function plantToGeneratorMarker(plant) {
    const fuelStyle = getGeneratorFuelStyle(plant.dominantTech);
    const nameplateMw = Number(plant.nmw) || 0;
    const capacityRadius = 3.8 + Math.sqrt(Math.max(nameplateMw, 1)) / 10.5;
    const baseRadius = Math.max(fuelStyle.radius + 1.6, Math.min(15.5, capacityRadius));
    const zoomBoost = generatorZoomRadiusBoost(map.getZoom()) * 1.15;
    const radius = Math.min(24, baseRadius + zoomBoost);

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
    const nameplateMw = Number(plant.nmw) || 0;
    return generatorFilterState.types.has(plant.dominantFuel)
      && nameplateMw >= generatorFilterState.minMw
      && nameplateMw <= generatorFilterState.maxMw;
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
    renderGenerators();
  }

  function renderGenerators() {
    layerGenerators.clearLayers();
    if (!map.hasLayer(layerGenerators)) return;

    const paddedBounds = map.getBounds().pad(0.2);
    const visiblePlants = generatorPlants.filter((plant) => (
      plantMatchesGeneratorFilters(plant)
      && paddedBounds.contains([plant.lat, plant.lon])
    ));
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

  function buildLegend() {
    const LegendControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd() {
        const div = L.DomUtil.create('div', 'legend-panel');
        L.DomEvent.disableScrollPropagation(div);
        L.DomEvent.disableClickPropagation(div);

        const txRows = [
          { label: '765 kV AC', style: TRANSMISSION_STYLES[765] },
          { label: '500 kV AC', style: TRANSMISSION_STYLES[500] },
          { label: '345 kV AC', style: TRANSMISSION_STYLES[345] },
          { label: 'HVDC', style: DC_STYLE }
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

        const isoRows = Object.entries(ISO_REGIONS)
          .filter(([key]) => key !== 'OTHER')
          .map(([, region]) => `
            <div class="legend-row">
              <span class="legend-swatch" style="background:${region.color}"></span>
              <span>${escapeHtml(region.name)}</span>
            </div>
          `)
          .join('');

        const generatorSource = generatorDataset.source
          ? `Plants: ${escapeHtml(generatorDataset.source.name)} ${escapeHtml(generatorDataset.source.release)}`
          : 'Plants: EIA Form 860 final 2024 data';

        div.innerHTML = `
          <div class="legend-header">
            <h4 class="legend-title">Map Legend</h4>
            <button type="button" class="legend-toggle" data-legend-action="toggle">${isCompactViewport() ? 'Show' : 'Hide'}</button>
          </div>
          <div class="legend-body">
            <h4>ISO / RTO</h4>
            ${isoRows}
            <h4>Transmission</h4>
            ${txRows}
            <div style="margin-top:10px;font-size:9px;color:#484f58">
              ${escapeHtml(generatorSource)}<br>Generation mix: previous full day from EIA Grid Monitor<br>Region mapping to this map's ISO/RTO layer is approximate
            </div>
          </div>`;

        if (isCompactViewport()) {
          div.classList.add('is-collapsed');
        }

        div.addEventListener('click', (event) => {
          const action = event.target?.dataset?.legendAction;
          if (action !== 'toggle') return;
          event.preventDefault();
          div.classList.toggle('is-collapsed');
          event.target.textContent = div.classList.contains('is-collapsed') ? 'Show' : 'Hide';
        });
        return div;
      }
    });

    new LegendControl().addTo(map);
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
            <h4>Generator Filters</h4>
            <button type="button" class="generator-filter-toggle" data-filter-action="toggle">Hide</button>
          </div>
          <div class="generator-filter-body">
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
        syncGeneratorFilterControl();

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
          renderGenerators();
        });

        return div;
      }
    });

    new GeneratorFilterControl().addTo(map);
  }

  function buildLayerControl() {
    const overlays = {
      'ISO/RTO Regions': layerRegions,
      'Transmission Lines': layerTransmission,
      [`<span data-layer-label="generation">${escapeHtml(getGenerationLayerLabelText())}</span>`]: layerGeneration,
      'Generator Plants (EIA 2024)': layerGenerators
    };

    const layerControl = L.control.layers(null, overlays, { position: 'bottomleft', collapsed: isCompactViewport() });
    layerControl.addTo(map);
    layerControlRef = layerControl.getContainer();
    updateGenerationLayerLabel();
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
    await loadRegions();
    loadTransmission();
    loadGenerators();
    buildLegend();
    buildLayerControl();
    buildGeneratorFilterControl();
    await refreshDailyGenerationMix();
    startGenerationMixRefreshLoop();

    map.on('zoomend moveend overlayadd overlayremove', (event) => {
      if (event.type === 'overlayremove' && event.layer === layerGenerators) {
        layerGenerators.clearLayers();
        return;
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

      if (event.type !== 'overlayadd' || event.layer === layerGenerators) {
        renderGenerators();
      }
    });
  }

  init();
})();
