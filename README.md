# Starlink Residential Service Cost Map 🛰️🗺️

[![Live Map](https://img.shields.io/badge/Live%20Map-tjhansen.net%2Fstarlink--surcharge--map-0ea5e9?style=for-the-badge&logo=google-maps&logoColor=white)](https://tjhansen.net/starlink-surcharge-map)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Edge%20Cron%20V8-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![Supabase PostGIS](https://img.shields.io/badge/Supabase-PostGIS%20Spatial-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Leaflet & H3](https://img.shields.io/badge/Leaflet-Uber%20H3%20Res%205-199900?style=for-the-badge&logo=leaflet&logoColor=white)](https://leafletjs.com)
[![Operating Cost](https://img.shields.io/badge/Operating%20Cost-%240.00%20%2F%20mo-emerald?style=for-the-badge)](https://tjhansen.net)

An interactive, real-time geospatial application tracking **Starlink Residential Monthly Service Costs ($27.50–$170+/mo)**, regional price adjustments, and **demand congestion surcharges ($100–$1,500)** across the Continental United States.

Explore the live application at: **[tjhansen.net/starlink-surcharge-map](https://tjhansen.net/starlink-surcharge-map)**

---

## The Story: Why I Built This

I travel full-time and rely on Starlink Residential to work remotely and stay connected from anywhere in the country. Because my home is constantly on the move, I frequently update my service location to wherever I am parked or staying next.

However, Starlink's monthly subscription cost is **not uniform nationwide**. Depending on regional satellite network density and cell capacity, pricing fluctuates dramatically:
- **Promotional Rural Discounts:** As low as **$27.50 to $55.00/month** in underserved regions.
- **Standard Base Rate:** **$120.00/month** in balanced capacity regions.
- **Congested Cells:** Up to **$143.00 to $170.00+/month** due to regional service price adjustments.
- **Upfront Surcharges & Waitlists:** Some regions charge an additional **$100 to $1,500** upfront demand surcharge just to activate equipment, while others are completely sold out and restricted to waitlist deposits.

### The Problem
**Starlink does not offer a pricing map.** The official availability map only displays binary coverage (available vs. waitlist), with zero indication of what your monthly bill or hardware activation fee will actually be. The only way to find out what service costs at your next destination is to manually type full street addresses into their public checkout flow one by one.

For digital nomads, RVers, vanlifers, and mobile remote workers, this makes budgeting and planning travel itineraries a frustrating guessing game.

### The Solution
I built this application to solve that problem for myself and the mobile community: a nationwide, transparent geospatial map displaying authentic, verified residential pricing, regional adjustments, and congestion surcharges—enabling travelers to forecast their internet expenses before hitting the road.

---

## Respectful Sampling & Ethical Traffic Engineering

A foundational requirement of this project was being an **exceptionally respectful internet citizen**. Starlink's checkout and qualification APIs exist to serve customers, not to be battered by automated scrapers. 

The architecture is intentionally engineered to avoid generating unreasonable traffic and to protect Starlink's servers:

```
[ User Search or Edge Cron Tick ]
               │
               ▼
   ┌───────────────────────┐
   │ Water Body Filter?    │── Yes ──> [ Skip: 0 Network Traffic ]
   │ (Great Lakes & Ocean) │
   └───────────────────────┘
               │ No
               ▼
   ┌───────────────────────┐
   │ PostGIS Spatial Cache │── Within 25km ──> [ Instant Cache Hit: 0 Starlink Requests ]
   │ (ST_DWithin Proximity)│
   └───────────────────────┘
               │ No Cache Hit
               ▼
   ┌───────────────────────┐
   │ Gentle 4-Stage API    │── Minimal Payload ──> [ Starlink Server ]
   │ (Single HTTP Session) │
   └───────────────────────┘
               │
               ▼
   [ Cache Result in PostGIS for 30 Days ]
```

### 1. Spatial Proximity Caching (Supabase PostGIS)
Whenever a user searches an address or clicks on the map, the system first executes a PostGIS spatial query (`ST_DWithin` / `rpc/get_nearby_surcharge`) within a **25 km radius**. If a verified node already exists within that cell cluster, the price is returned instantly from the spatial database. **No request is sent to Starlink.**

### 2. Ultra Low-Frequency Edge Micro-Sampling
Instead of running aggressive web scrapers or parallel crawlers that hammer endpoints, background data collection is handled by an edge Cloudflare Worker Cron Trigger running only **once every 10 minutes** (`*/10 * * * *`). Each run gently samples just 1–2 strategic continental targets—amounting to only **6–12 requests per hour** for the entire platform.

### 3. Geometric Water Body & Offshore Exclusion
Using ray-casting point-in-polygon algorithms, any coordinate landing in water surfaces is rejected immediately **before any network request is ever created**:
- Lake Superior, Lake Michigan, Lake Huron, Lake Erie, and Lake Ontario.
- The Gulf of Mexico and Atlantic/Pacific coastal zones.
- Coordinates outside the Continental US (CONUS) land bounding polygon.

### 4. Reverse Geocoding Land Gatekeeper
Probed coordinates must resolve to an authentic street address or locality with a valid 2-letter CONUS state code. Open ocean Plus Codes and uninhabited coordinates are filtered out prior to checkout qualification.

### 5. Lightweight API Pipeline (Zero Headless Browser Bloat)
The worker avoids resource-heavy headless browsers (like Selenium or Puppeteer). It executes only the 4 essential REST calls needed to evaluate promotion pricing (`reverse-geocode` → `leads` → `sign-up/lead` → `sign-up/pricing`) using standard headers and session re-use.

---

## Service Cost Tiers & Visual Legend

The map classifies service fees using hexagonal honeycomb cells (matching Uber H3 Resolution 5 at ~12.5 km circumradius, identical to Starlink's physical spot beam geometry):

| Tier | Status Key | Monthly Price | Color | Map Appearance | Characteristics |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Discounted** | `discounted` | **≤ $55.00/mo** | 🟢 Emerald Green | Soft Green Aura | Heavy promotional pricing ($27.50, $38.50, $49.50, $55.00) in high-capacity rural markets |
| **Standard** | `standard` | **$55.00 – $130.00/mo** | 🔵 Sky Blue | Cyan Aura | Standard baseline residential tier ($60.50, $66.00, $120.00 base rate) |
| **Congested** | `congested` | **$130.00 – $170.00/mo** | 🟠 Bright Orange | Amber Aura | Capacity-adjusted cells ($143.00, $156.00) with monthly congestion penalties |
| **High Demand** | `high_demand` | **≥ $170.00/mo** | 🔴 Crimson Red | Red Flare | Heavily congested cells with monthly surcharges and/or upfront hardware fees ($100–$1,500) |
| **Unavailable** | `sold_out` | **N/A** | 🟣 Purple | Purple Outline | Cell at maximum satellite beam capacity; requires a waitlist deposit |

---

## System Architecture

```
                    ┌────────────────────────────────────────────────────────┐
                    │               Cloudflare Edge V8 Isolate               │
                    │        (Scheduled Native Cron Trigger: */10 * * * *)   │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                                    Deterministic CONUS Tick
                                                │
                                                ▼
┌────────────────────────┐             ┌──────────────────┐             ┌────────────────────────┐
│ Client Map Interface   │ ── Lookups ─│ Cloudflare Proxy │ ── Probes ──│ Starlink Qualification │
│ (Leaflet + Uber H3-JS) │             │  /api/check-fee  │             │   Checkout Pipeline    │
│ Esri Dark Gray Tiles   │             └────────┬─────────┘             └────────────────────────┘
└────────────────────────┘                      │
            │                               Writes & Reads
            │                                   │
            ▼                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Supabase PostgreSQL 15+                                     │
│                     PostGIS Spatial Extension (GIST R-Tree Indexing)                           │
│           Table: starlink_surcharges  •  RPC: get_nearby_surcharge (25km ST_DWithin)           │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Frontend:** Pure HTML5, CSS3, modern Vanilla JS, Leaflet.js, and Uber H3-JS (zero build dependencies for GitHub Pages deployment; also includes a Vue 3 Composition API implementation).
- **Edge Layer:** Cloudflare Worker running TypeScript on Cloudflare's global edge network.
- **Database:** Supabase PostgreSQL with PostGIS extension for sub-millisecond geodetic indexing.
- **Cost:** **$0.00 / month**. Built entirely on generous free tiers (Cloudflare Workers, Supabase free plan, GitHub Pages, OpenStreetMap raster tiles).

---

## Key Features

- **Real-Time Interactive Search:** Integrated with OpenStreetMap Nominatim with debounced autocomplete, panning, and automatic spatial cache qualification.
- **Uber H3 Hexagonal Tessellation:** Mathematically invariant hexagons matching Starlink's satellite beam coverage (~252 km² per cell).
- **Macro Blended Mesh:** Fluid radial aura gradients that provide a high-level regional overview when zoomed out, switching to precise cell boundaries when zoomed in.
- **Verified Checkout Badges:** Clear inspection panels distinguishing between cached nearby nodes and live real-time checkout qualifications.
- **Regional Corridor Quick-Jumps:** Instant navigation to key travel corridors: Pacific Northwest, Intermountain West, Appalachia, Southeast, and Texas Hill Country.

---

## Repository Structure

```
Starlink High-Demand Location Map/
├── .github/
│   └── workflows/
│       └── sample.yml              # Manual workflow_dispatch fallback
├── cloudflare-worker/
│   ├── src/
│   │   └── index.ts                # Edge proxy, Cron Trigger handler, PostGIS caching
│   ├── wrangler.toml               # Cloudflare configuration with cron triggers
│   ├── package.json                # Worker dependencies
│   └── tsconfig.json               # TypeScript configuration
├── supabase/
│   ├── schema.sql                  # PostGIS table definitions, GIST indexes, RLS, and RPCs
│   └── README.md                   # Database setup instructions
├── scripts/
│   ├── sample_demand.py            # Local bulk seeding & polygon testing tool
│   ├── sampling_state.json         # Local crawler state file
│   └── requirements.txt            # Python dependencies
├── starlink-surcharge-map/         # Production standalone SPA for GitHub Pages
│   ├── index.html                  # Cybernetic dark HUD interface
│   ├── map.js                      # Leaflet engine, H3 tessellation, and spatial logic
│   ├── map.css                     # Responsive styling and glowing aura effects
│   └── h3-js.umd.js                # Embedded Uber H3 spatial library
└── src/
    └── views/
        └── StarlinkMap.vue         # Vue 3 component equivalent
```

---

## Local Setup & Development

### 1. Clone Repository
```bash
git clone https://github.com/TimothyH3/starlink-tracker.git
cd starlink-tracker
```

### 2. Run Map Interface Locally
```bash
# Using Vite
npm install
npm run dev

# Or serve the standalone folder directly with any static server:
npx serve starlink-surcharge-map
```

### 3. Deploy Cloudflare Worker
```bash
cd cloudflare-worker
npm install
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler deploy
```

---

## Author & Credits

Engineered by **Timothy Hansen**
- **Website:** [tjhansen.net](https://tjhansen.net)
- **GitHub:** [@TimothyH3](https://github.com/TimothyH3)
- **Live Tool:** [tjhansen.net/starlink-surcharge-map](https://tjhansen.net/starlink-surcharge-map)

*Disclaimer: This is an independent open-source project created for personal travel planning. Starlink is a registered trademark of Space Exploration Technologies Corp (SpaceX). This tool is not affiliated with, endorsed by, or sponsored by Starlink or SpaceX.*
