# US Power System Map

Interactive Leaflet.js map of the US electric power system.

**Live site:** update with your GitHub Pages URL after enabling Pages in repo Settings.

## Features

- **ISO/RTO Regions** - all 9 major grid operators color-coded by state
- **Transmission Lines** - about 50 major 345 kV, 500 kV, 765 kV AC and HVDC corridors
- **Daily Generation Mix** - SVG pie-chart markers showing the latest previous full day of regional fuel mix from EIA Grid Monitor
- **US Generator Plants** - static EIA 2024 plant layer with operable generator profiles, fuel mix, and capacity details
- Toggle any layer on and off with the built-in layer control
- Click any state, pie chart, or generator marker for detailed stats

## Data Sources

| Dataset | Source |
|---|---|
| State boundaries | US Atlas TopoJSON (Census TIGER) |
| Generation mix | EIA Grid Monitor / EIA-930 daily fuel mix API |
| Generator plants | EIA Form 860 detailed data, final 2024 release |
| Transmission routes | FERC/NERC public maps (simplified) |
| ISO/RTO boundaries | NERC/individual ISO maps (assigned by dominant state) |

> Transmission line routes and ISO/RTO state assignments are approximate.
> Generator plant data is generated from the local EIA 2024 asset in `js/generator_data_2024.js`.
> Generation mix updates automatically as EIA publishes each new previous-day daily mix.
> Boundaries do not reflect exact FERC-certified service territory lines.

## Deployment

The site deploys automatically to GitHub Pages on every push to `main`
via the Actions workflow in `.github/workflows/deploy.yml`.

**To enable GitHub Pages:**
1. Go to **Settings -> Pages** in your repository
2. Set **Source** to **GitHub Actions**
3. Push to `main` - the workflow runs and publishes the site
