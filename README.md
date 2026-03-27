# US Power System Map

Interactive Leaflet.js map of the US electric power system.

**Live site:** update with your GitHub Pages URL after enabling Pages in repo Settings.

## Features

- **ISO/RTO Regions** — all 9 major grid operators color-coded by state
- **Transmission Lines** — ~50 major 345 kV, 500 kV, 765 kV AC and HVDC corridors
- **EIA 2023 Generation Mix** — SVG pie-chart markers showing annual fuel mix per region
- Toggle any layer on/off with the built-in layer control
- Click any state or pie chart for detailed stats

## Data Sources

| Dataset | Source |
|---|---|
| State boundaries | US Atlas TopoJSON (Census TIGER) |
| Generation mix | EIA Electric Power Annual 2023 |
| Transmission routes | FERC/NERC public maps (simplified) |
| ISO/RTO boundaries | NERC/individual ISO maps (assigned by dominant state) |

> Transmission line routes and ISO/RTO state assignments are approximate.
> Boundaries do not reflect exact FERC-certified service territory lines.

## Deployment

The site deploys automatically to GitHub Pages on every push to `main`
via the Actions workflow in `.github/workflows/deploy.yml`.

**To enable GitHub Pages:**
1. Go to **Settings → Pages** in your repository
2. Set **Source** to **GitHub Actions**
3. Push to `main` — the workflow runs and publishes the site
