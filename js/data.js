/* ============================================================
   data.js — All embedded data for US Power System Map
   Exposes globals: ISO_REGIONS, FIPS_TO_ISO, FIPS_TO_STATE,
                    FUEL_COLORS, GENERATION_MIX, TRANSMISSION_LINES
   ============================================================ */

// ── ISO/RTO region definitions ──────────────────────────────
window.ISO_REGIONS = {
  CAISO: {
    name: 'CAISO',
    fullName: 'California Independent System Operator',
    color: '#f4a261',
    description: 'Manages 80% of California\'s electric grid; ~52 GW peak demand'
  },
  ERCOT: {
    name: 'ERCOT',
    fullName: 'Electric Reliability Council of Texas',
    color: '#e63946',
    description: 'Operates the Texas Interconnection; ~86 GW peak demand'
  },
  MISO: {
    name: 'MISO',
    fullName: 'Midcontinent Independent System Operator',
    color: '#457b9d',
    description: 'Serves 15 U.S. states and Manitoba; ~124 GW peak demand'
  },
  PJM: {
    name: 'PJM',
    fullName: 'PJM Interconnection',
    color: '#2a9d8f',
    description: 'Largest RTO in North America; ~145 GW peak demand'
  },
  SPP: {
    name: 'SPP',
    fullName: 'Southwest Power Pool',
    color: '#e9c46a',
    description: 'Covers the Central U.S. wind belt; ~58 GW peak demand'
  },
  NYISO: {
    name: 'NYISO',
    fullName: 'New York Independent System Operator',
    color: '#a8dadc',
    description: 'Manages New York\'s bulk electric system; ~34 GW peak demand'
  },
  'ISO-NE': {
    name: 'ISO-NE',
    fullName: 'ISO New England',
    color: '#c77dff',
    description: 'Coordinates New England\'s six-state grid; ~28 GW peak demand'
  },
  SERC: {
    name: 'SERC',
    fullName: 'SERC Reliability Corporation',
    color: '#80b918',
    description: 'Covers 16 southeastern states; ~111 GW peak demand'
  },
  WECC: {
    name: 'WECC (non-CA)',
    fullName: 'Western Electricity Coordinating Council (excl. CAISO)',
    color: '#bc6c25',
    description: 'Oversees the Western Interconnection outside California; ~89 GW peak'
  },
  OTHER: {
    name: 'Other / Isolated',
    fullName: 'Non-RTO / Isolated Systems',
    color: '#6e7681',
    description: 'Includes Alaska and Hawaii isolated grids'
  }
};

// ── FIPS → State name ─────────────────────────────────────
window.FIPS_TO_STATE = {
  1: 'Alabama', 2: 'Alaska', 4: 'Arizona', 5: 'Arkansas', 6: 'California',
  8: 'Colorado', 9: 'Connecticut', 10: 'Delaware', 11: 'District of Columbia',
  12: 'Florida', 13: 'Georgia', 15: 'Hawaii', 16: 'Idaho', 17: 'Illinois',
  18: 'Indiana', 19: 'Iowa', 20: 'Kansas', 21: 'Kentucky', 22: 'Louisiana',
  23: 'Maine', 24: 'Maryland', 25: 'Massachusetts', 26: 'Michigan',
  27: 'Minnesota', 28: 'Mississippi', 29: 'Missouri', 30: 'Montana',
  31: 'Nebraska', 32: 'Nevada', 33: 'New Hampshire', 34: 'New Jersey',
  35: 'New Mexico', 36: 'New York', 37: 'North Carolina', 38: 'North Dakota',
  39: 'Ohio', 40: 'Oklahoma', 41: 'Oregon', 42: 'Pennsylvania',
  44: 'Rhode Island', 45: 'South Carolina', 46: 'South Dakota', 47: 'Tennessee',
  48: 'Texas', 49: 'Utah', 50: 'Vermont', 51: 'Virginia', 53: 'Washington',
  54: 'West Virginia', 55: 'Wisconsin', 56: 'Wyoming'
};

