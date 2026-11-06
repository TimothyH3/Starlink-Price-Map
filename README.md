# Starlink High-Demand Congestion Surcharge Map

An interactive, real-time geospatial application tracking **Starlink High-Demand Congestion Surcharges ($100–$1,500)** across the United States. 

Integrated as a dedicated subpage on **[tjhansen.net/starlink-surcharge-map](https://tjhansen.net/starlink-surcharge-map)**, engineered for GitHub Pages SPA client-side routing, PostGIS spatial indexing, scheduled sparse sampling, and on-demand live address qualification.

---

## Architecture Overview

The system operates on a 100% free-tier serverless architecture:

```
                  +----------------------------------------------+
                  |  Scheduled GitHub Action (.github/workflows) |
                  |  Runs weekly cron (Sunday 04:00 UTC)         |
                  |  Probes ~60 macro anchors + 10-point scatter |
                  +----------------------+-----------------------+
                                         |
                                         v
+------------------------+      +------------------+      +------------------------+
| Frontend Map UI        | ---> |  Supabase DB     | <--- | Cloudflare Worker      |
| (MapLibre / Leaflet)   |      |  PostgreSQL 15+  |      | Live Lookup API Proxy  |
| CartoDB Dark Matter    |      |  PostGIS GIST    |      | /api/check-fee?lat=&lng|
| Proximity Cache (25km) |      |  Public RLS Read |      | ctx.waitUntil upsert   |
+------------------------+      +------------------+      +------------------------+
            ^                                                         ^
            |                                                         |
            +------------ Live Qualification Check -------------------+
```

1. **Frontend Map UI (`/starlink-surcharge-map`):**
   - High-contrast, cybernetic dark theme matching `tjhansen.net` (`#07090E`, JetBrains Mono, Inter).
   - CartoDB Dark Matter basemap (zero API key dependency, unlimited free usage).
   - Tiered color visualization:
     - **$0 Standard**: Soft Cyan (`#22d3ee`)
     - **$100–$250 Surcharge**: Yellow (`#facc15`)
     - **$500–$750 Surcharge**: Orange (`#fb923c`)
     - **$1,000+ Surcharge**: Crimson Red (`#ef4444`)
     - **Sold Out / Waitlist**: Purple (`#c084fc`)
   - Nominatim / OpenStreetMap geocoder address search with debouncing.
   - 25 km / 14-day local spatial cache inspection.
   - On-demand *"⚡ Check Exact Live Surcharge"* trigger invoking Cloudflare Worker proxy.
   - Macro corridor quick-jumps (Pacific NW, Intermountain West, Appalachia, Southeast, Texas).

2. **Database & API (Supabase PostgreSQL + PostGIS):**
   - Stores sampled coordinates as PostGIS `GEOMETRY(Point, 4326)` indexed via GIST.
   - Table `starlink_surcharges` with Row Level Security (RLS):
     - `anon` has public `SELECT` read privileges.
     - `service_role` has full write/update privileges.
   - Stored procedures:
     - `upsert_starlink_surcharge`: Deduplicates and upserts points.
     - `get_nearby_surcharge`: Proximity search with `ST_DWithin` and age filtering.
     - `get_surcharges_geojson`: Serializes full FeatureCollection GeoJSON.

3. **Background Worker (GitHub Actions + Python):**
   - Automated workflow: `.github/workflows/sample.yml` (cron `0 4 * * 0` + `workflow_dispatch`).
   - Python script: `scripts/sample_demand.py` targeting ~60 macro seed anchors across US broadband bottleneck corridors.
   - Jittered requests (2–5s delays), realistic browser headers, and exponential backoff.
   - Localized 10-point radial scatter upon detecting `surcharge > 0`:
     - 4 cardinal points (N, E, S, W) at 25 km.
     - 6 circular points at 70 km.
   - Batches and upserts records to Supabase PostGIS.

4. **On-Demand Live Checker (Cloudflare Worker):**
   - Worker endpoint: `GET /api/check-fee?lat={lat}&lng={lng}` (`cloudflare-worker/src/index.ts`).
   - Validates coordinates and enforces CORS for `tjhansen.net`.
   - Probes Starlink's checkout qualification endpoint.
   - Asynchronously writes live sample to Supabase via `ctx.waitUntil` for zero-latency response.

---

## Directory Structure

```
Starlink High-Demand Location Map/
├── .github/
│   └── workflows/
│       └── sample.yml              # Scheduled weekly sampling workflow
├── supabase/
│   ├── schema.sql                  # PostGIS table, indexes, RLS, RPCs, seed data
│   └── README.md                   # Supabase setup guide
├── scripts/
│   ├── sample_demand.py            # Python sparse sampler (60 seeds + 10 radial scatter)
│   ├── requirements.txt            # Python dependencies
│   └── README.md                   # Script documentation & test commands
├── cloudflare-worker/
│   ├── src/
│   │   └── index.ts                # Worker live lookup API proxy & async DB writer
│   ├── wrangler.toml               # Wrangler deployment configuration
│   ├── package.json                # Worker package definition
│   ├── tsconfig.json               # TypeScript configuration
│   └── README.md                   # Cloudflare deployment instructions
├── src/
│   ├── views/
│   │   └── StarlinkMap.vue         # Vue 3 map component with telemetry HUD & Leaflet
│   └── router/
│       └── index.ts                # Router configuration (/starlink-surcharge-map)
├── starlink-surcharge-map/         # Standalone production subpage for GitHub Pages
│   ├── index.html                  # HTML5 map interface
│   ├── map.js                      # Leaflet engine, spatial cache, Nominatim search
│   └── map.css                     # Dark-mode telemetry styles
├── StarlinkSurchargeMap/
│   └── index.html                  # Case-insensitive route alias redirect
├── 404.html                        # GitHub Pages SPA redirect engine (spa-github-pages)
├── index.html                      # Root SPA redirect & fallback receiver
├── .nojekyll                       # GitHub Pages Jekyll bypass
└── package.json                    # Workspace dependencies & preview scripts
```

---

## Setup & Deployment Guide

### 1. Database (Supabase)
1. In your Supabase project, open the **SQL Editor**.
2. Run `supabase/schema.sql`.
3. Copy your project's **URL**, **Anon Key** (public), and **Service Role Key** (secret) from **Project Settings** -> **API**.

### 2. Live Checker (Cloudflare Worker)
```bash
cd cloudflare-worker
npm install
npx wrangler login

# Set Supabase secrets
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# Deploy to Cloudflare edge network
npm run deploy
```
Copy your assigned worker URL (e.g., `https://starlink-surcharge-worker.<account>.workers.dev`).

### 3. Background Sampler (GitHub Actions)
In your GitHub repository settings under **Settings** -> **Secrets and variables** -> **Actions**, add:
* `SUPABASE_URL`: `https://your-project.supabase.co`
* `SUPABASE_SERVICE_ROLE_KEY`: `eyJhbGciOi...`

Trigger manually via **Actions** -> **Starlink Demand Surcharge Sampler** -> **Run workflow**, or wait for the Sunday 04:00 UTC schedule.

### 4. GitHub Pages SPA Routing Integration
The repository includes two complementary layers for 100% reliable GitHub Pages routing on `tjhansen.net`:
1. **Static Folder Serving**: Placing files at `starlink-surcharge-map/index.html` allows GitHub Pages to serve `https://tjhansen.net/starlink-surcharge-map/` natively with HTTP 200.
2. **SPA Fallback Redirect**: `404.html` implements the standard [spa-github-pages](https://github.com/rafgraph/spa-github-pages) protocol. If a user refreshes deep URLs or navigates without trailing slashes, `404.html` seamlessly captures the route and forwards it to the application receiver.

---

## Local Development & Testing

### Preview Frontend Map
```bash
# Start local preview server
npm run dev
# or
npx serve .
```
Navigate to `http://localhost:5173/starlink-surcharge-map/`.

### Test Sampling Script Locally
```bash
python scripts/sample_demand.py
```

### Test Cloudflare Worker Locally
```bash
cd cloudflare-worker
npm run dev
# Probe: http://localhost:8787/api/check-fee?lat=35.5951&lng=-82.5515
```

---

## License
MIT License. Built by [Timothy Hansen](https://tjhansen.net).
