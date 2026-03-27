/* ============================================================
   map.js — US Power System Map
   Depends on: Leaflet, TopoJSON client, data.js globals
   ============================================================ */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────
  const US_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

  const TRANSMISSION_STYLES = {
    765: { color: '#ff006e', weight: 3.5, opacity: 0.95 },
    500: { color: '#ffbe0b', weight: 2.5, opacity: 0.90 },
    345: { color: '#7b2d8b', weight: 1.8, opacity: 0.80 }
  };
  const DC_STYLE = { color: '#00f5d4', weight: 2.5, opacity: 0.95, dashArray: '9 5' };

  // ── Map initialisation ─────────────────────────────────
  const map = L.map('map', {
    center: [39.5, -97.5],
    zoom: 4,
    minZoom: 3,
    maxZoom: 12,
    zoomControl: false,
    attributionControl: true
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Dark no-labels tile layer (labels come from our overlays)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);

  // ── Layer groups ───────────────────────────────────────
  const layerRegions      = L.layerGroup().addTo(map);
  const layerTransmission = L.layerGroup().addTo(map);
  const layerGeneration   = L.layerGroup().addTo(map);

  // ── Utility: SVG pie chart (stroke-dasharray technique) ─
  // Circumference = 2πr; we use r = 15.9155 so C ≈ 100,
  // making "percent = dasharray offset" math trivially simple.
  function buildPieSvg(mix, totalTwh, sizePx) {
    const R = 15.9155;   // radius where C ≈ 100
    const cx = 50, cy = 50, viewSize = 100;

    const total = Object.values(mix).reduce((a, b) => a + b, 0);
    if (total === 0) return '';

    let segments = '';
    let cumulativeOffset = 25; // start at 12 o'clock (offset = 25 shifts 90°)

    Object.entries(mix).forEach(([fuel, twh]) => {
      const pct = (twh / total) * 100;
      const fuelInfo = FUEL_COLORS[fuel] || { color: '#6e7681' };
      // Each segment: dasharray = [pct, 100-pct], offset shifts start position
      segments += `<circle
        cx="${cx}" cy="${cy}" r="${R}"
        fill="none"
        stroke="${fuelInfo.color}"
        stroke-width="32"
        stroke-dasharray="${pct.toFixed(3)} ${(100 - pct).toFixed(3)}"
        stroke-dashoffset="${cumulativeOffset.toFixed(3)}"
      />`;
      cumulativeOffset -= pct;
    });

    const displayGw = (totalTwh / 8.76).toFixed(0); // rough avg GW

    return `<svg xmlns="http://www.w3.org/2000/svg"
      width="${sizePx}" height="${sizePx}"
      viewBox="0 0 ${viewSize} ${viewSize}">
      <!-- background circle -->
      <circle cx="${cx}" cy="${cy}" r="${R + 16}" fill="rgba(13,17,23,0.75)" stroke="#30363d" stroke-width="1"/>
      ${segments}
      <!-- centre hole -->
      <circle cx="${cx}" cy="${cy}" r="${R - 16}" fill="rgba(13,17,23,0.90)"/>
      <!-- GW label -->
      <text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="10" fill="#f0f6fc" font-weight="700" font-family="sans-serif">${displayGw}</text>
      <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="6" fill="#8b949e" font-family="sans-serif">avg GW</text>
    </svg>`;
  }

  // ── Utility: popup HTML for generation marker ──────────
  function buildGenerationPopup(isoKey, genData) {
    const region = ISO_REGIONS[isoKey] || { fullName: isoKey };
    const mix = genData.mix;
    const total = Object.values(mix).reduce((a, b) => a + b, 0);

    const pieSvg = buildPieSvg(mix, genData.totalTwh, 110);

    const rows = Object.entries(mix)
      .sort(([, a], [, b]) => b - a)
      .map(([fuel, twh]) => {
        const fc = FUEL_COLORS[fuel] || { color: '#6e7681', label: fuel };
        const pct = ((twh / total) * 100).toFixed(1);
        return `<tr>
          <td><span class="fuel-dot" style="background:${fc.color}"></span>${fc.label}</td>
          <td>${twh.toFixed(1)} TWh</td>
          <td>${pct}%</td>
        </tr>`;
      }).join('');

    return `
      <div class="popup-header">${region.fullName || isoKey}</div>
      <div class="popup-sub">${genData.totalTwh.toFixed(0)} TWh total · ${genData.peakGw.toFixed(1)} GW peak</div>
      <div class="popup-pie-container">
        ${pieSvg}
        <div style="font-size:11px;color:#8b949e;line-height:1.6">
          ${Object.entries(mix)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 4)
            .map(([f]) => {
              const fc = FUEL_COLORS[f] || { color: '#6e7681', label: f };
              return `<div><span class="fuel-dot" style="background:${fc.color}"></span>${fc.label}</div>`;
            }).join('')}
        </div>
      </div>
      <table class="popup-table">
        <thead><tr style="color:#6e7681;font-size:10px">
          <td>Fuel</td><td>Annual</td><td>Share</td>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="popup-source">Source: EIA Electric Power Annual 2023 (approx.)</div>`;
  }

  // ── Info panel helpers ─────────────────────────────────
  const infoPanel = document.getElementById('info-panel');
  const infoContent = document.getElementById('info-content');

  function showInfo(stateName, isoKey) {
    const region = ISO_REGIONS[isoKey] || ISO_REGIONS.OTHER;
    const gen = GENERATION_MIX[isoKey];

    const totalTwh = gen
      ? `<div class="info-row"><span>Annual Gen</span><span>${gen.totalTwh.toFixed(0)} TWh</span></div>
         <div class="info-row"><span>Peak Demand</span><span>${gen.peakGw.toFixed(1)} GW</span></div>`
      : '';

    infoContent.innerHTML = `
      <h3>${stateName}</h3>
      <span class="iso-badge" style="background:${region.color}22;color:${region.color};border:1px solid ${region.color}44">
        ${region.name}
      </span>
      <div class="info-row"><span>RTO/ISO</span><span>${region.fullName || region.name}</span></div>
      ${totalTwh}
      <div style="font-size:10px;color:#484f58;margin-top:6px">${region.description || ''}</div>`;
    infoPanel.classList.remove('hidden');
  }

  function hideInfo() {
    infoPanel.classList.add('hidden');
  }

  // ── Layer: ISO/RTO regions via US state coloring ────────
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

    // State mesh (borders) rendered separately for crisp edges
    const meshGeojson = topojson.mesh(topology, topology.objects.states,
      (a, b) => a !== b);

    L.geoJSON(geojson, {
      style: feature => {
        const fips = parseInt(feature.id, 10);
        const isoKey = FIPS_TO_ISO[fips] || 'OTHER';
        const region = ISO_REGIONS[isoKey] || ISO_REGIONS.OTHER;
        return {
          fillColor: region.color,
          fillOpacity: 0.28,
          color: 'transparent',
          weight: 0
        };
      },
      onEachFeature: (feature, layer) => {
        const fips = parseInt(feature.id, 10);
        const stateName = FIPS_TO_STATE[fips] || 'Unknown';
        const isoKey = FIPS_TO_ISO[fips] || 'OTHER';
        const region = ISO_REGIONS[isoKey] || ISO_REGIONS.OTHER;

        layer.bindTooltip(
          `<strong>${stateName}</strong> &mdash; ${region.name}`,
          { sticky: true, opacity: 0.95 }
        );

        layer.on({
          mouseover(e) {
            e.target.setStyle({ fillOpacity: 0.55 });
            showInfo(stateName, isoKey);
          },
          mouseout(e) {
            e.target.setStyle({ fillOpacity: 0.28 });
            hideInfo();
          },
          click(e) {
            const gen = GENERATION_MIX[isoKey];
            if (gen) {
              L.popup({ maxWidth: 320 })
                .setLatLng(e.latlng)
                .setContent(buildGenerationPopup(isoKey, gen))
                .openOn(map);
            }
          }
        });
      }
    }).addTo(layerRegions);

    // State border overlay
    L.geoJSON(meshGeojson, {
      style: {
        color: '#30363d',
        weight: 0.8,
        opacity: 0.8,
        fill: false
      }
    }).addTo(layerRegions);
  }

  // ── Layer: Transmission lines ──────────────────────────
  function loadTransmission() {
    L.geoJSON(TRANSMISSION_LINES, {
      style: feature => {
        const { voltageKv, type } = feature.properties;
        if (type === 'DC') return DC_STYLE;
        const style = TRANSMISSION_STYLES[voltageKv] || TRANSMISSION_STYLES[345];
        return { ...style, dashArray: null };
      },
      onEachFeature: (feature, layer) => {
        const { name, voltageKv, type, operator, region } = feature.properties;
        layer.bindTooltip(
          `<strong>${name}</strong><br>${voltageKv} kV ${type} · ${operator || ''}`,
          { sticky: true, opacity: 0.95 }
        );
        layer.on({
          mouseover(e) { e.target.setStyle({ weight: e.target.options.weight + 2, opacity: 1 }); },
          mouseout(e)  { e.target.setStyle({ weight: e.target.options.weight - 2 }); }
        });
      }
    }).addTo(layerTransmission);
  }

  // ── Layer: Generation mix markers ─────────────────────
  function loadGeneration() {
    Object.entries(GENERATION_MIX).forEach(([isoKey, genData]) => {
      const [lon, lat] = genData.center;

      // Scale marker size by sqrt(totalTwh) so areas are proportional to generation
      const base = 64;
      const scale = Math.sqrt(genData.totalTwh / 200);
      const sizePx = Math.round(base * scale);

      const svg = buildPieSvg(genData.mix, genData.totalTwh, sizePx);
      if (!svg) return;

      const icon = L.divIcon({
        html: `<div class="gen-marker-icon">${svg}</div>`,
        iconSize: [sizePx, sizePx],
        iconAnchor: [sizePx / 2, sizePx / 2],
        className: ''
      });

      const marker = L.marker([lat, lon], { icon, zIndexOffset: 500 });
      marker.bindPopup(buildGenerationPopup(isoKey, genData), { maxWidth: 320 });
      marker.bindTooltip(
        `<strong>${(ISO_REGIONS[isoKey] || {}).name || isoKey}</strong><br>Click for generation mix`,
        { opacity: 0.95 }
      );
      marker.addTo(layerGeneration);
    });
  }

  // ── Legend control ─────────────────────────────────────
  function buildLegend() {
    const LegendControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd() {
        const div = L.DomUtil.create('div', 'legend-panel');
        L.DomEvent.disableScrollPropagation(div);
        L.DomEvent.disableClickPropagation(div);

        // ISO/RTO swatches
        const isoRows = Object.entries(ISO_REGIONS)
          .filter(([k]) => k !== 'OTHER')
          .map(([, r]) =>
            `<div class="legend-row">
               <span class="legend-swatch" style="background:${r.color}"></span>
               <span>${r.name}</span>
             </div>`
          ).join('');

        // Transmission line samples
        const txRows = [
          { label: '765 kV AC', style: TRANSMISSION_STYLES[765] },
          { label: '500 kV AC', style: TRANSMISSION_STYLES[500] },
          { label: '345 kV AC', style: TRANSMISSION_STYLES[345] },
          { label: 'HVDC',      style: DC_STYLE }
        ].map(({ label, style }) => {
          const dash = style.dashArray ? `stroke-dasharray="${style.dashArray}"` : '';
          return `<div class="legend-row">
            <svg width="28" height="10" viewBox="0 0 28 10" xmlns="http://www.w3.org/2000/svg">
              <line x1="0" y1="5" x2="28" y2="5"
                stroke="${style.color}" stroke-width="${style.weight}" ${dash} opacity="${style.opacity}"/>
            </svg>
            <span>${label}</span>
          </div>`;
        }).join('');

        // Fuel dots
        const fuelRows = Object.entries(FUEL_COLORS).map(([, { color, label }]) =>
          `<div class="legend-row">
             <span class="legend-dot" style="background:${color}"></span>
             <span>${label}</span>
           </div>`
        ).join('');

        div.innerHTML = `
          <h4>ISO / RTO Regions</h4>
          ${isoRows}
          <h4>Transmission</h4>
          ${txRows}
          <h4>Generation Mix (pie charts)</h4>
          ${fuelRows}
          <div style="margin-top:10px;font-size:9px;color:#484f58">
            Boundaries approximate.<br>Data: EIA 2023 · NERC · FERC
          </div>`;
        return div;
      }
    });

    new LegendControl().addTo(map);
  }

  // ── Layer control (toggle) ─────────────────────────────
  function buildLayerControl() {
    const overlays = {
      'ISO/RTO Regions':    layerRegions,
      'Transmission Lines': layerTransmission,
      'Generation Mix':     layerGeneration
    };
    L.control.layers(null, overlays, { position: 'topright', collapsed: false })
      .addTo(map);
  }

  // ── Bootstrap ─────────────────────────────────────────
  async function init() {
    await loadRegions();
    loadTransmission();
    loadGeneration();
    buildLegend();
    buildLayerControl();
  }

  init();
})();