// ── FIPS → ISO/RTO ────────────────────────────────────────
// Each state assigned to the dominant ISO/RTO by load share
window.FIPS_TO_ISO = {
  6:  'CAISO',    // California
  48: 'ERCOT',    // Texas
  // MISO
  17: 'MISO', 18: 'MISO', 19: 'MISO', 26: 'MISO', 27: 'MISO',
  28: 'MISO', 29: 'MISO', 38: 'MISO', 46: 'MISO', 55: 'MISO',
  5:  'MISO', 22: 'MISO', 30: 'MISO',  // AR, LA, MT(east)
  // PJM
  39: 'PJM', 42: 'PJM', 34: 'PJM', 10: 'PJM', 24: 'PJM',
  51: 'PJM', 54: 'PJM', 11: 'PJM', 21: 'PJM',  // DC, KY
  // SERC
  13: 'SERC', 1: 'SERC', 12: 'SERC', 37: 'SERC',
  45: 'SERC', 47: 'SERC',
  // SPP
  20: 'SPP', 40: 'SPP', 31: 'SPP', 35: 'SPP',  // KS, OK, NE, NM(east)
  // NYISO
  36: 'NYISO',
  // ISO-NE
  23: 'ISO-NE', 25: 'ISO-NE', 33: 'ISO-NE',
  44: 'ISO-NE', 50: 'ISO-NE', 9: 'ISO-NE',
  // WECC (non-CA)
  4:  'WECC', 8: 'WECC', 16: 'WECC', 32: 'WECC', 41: 'WECC',
  49: 'WECC', 53: 'WECC', 56: 'WECC',
  // Other/isolated
  2:  'OTHER', 15: 'OTHER'  // AK, HI
};

// ── Fuel type colors ──────────────────────────────────────
window.FUEL_COLORS = {
  gas:     { color: '#f4a261', label: 'Natural Gas' },
  coal:    { color: '#9d8189', label: 'Coal' },
  nuclear: { color: '#f72585', label: 'Nuclear' },
  wind:    { color: '#4cc9f0', label: 'Wind' },
  solar:   { color: '#ffd60a', label: 'Solar' },
  hydro:   { color: '#0077b6', label: 'Hydro' },
  other:   { color: '#6e7681', label: 'Other' }
};

// ── EIA 2023 Generation Mix (approx. TWh) ────────────────
// Source: EIA Electric Power Annual 2023
window.GENERATION_MIX = {
  CAISO: {
    center: [-119.5, 36.7],
    totalTwh: 251.5,
    peakGw: 52.0,
    mix: { gas: 109.2, nuclear: 16.5, hydro: 20.8, wind: 16.3, solar: 80.4, other: 8.3 }
  },
  ERCOT: {
    center: [-99.3, 31.5],
    totalTwh: 526.6,
    peakGw: 85.6,
    mix: { gas: 257.1, coal: 62.8, nuclear: 43.7, wind: 128.0, solar: 30.2, other: 4.8 }
  },
  MISO: {
    center: [-89.5, 43.0],
    totalTwh: 758.2,
    peakGw: 124.0,
    mix: { gas: 272.4, coal: 243.6, nuclear: 107.6, wind: 97.8, solar: 12.1, hydro: 6.4, other: 18.3 }
  },
  PJM: {
    center: [-79.5, 40.2],
    totalTwh: 706.3,
    peakGw: 145.3,
    mix: { gas: 270.3, coal: 102.4, nuclear: 258.9, wind: 25.6, solar: 17.8, hydro: 9.2, other: 22.1 }
  },
  SPP: {
    center: [-97.5, 37.8],
    totalTwh: 281.0,
    peakGw: 57.8,
    mix: { gas: 86.4, coal: 52.1, nuclear: 27.5, wind: 104.2, solar: 6.8, other: 4.0 }
  },
  NYISO: {
    center: [-75.8, 43.0],
    totalTwh: 138.0,
    peakGw: 34.2,
    mix: { gas: 54.3, coal: 1.2, nuclear: 41.8, wind: 5.6, solar: 4.2, hydro: 24.1, other: 6.8 }
  },
  'ISO-NE': {
    center: [-71.8, 43.5],
    totalTwh: 85.2,
    peakGw: 28.1,
    mix: { gas: 35.4, coal: 0.4, nuclear: 28.7, wind: 3.8, solar: 4.1, hydro: 7.2, other: 5.6 }
  },
  SERC: {
    center: [-84.5, 33.2],
    totalTwh: 697.4,
    peakGw: 110.5,
    mix: { gas: 312.8, coal: 147.3, nuclear: 136.2, wind: 12.4, solar: 28.6, hydro: 38.4, other: 21.7 }
  },
  WECC: {
    center: [-111.0, 40.5],
    totalTwh: 495.8,
    peakGw: 89.4,
    mix: { gas: 189.6, coal: 41.2, nuclear: 31.8, wind: 64.3, solar: 58.7, hydro: 92.4, other: 17.8 }
  }
};

