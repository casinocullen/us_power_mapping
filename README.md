# US Power System Map

Interactive Leaflet.js map of the US electric power system.

**Live site:** update with your GitHub Pages URL after enabling Pages in repo Settings.

## Features

- **ISO/RTO Regions** - all 9 major grid operators color-coded by state
- **Transmission Lines** - about 50 major 345 kV, 500 kV, 765 kV AC and HVDC corridors
- **Daily Generation Mix** - SVG pie-chart markers showing the latest previous full day of regional fuel mix from EIA Grid Monitor
- **US Generator Plants** - EIA 860M operating generator inventory with plant-level operable unit profiles and capacity details
- **Planned Generators** - EIA 860M planned generator inventory with plant-level planned-unit markers and expected online dates
- Toggle any layer on and off with the built-in layer control
- Click any state, pie chart, or generator marker for detailed stats

## Data Sources

| Dataset | Source |
|---|---|
| State boundaries | US Atlas TopoJSON (Census TIGER) |
| Generation mix | EIA Grid Monitor / EIA-930 daily fuel mix API |
| Generator plants | EIA 860M Preliminary Monthly Electric Generator Inventory, Operating tab |
| Planned generators | EIA 860M Preliminary Monthly Electric Generator Inventory, Planned tab |
| Transmission routes | FERC/NERC public maps (simplified) |
| ISO/RTO boundaries | NERC/individual ISO maps (assigned by dominant state) |

> Transmission line routes and ISO/RTO state assignments are approximate.
> Generator plant data is generated from the latest downloaded EIA 860M workbook into `data/generator_data_860m.json`.
> Planned generator data is generated from the same EIA 860M workbook into `data/planned_generator_data_860m.json`.
> Browser cache storage keeps downloaded generator datasets for faster repeat visits and is automatically invalidated on each new site publish.
> Generation mix updates automatically as EIA publishes each new previous-day daily mix.
> A scheduled GitHub Actions workflow checks the EIA 860M release page each month, downloads the latest workbook, rebuilds both generator datasets, and pushes refreshed assets when a new release is available.
> Boundaries do not reflect exact FERC-certified service territory lines.

## Deployment

The site deploys automatically to GitHub Pages on every push to `main`
via the Actions workflow in `.github/workflows/deploy.yml`.

**To enable GitHub Pages:**
1. Go to **Settings -> Pages** in your repository
2. Set **Source** to **GitHub Actions**
3. Push to `main` - the workflow runs and publishes the site