// ── Transmission Lines GeoJSON ────────────────────────────
// voltageKv: 765, 500, 345; type: "AC" | "DC"
window.TRANSMISSION_LINES = {
  type: 'FeatureCollection',
  features: [

    // ════════════════════════════════════════════
    //  WECC — Western Interconnection
    // ════════════════════════════════════════════

    // Pacific HVDC Intertie ±500kV (Celilo OR → Sylmar CA)
    { type: 'Feature',
      properties: { name: 'Pacific HVDC Intertie', voltageKv: 500, type: 'DC', region: 'WECC', operator: 'BPA/SCE' },
      geometry: { type: 'LineString', coordinates: [
        [-121.20, 45.69], [-120.50, 44.10], [-119.50, 42.00],
        [-119.00, 40.50], [-118.80, 38.80], [-118.40, 34.28]
      ]}},

    // Pacific AC Intertie 500kV (Portland OR → Bay Area CA)
    { type: 'Feature',
      properties: { name: 'Pacific AC Intertie 500kV', voltageKv: 500, type: 'AC', region: 'WECC', operator: 'BPA/PG&E' },
      geometry: { type: 'LineString', coordinates: [
        [-122.68, 45.52], [-123.20, 44.40], [-123.00, 43.00],
        [-122.70, 41.50], [-122.20, 40.00], [-122.00, 38.60]
      ]}},

    // BPA 500kV Columbia → Montana
    { type: 'Feature',
      properties: { name: 'BPA 500kV Columbia-Montana', voltageKv: 500, type: 'AC', region: 'WECC', operator: 'BPA' },
      geometry: { type: 'LineString', coordinates: [
        [-122.90, 46.18], [-121.00, 46.60], [-118.00, 46.80],
        [-116.00, 47.00], [-113.50, 46.80], [-111.00, 46.60]
      ]}},

    // Devers–Palo Verde 500kV (CA–AZ)
    { type: 'Feature',
      properties: { name: 'Devers–Palo Verde 500kV', voltageKv: 500, type: 'AC', region: 'WECC', operator: 'SCE/APS' },
      geometry: { type: 'LineString', coordinates: [
        [-116.93, 33.93], [-115.00, 33.80], [-113.00, 33.50], [-111.38, 33.38]
      ]}},

    // Intermountain HVDC ±500kV (Intermountain UT → Adelanto CA)
    { type: 'Feature',
      properties: { name: 'Intermountain HVDC ±500kV', voltageKv: 500, type: 'DC', region: 'WECC', operator: 'IPC/SCE' },
      geometry: { type: 'LineString', coordinates: [
        [-112.30, 40.30], [-114.00, 39.40], [-115.50, 38.50],
        [-117.00, 37.00], [-117.50, 35.00], [-117.50, 34.60]
      ]}},

    // BPA–Columbia 500kV ring (WA)
    { type: 'Feature',
      properties: { name: 'BPA 500kV Puget–Columbia', voltageKv: 500, type: 'AC', region: 'WECC', operator: 'BPA' },
      geometry: { type: 'LineString', coordinates: [
        [-122.30, 47.60], [-121.80, 46.80], [-122.10, 46.20], [-119.10, 46.20]
      ]}},

    // APS 500kV AZ–NV–CA
    { type: 'Feature',
      properties: { name: 'APS 500kV AZ–NV–CA', voltageKv: 500, type: 'AC', region: 'WECC', operator: 'APS/NV Energy' },
      geometry: { type: 'LineString', coordinates: [
        [-111.00, 33.50], [-113.00, 35.00], [-115.00, 35.50],
        [-116.50, 35.00], [-118.20, 34.10]
      ]}},

    // Xcel/PSCO 345kV CO
    { type: 'Feature',
      properties: { name: 'Xcel 345kV Colorado', voltageKv: 345, type: 'AC', region: 'WECC', operator: 'Xcel/PSCO' },
      geometry: { type: 'LineString', coordinates: [
        [-104.80, 41.20], [-105.10, 40.50], [-105.00, 39.50], [-104.90, 38.80]
      ]}},

    // NorthWestern 345kV Montana
    { type: 'Feature',
      properties: { name: 'NorthWestern 345kV Montana', voltageKv: 345, type: 'AC', region: 'WECC', operator: 'NorthWestern' },
      geometry: { type: 'LineString', coordinates: [
        [-114.00, 48.30], [-114.00, 47.00], [-112.50, 46.00], [-111.00, 46.60]
      ]}},

    // ════════════════════════════════════════════
    //  Eastern Interconnection — PJM
    // ════════════════════════════════════════════

    // AEP 765kV Backbone (IN–OH–WV–VA)
    { type: 'Feature',
      properties: { name: 'AEP 765kV Backbone', voltageKv: 765, type: 'AC', region: 'PJM', operator: 'AEP' },
      geometry: { type: 'LineString', coordinates: [
        [-85.80, 40.00], [-84.50, 39.80], [-83.00, 40.00],
        [-81.50, 40.80], [-80.50, 40.50], [-79.00, 40.20],
        [-78.20, 39.50], [-77.80, 39.20]
      ]}},

    // AEP 765kV WV-VA Route
    { type: 'Feature',
      properties: { name: 'AEP 765kV WV–VA', voltageKv: 765, type: 'AC', region: 'PJM', operator: 'AEP' },
      geometry: { type: 'LineString', coordinates: [
        [-82.50, 38.50], [-81.50, 38.80], [-80.50, 38.90],
        [-79.50, 38.50], [-78.50, 38.80], [-77.80, 38.80]
      ]}},

    // PJM 500kV OH–PA–NJ
    { type: 'Feature',
      properties: { name: 'PJM 500kV OH–PA–NJ', voltageKv: 500, type: 'AC', region: 'PJM', operator: 'FirstEnergy/PPL' },
      geometry: { type: 'LineString', coordinates: [
        [-84.00, 41.50], [-82.00, 41.50], [-80.50, 41.20],
        [-78.50, 41.00], [-76.50, 41.00], [-75.20, 40.50], [-74.70, 40.50]
      ]}},

    // PJM 500kV Mid-Atlantic Spine
    { type: 'Feature',
      properties: { name: 'PJM 500kV Mid-Atlantic Spine', voltageKv: 500, type: 'AC', region: 'PJM', operator: 'Multiple' },
      geometry: { type: 'LineString', coordinates: [
        [-87.80, 41.80], [-86.00, 41.60], [-84.50, 41.50],
        [-83.20, 41.50], [-81.00, 41.50], [-79.50, 40.50],
        [-78.00, 39.50], [-77.50, 38.80], [-77.00, 37.50]
      ]}},

    // PJM 345kV PA–MD
    { type: 'Feature',
      properties: { name: 'PJM 345kV PA–MD', voltageKv: 345, type: 'AC', region: 'PJM', operator: 'PECO/BGE' },
      geometry: { type: 'LineString', coordinates: [
        [-75.30, 40.10], [-76.00, 39.50], [-77.00, 38.90], [-77.00, 38.80]
      ]}},

    // ════════════════════════════════════════════
    //  MISO
    // ════════════════════════════════════════════

    // MISO 345kV Northern Spine (ND–MN–WI)
    { type: 'Feature',
      properties: { name: 'MISO 345kV Northern Spine', voltageKv: 345, type: 'AC', region: 'MISO', operator: 'Great River/Xcel' },
      geometry: { type: 'LineString', coordinates: [
        [-100.30, 47.00], [-97.50, 47.00], [-96.80, 46.87],
        [-94.50, 46.50], [-92.50, 46.80], [-90.50, 46.00],
        [-88.50, 45.50], [-87.80, 44.50]
      ]}},

    // MISO 345kV MN–IA–IL
    { type: 'Feature',
      properties: { name: 'MISO 345kV MN–IA–IL', voltageKv: 345, type: 'AC', region: 'MISO', operator: 'Xcel/MidAmerican' },
      geometry: { type: 'LineString', coordinates: [
        [-93.50, 45.00], [-93.00, 44.00], [-93.00, 43.00],
        [-91.50, 42.00], [-90.00, 41.60], [-88.50, 41.80]
      ]}},

    // MISO 345kV IL–MO–AR
    { type: 'Feature',
      properties: { name: 'MISO 345kV IL–MO–AR', voltageKv: 345, type: 'AC', region: 'MISO', operator: 'Ameren' },
      geometry: { type: 'LineString', coordinates: [
        [-88.50, 42.00], [-89.00, 40.50], [-89.50, 39.00],
        [-90.20, 38.60], [-90.20, 37.00], [-90.00, 35.50]
      ]}},

    // MISO 500kV IL–IN (Bulk Power)
    { type: 'Feature',
      properties: { name: 'MISO 500kV IL–IN', voltageKv: 500, type: 'AC', region: 'MISO', operator: 'ComEd/NIPSCO' },
      geometry: { type: 'LineString', coordinates: [
        [-88.50, 41.80], [-87.20, 41.60], [-86.00, 41.30], [-84.80, 40.80]
      ]}},

    // MISO South 500kV (AR–LA Gulf)
    { type: 'Feature',
      properties: { name: 'MISO South 500kV AR–LA', voltageKv: 500, type: 'AC', region: 'MISO', operator: 'Entergy' },
      geometry: { type: 'LineString', coordinates: [
        [-90.00, 35.50], [-91.00, 34.50], [-91.80, 33.50],
        [-91.50, 32.00], [-91.00, 30.50], [-90.10, 29.90]
      ]}},

    // MISO 345kV MI
    { type: 'Feature',
      properties: { name: 'MISO 345kV Michigan', voltageKv: 345, type: 'AC', region: 'MISO', operator: 'Consumers/DTE' },
      geometry: { type: 'LineString', coordinates: [
        [-84.50, 45.00], [-84.00, 44.00], [-83.50, 43.00],
        [-83.00, 42.50], [-83.00, 42.20]
      ]}},

    // ════════════════════════════════════════════
    //  SPP
    // ════════════════════════════════════════════

    // SPP 345kV Kansas Spine
    { type: 'Feature',
      properties: { name: 'SPP 345kV KS Spine', voltageKv: 345, type: 'AC', region: 'SPP', operator: 'Evergy' },
      geometry: { type: 'LineString', coordinates: [
        [-102.00, 38.00], [-100.00, 38.00], [-98.50, 38.00],
        [-97.50, 37.70], [-96.00, 38.00], [-95.00, 37.50], [-94.60, 37.30]
      ]}},

    // SPP 345kV Oklahoma
    { type: 'Feature',
      properties: { name: 'SPP 345kV Oklahoma', voltageKv: 345, type: 'AC', region: 'SPP', operator: 'OG&E/PSO' },
      geometry: { type: 'LineString', coordinates: [
        [-97.50, 36.50], [-96.50, 36.20], [-95.50, 36.00], [-94.50, 35.50], [-94.00, 35.00]
      ]}},

    // SPP 345kV Nebraska
    { type: 'Feature',
      properties: { name: 'SPP 345kV Nebraska', voltageKv: 345, type: 'AC', region: 'SPP', operator: 'OPPD/NPPD' },
      geometry: { type: 'LineString', coordinates: [
        [-100.00, 42.00], [-98.00, 41.50], [-97.00, 41.50], [-96.00, 41.30], [-96.00, 41.20]
      ]}},

    // SPP 345kV NM–TX Panhandle
    { type: 'Feature',
      properties: { name: 'SPP 345kV NM–TX Panhandle', voltageKv: 345, type: 'AC', region: 'SPP', operator: 'Xcel/SPS' },
      geometry: { type: 'LineString', coordinates: [
        [-104.50, 34.50], [-103.00, 34.50], [-101.50, 35.00], [-101.00, 35.20]
      ]}},

    // ════════════════════════════════════════════
    //  ERCOT
    // ════════════════════════════════════════════

    // ERCOT 345kV East–West Spine
    { type: 'Feature',
      properties: { name: 'ERCOT 345kV E–W Spine', voltageKv: 345, type: 'AC', region: 'ERCOT', operator: 'ERCOT/ONCOR' },
      geometry: { type: 'LineString', coordinates: [
        [-100.00, 32.00], [-99.00, 32.30], [-98.20, 32.70],
        [-97.30, 32.80], [-96.00, 32.80], [-95.00, 32.50], [-94.10, 32.50]
      ]}},

    // ERCOT 345kV North–South
    { type: 'Feature',
      properties: { name: 'ERCOT 345kV N–S Spine', voltageKv: 345, type: 'AC', region: 'ERCOT', operator: 'ONCOR/CenterPoint' },
      geometry: { type: 'LineString', coordinates: [
        [-97.30, 34.00], [-97.40, 33.50], [-97.30, 32.80],
        [-97.20, 31.50], [-97.50, 30.30], [-97.50, 29.80]
      ]}},

    // ERCOT 345kV Houston Corridor
    { type: 'Feature',
      properties: { name: 'ERCOT 345kV Houston', voltageKv: 345, type: 'AC', region: 'ERCOT', operator: 'CenterPoint' },
      geometry: { type: 'LineString', coordinates: [
        [-97.50, 30.30], [-96.80, 30.00], [-95.80, 29.80], [-95.36, 29.76]
      ]}},

    // ERCOT CREZ 345kV West Texas (wind evacuation)
    { type: 'Feature',
      properties: { name: 'ERCOT CREZ 345kV West TX', voltageKv: 345, type: 'AC', region: 'ERCOT', operator: 'ONCOR/AEP TX' },
      geometry: { type: 'LineString', coordinates: [
        [-102.50, 31.80], [-101.50, 32.00], [-100.50, 32.10],
        [-100.00, 32.00], [-98.50, 32.50], [-97.30, 32.80]
      ]}},

    // ERCOT 345kV Panhandle wind
    { type: 'Feature',
      properties: { name: 'ERCOT 345kV Panhandle Wind', voltageKv: 345, type: 'AC', region: 'ERCOT', operator: 'ONCOR' },
      geometry: { type: 'LineString', coordinates: [
        [-101.80, 34.50], [-101.00, 34.00], [-100.00, 33.50], [-100.00, 32.00]
      ]}},

    // ════════════════════════════════════════════
    //  ISO-NE
    // ════════════════════════════════════════════

    // ISO-NE 345kV NH–VT–MA–CT
    { type: 'Feature',
      properties: { name: 'ISO-NE 345kV NH–VT–MA–CT', voltageKv: 345, type: 'AC', region: 'ISO-NE', operator: 'NSTAR/Eversource' },
      geometry: { type: 'LineString', coordinates: [
        [-71.50, 44.50], [-72.00, 44.00], [-72.60, 43.50],
        [-72.80, 43.00], [-72.60, 42.50], [-72.60, 41.80], [-72.50, 41.50]
      ]}},

    // ISO-NE 345kV ME–MA
    { type: 'Feature',
      properties: { name: 'ISO-NE 345kV ME–MA', voltageKv: 345, type: 'AC', region: 'ISO-NE', operator: 'Central Maine/Eversource' },
      geometry: { type: 'LineString', coordinates: [
        [-68.80, 47.20], [-70.00, 44.80], [-70.50, 44.00],
        [-71.00, 43.20], [-71.30, 42.80], [-71.10, 42.20]
      ]}},

    // ════════════════════════════════════════════
    //  NYISO
    // ════════════════════════════════════════════

    // NYISO 345kV Upstate–Downstate
    { type: 'Feature',
      properties: { name: 'NYISO 345kV Central Corridor', voltageKv: 345, type: 'AC', region: 'NYISO', operator: 'NYSEG/Con Ed' },
      geometry: { type: 'LineString', coordinates: [
        [-76.50, 43.50], [-75.00, 43.20], [-74.00, 43.30],
        [-74.20, 42.00], [-74.00, 41.50], [-73.90, 41.00], [-73.80, 40.80]
      ]}},

    // NYISO 345kV Western NY (Niagara–Buffalo)
    { type: 'Feature',
      properties: { name: 'NYISO 345kV Western NY', voltageKv: 345, type: 'AC', region: 'NYISO', operator: 'National Grid' },
      geometry: { type: 'LineString', coordinates: [
        [-79.05, 43.08], [-78.80, 43.20], [-77.00, 43.00],
        [-76.50, 43.50], [-75.50, 43.80]
      ]}},

    // ════════════════════════════════════════════
    //  SERC
    // ════════════════════════════════════════════

    // TVA 500kV Tennessee Backbone
    { type: 'Feature',
      properties: { name: 'TVA 500kV TN Backbone', voltageKv: 500, type: 'AC', region: 'SERC', operator: 'TVA' },
      geometry: { type: 'LineString', coordinates: [
        [-90.00, 35.20], [-88.50, 35.80], [-87.50, 36.00],
        [-86.80, 36.10], [-85.50, 36.00], [-84.50, 35.80],
        [-83.00, 35.90], [-82.50, 35.50]
      ]}},

    // Duke Energy Carolinas 500kV
    { type: 'Feature',
      properties: { name: 'Duke 500kV Carolinas', voltageKv: 500, type: 'AC', region: 'SERC', operator: 'Duke Energy' },
      geometry: { type: 'LineString', coordinates: [
        [-82.50, 35.50], [-81.20, 35.30], [-80.50, 35.20],
        [-79.00, 35.50], [-78.00, 35.80], [-77.50, 35.80]
      ]}},

    // Georgia Power 500kV
    { type: 'Feature',
      properties: { name: 'Georgia Power 500kV', voltageKv: 500, type: 'AC', region: 'SERC', operator: 'Georgia Power' },
      geometry: { type: 'LineString', coordinates: [
        [-84.50, 34.00], [-83.50, 33.80], [-84.50, 33.50],
        [-84.20, 32.50], [-84.50, 31.50], [-84.20, 30.50]
      ]}},

    // FPL/Duke 500kV Florida
    { type: 'Feature',
      properties: { name: 'FPL 500kV Florida', voltageKv: 500, type: 'AC', region: 'SERC', operator: 'FPL' },
      geometry: { type: 'LineString', coordinates: [
        [-84.20, 30.50], [-82.50, 29.80], [-81.50, 28.50],
        [-80.30, 27.50], [-80.20, 26.50], [-80.30, 25.70]
      ]}},

    // Alabama Power 500kV
    { type: 'Feature',
      properties: { name: 'Alabama Power 500kV', voltageKv: 500, type: 'AC', region: 'SERC', operator: 'Alabama Power' },
      geometry: { type: 'LineString', coordinates: [
        [-88.00, 35.00], [-87.50, 34.50], [-86.50, 34.00],
        [-86.80, 33.50], [-86.00, 33.00], [-85.00, 32.50]
      ]}},

    // SCE&G / Dominion SC 230kV → 500kV
    { type: 'Feature',
      properties: { name: 'Dominion SC–VA 500kV', voltageKv: 500, type: 'AC', region: 'SERC', operator: 'Dominion' },
      geometry: { type: 'LineString', coordinates: [
        [-80.00, 34.50], [-79.50, 35.80], [-78.00, 36.80],
        [-77.00, 37.00], [-76.50, 37.50]
      ]}},

    // ════════════════════════════════════════════
    //  Cross-Region Interface Ties
    // ════════════════════════════════════════════

    // PJM–MISO Interface 345kV (OH–IN)
    { type: 'Feature',
      properties: { name: 'PJM–MISO Interface 345kV', voltageKv: 345, type: 'AC', region: 'INTERFACE', operator: 'AEP/NIPSCO' },
      geometry: { type: 'LineString', coordinates: [
        [-84.50, 41.30], [-85.50, 41.00], [-86.50, 40.80], [-87.50, 41.80]
      ]}},

    // SPP–MISO Interface 345kV (MO–IA)
    { type: 'Feature',
      properties: { name: 'SPP–MISO Interface 345kV', voltageKv: 345, type: 'AC', region: 'INTERFACE', operator: 'Ameren/KCPL' },
      geometry: { type: 'LineString', coordinates: [
        [-94.50, 37.30], [-94.20, 38.00], [-94.00, 39.00],
        [-95.00, 40.00], [-95.90, 41.20]
      ]}},

    // NYISO–ISO-NE tie 345kV
    { type: 'Feature',
      properties: { name: 'NYISO–ISO-NE Tie 345kV', voltageKv: 345, type: 'AC', region: 'INTERFACE', operator: 'National Grid/Eversource' },
      geometry: { type: 'LineString', coordinates: [
        [-73.40, 42.80], [-73.00, 43.50], [-72.80, 43.00]
      ]}},

    // PJM–NYISO Tie 345kV
    { type: 'Feature',
      properties: { name: 'PJM–NYISO Tie 345kV', voltageKv: 345, type: 'AC', region: 'INTERFACE', operator: 'PECO/Con Ed' },
      geometry: { type: 'LineString', coordinates: [
        [-75.00, 41.00], [-74.20, 41.00], [-73.90, 41.00], [-73.90, 40.80]
      ]}},

    // PJM–SERC Interface 500kV (VA–NC)
    { type: 'Feature',
      properties: { name: 'PJM–SERC Interface 500kV', voltageKv: 500, type: 'AC', region: 'INTERFACE', operator: 'Dominion/Duke' },
      geometry: { type: 'LineString', coordinates: [
        [-80.50, 35.20], [-80.00, 36.00], [-79.00, 37.00],
        [-78.50, 38.00], [-77.80, 38.80]
      ]}},

    // SERC–MISO Interface 500kV (TN–MS)
    { type: 'Feature',
      properties: { name: 'SERC–MISO Interface 500kV', voltageKv: 500, type: 'AC', region: 'INTERFACE', operator: 'TVA/Entergy' },
      geometry: { type: 'LineString', coordinates: [
        [-90.00, 35.20], [-90.00, 34.00], [-90.20, 33.00]
      ]}},

    // WECC–SPP Interface 345kV (CO–NM)
    { type: 'Feature',
      properties: { name: 'WECC–SPP Interface 345kV', voltageKv: 345, type: 'AC', region: 'INTERFACE', operator: 'Xcel' },
      geometry: { type: 'LineString', coordinates: [
        [-105.00, 38.00], [-104.00, 38.00], [-103.00, 37.80], [-102.00, 38.00]
      ]}},

    // SPP–ERCOT DC Tie (Lamar)
    { type: 'Feature',
      properties: { name: 'SPP–ERCOT DC Tie', voltageKv: 345, type: 'DC', region: 'INTERFACE', operator: 'SWEPCO' },
      geometry: { type: 'LineString', coordinates: [
        [-94.50, 33.50], [-94.50, 32.00], [-94.10, 32.50]
      ]}},

    // ERCOT–WECC DC Tie (Eagle Pass)
    { type: 'Feature',
      properties: { name: 'ERCOT–WECC DC Tie (Eagle Pass)', voltageKv: 345, type: 'DC', region: 'INTERFACE', operator: 'AEP Texas' },
      geometry: { type: 'LineString', coordinates: [
        [-100.50, 28.70], [-101.00, 29.50], [-101.80, 30.00], [-102.50, 31.00]
      ]}}
  ]
};
