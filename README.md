<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->
<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
<!--
*** Using markdown "reference style" links for clean readability.
*** See the bottom of this document for the declaration of reference variables.
-->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]
[![LinkedIn][linkedin-shield]][linkedin-url]



<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/TimothyH3/starlink-tracker">
    <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
      <path d="M12 6v6l4 2"/>
      <circle cx="12" cy="12" r="2" fill="#38bdf8"/>
      <path d="M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M19.07 4.93l-4.24 4.24M9.17 14.83l-4.24 4.24"/>
    </svg>
  </a>

  <h3 align="center">Starlink Residential Service Cost Map</h3>

  <p align="center">
    Interactive nationwide geospatial intelligence tool tracking monthly Starlink residential subscription fees ($27.50–$170+/mo), regional pricing tiers, and congestion surcharges.
    <br />
    <a href="https://tjhansen.net/starlink-surcharge-map"><strong>Explore Live Map »</strong></a>
    <br />
    <br />
    <a href="https://tjhansen.net/starlink-surcharge-map">View Live Demo</a>
    &middot;
    <a href="https://github.com/TimothyH3/starlink-tracker/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/TimothyH3/starlink-tracker/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>



<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#the-story-why-i-built-this">The Story: Why I Built This</a></li>
        <li><a href="#respectful-sampling--ethical-traffic-engineering">Respectful Sampling &amp; Ethical Traffic Engineering</a></li>
        <li><a href="#service-cost-tiers--visual-legend">Service Cost Tiers &amp; Visual Legend</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#architecture">Architecture</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

[![Starlink Service Cost Map Screen Shot][product-screenshot]](https://tjhansen.net/starlink-surcharge-map)

Starlink's satellite network is one of the greatest technological enablers for nomadic living and remote work. However, Starlink does not charge a uniform subscription fee across the United States. Depending on local satellite beam capacity, monthly rates vary between **$27.50/month** and **$170.00+/month**, accompanied by upfront congestion surcharges (**$100 to $1,500**) or sold-out waitlists.

This project delivers a transparent, real-time nationwide map of Starlink Residential pricing, cell congestion, and regional adjustments—giving travelers and prospective subscribers the ability to forecast internet bills before relocating.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### The Story: Why I Built This

I travel full-time and rely entirely on Starlink Residential to run my engineering work and stay connected across the country. Because my home is constantly on the move, I frequently update my service address to wherever I am parked or staying next.

When traveling, I quickly realized a major pain point: **Starlink does not offer a pricing map.**

The official Starlink availability map only shows binary coverage (Available vs. Waitlist). It gives zero indication of what your actual monthly subscription fee or upfront activation cost will be at your destination. To find out, you have to manually enter full street addresses into their public checkout flow one by one.

Pricing fluctuates dramatically by region:
* **Promotional Rural Discounts:** As low as **$27.50 to $55.00/month** in underserved regions with surplus capacity.
* **Standard Base Rate:** **$120.00/month** in balanced capacity markets.
* **Congested Cells:** Up to **$143.00 to $170.00+/month** due to recurring regional service price adjustments.
* **Demand Surcharges & Waitlists:** An additional **$100 to $1,500** upfront hardware surcharge in high-density corridors, or outright capacity freezes requiring waitlist deposits.

For digital nomads, RVers, and remote workers, this lack of visibility makes budgeting and planning travel itineraries a frustrating guessing game. I built this application to solve that problem: an interactive, verified geospatial map that makes satellite internet pricing completely transparent.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Respectful Sampling & Ethical Traffic Engineering

A core design priority was being an **exceptionally respectful internet citizen**. Starlink's checkout servers exist to serve real customers, not to be overwhelmed by aggressive automated scrapers.

The entire architecture is intentionally engineered to avoid generating unreasonable traffic and protect upstream infrastructure:

1. **25 km PostGIS Spatial Proximity Caching:**
   Whenever a user inspects an address or coordinates, the system first queries Supabase PostGIS using geodetic spatial indexing (`ST_DWithin` / `rpc/get_nearby_surcharge`) within a **25 km radius**. If a verified node already exists nearby, the pricing is returned instantly from the spatial cache. **Zero requests are sent to Starlink.**
2. **Ultra Low-Frequency Edge Micro-Sampling:**
   Automated background discovery is handled by a single Cloudflare Worker Cron Trigger running only **once every 10 minutes** (`*/10 * * * *`). Each run probes just 1–2 coordinates—generating only **6–12 requests per hour** for the entire platform.
3. **Geometric Water Body & Ocean Exclusion:**
   Ray-casting point-in-polygon algorithms automatically filter out coordinates landing in water bodies *before* any network request is created:
   * All five Great Lakes (Superior, Michigan, Huron, Erie, Ontario).
   * The Gulf of Mexico and offshore coastal waters.
   * Coordinates outside the Continental US (CONUS) land boundary polygon.
4. **Reverse Geocoding Land Gatekeeper:**
   Probed coordinates must resolve to an authentic street address or locality with a valid 2-letter CONUS state code. Open ocean Plus Codes and uninhabited coordinates are filtered out prior to qualification.
5. **Direct REST Pipeline (Zero Headless Browser Bloat):**
   Bypasses heavy headless browsers (Puppeteer, Playwright, Selenium). The worker executes only the four lightweight REST endpoints required for promotion evaluation (`reverse-geocode` → `leads` → `sign-up/lead` → `sign-up/pricing`) with session reuse and legitimate headers.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Service Cost Tiers & Visual Legend

The application maps service fees using hexagonal honeycomb cells (Uber H3 Resolution 5 at ~12.5 km circumradius, matching Starlink's physical spot beam geometry):

| Tier | Status Key | Monthly Price | Color | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Discounted** | `discounted` | **≤ $55.00/mo** | 🟢 Emerald Green | Heavy promotional discounts ($27.50, $38.50, $49.50, $55.00) in surplus capacity rural markets |
| **Standard** | `standard` | **$55.00 – $130.00/mo** | 🔵 Sky Blue | Standard baseline residential tier ($60.50, $66.00, $120.00 base rate) |
| **Congested** | `congested` | **$130.00 – $170.00/mo** | 🟠 Bright Orange | Capacity-adjusted cells ($143.00, $156.00) with monthly congestion penalties |
| **High Demand** | `high_demand` | **≥ $170.00/mo** | 🔴 Crimson Red | High congestion rate cells with upfront hardware surcharges ($100–$1,500) |
| **Unavailable** | `sold_out` | **N/A** | 🟣 Purple | Satellite beam at maximum capacity; waitlist deposit required |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* [![Cloudflare Workers][Cloudflare-badge]][Cloudflare-url]
* [![TypeScript][TypeScript-badge]][TypeScript-url]
* [![Supabase][Supabase-badge]][Supabase-url]
* [![PostgreSQL][PostgreSQL-badge]][PostgreSQL-url]
* [![Leaflet][Leaflet-badge]][Leaflet-url]
* [![Uber H3][H3-badge]][H3-url]
* [![Vue.js][Vue-badge]][Vue-url]
* [![Python][Python-badge]][Python-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

Follow these steps to run the application locally or deploy the edge worker proxy.

### Prerequisites

Ensure you have the following installed on your machine:
* **Node.js (v18+) & npm**
  ```sh
  npm install npm@latest -g
  ```
* **Cloudflare Wrangler CLI**
  ```sh
  npm install -g wrangler
  ```
* A free [Supabase](https://supabase.com) account (with PostGIS enabled).

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/TimothyH3/starlink-tracker.git
   cd starlink-tracker
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Set up your Supabase database:
   * Open your Supabase SQL Editor.
   * Run the SQL statements in [`supabase/schema.sql`](supabase/schema.sql) to create the `starlink_surcharges` table, GIST spatial index, RLS policies, and `get_nearby_surcharge` stored procedure.
4. Configure and deploy the Cloudflare Worker:
   ```sh
   cd cloudflare-worker
   npm install
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler deploy
   ```
5. Run the frontend application:
   ```sh
   # Run Vite development server
   npm run dev

   # Or serve the standalone production folder
   npx serve starlink-surcharge-map
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- USAGE EXAMPLES -->
## Usage

* **Address Search & Geocoding:** Type any US address or city into the search bar (powered by OpenStreetMap Nominatim with debounced autocomplete) to fly directly to that cell.
* **Proximity Cache Inspection:** Hovering or clicking on any hexagonal cell reveals its exact pricing breakdown, base monthly rate, regional adjustment, and distance to the nearest verified sample.
* **Live On-Demand Qualification:** Click *"Check Live Starlink Service Cost"* to trigger an authentic edge qualification session and record the latest pricing into PostGIS.
* **Corridor Quick-Jumps:** Use the HUD buttons to quickly jump to high-traffic travel corridors (Pacific Northwest, Intermountain West, Appalachia, Southeast, and Texas Hill Country).
* **Macro Mesh Mode:** Zoom out to observe blended regional density mesh overlays; zoom in to view individual resolution 5 hexagonal cells.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ARCHITECTURE -->
## Architecture

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

The system operates on a **100% free-tier serverless architecture** ($0.00/month operating cost):
* **Frontend:** Deployed to GitHub Pages as a static SPA with zero map tile licensing costs.
* **Edge Proxy:** Runs on Cloudflare Workers (100,000 free requests/day; cron uses ~144–288/day).
* **Database:** Supabase PostgreSQL with PostGIS for sub-millisecond geodetic indexing.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ROADMAP -->
## Roadmap

- [x] Full CONUS baseline grid sampling
- [x] Native Cloudflare Workers edge Cron Trigger background sampling
- [x] Geometric ray-casting water body exclusion (Great Lakes & oceans)
- [x] Updated tier thresholds ($55 discount, $55–$130 standard, $130–$170 congested, $170+ high demand)
- [x] 25 km geodetic PostGIS spatial proximity cache
- [x] Nominatim OpenStreetMap debounced search & fly-to controls
- [ ] Historical price drift tracking (alerting users when a cell changes pricing tiers)
- [ ] International market expansion (Canada, Mexico, and Australia)
- [ ] Exportable travel route fee estimator (calculating internet costs along a multi-stop road trip)

See the [open issues](https://github.com/TimothyH3/starlink-tracker/issues) for a full list of proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTACT -->
## Contact

**Timothy Hansen** - [tjhansen.net](https://tjhansen.net) - [@TimothyH3](https://github.com/TimothyH3)

Project Link: [https://github.com/TimothyH3/starlink-tracker](https://github.com/TimothyH3/starlink-tracker)  
Live Tool: [https://tjhansen.net/starlink-surcharge-map](https://tjhansen.net/starlink-surcharge-map)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [Uber H3 Hexagonal Hierarchical Spatial Index](https://h3geo.org/)
* [Leaflet.js](https://leafletjs.com/)
* [Esri World Dark Gray Canvas Basemap](https://www.esri.com/)
* [OpenStreetMap & Nominatim Geocoding](https://nominatim.openstreetmap.org/)
* [Cloudflare Workers & V8 Isolates](https://workers.cloudflare.com/)
* [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)
* [Best-README-Template by othneildrew](https://github.com/othneildrew/Best-README-Template)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[contributors-shield]: https://img.shields.io/github/contributors/TimothyH3/starlink-tracker.svg?style=for-the-badge
[contributors-url]: https://github.com/TimothyH3/starlink-tracker/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/TimothyH3/starlink-tracker.svg?style=for-the-badge
[forks-url]: https://github.com/TimothyH3/starlink-tracker/network/members
[stars-shield]: https://img.shields.io/github/stars/TimothyH3/starlink-tracker.svg?style=for-the-badge
[stars-url]: https://github.com/TimothyH3/starlink-tracker/stargazers
[issues-shield]: https://img.shields.io/github/issues/TimothyH3/starlink-tracker.svg?style=for-the-badge
[issues-url]: https://github.com/TimothyH3/starlink-tracker/issues
[license-shield]: https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge
[license-url]: https://github.com/TimothyH3/starlink-tracker/blob/main/LICENSE
[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?style=for-the-badge&logo=linkedin&colorB=555
[linkedin-url]: https://linkedin.com/in/timothy-hansen-swe
[product-screenshot]: https://tjhansen.net/assets/images/project-3.svg

<!-- Framework Badges -->
[Cloudflare-badge]: https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white
[Cloudflare-url]: https://workers.cloudflare.com/
[TypeScript-badge]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Supabase-badge]: https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white
[Supabase-url]: https://supabase.com/
[PostgreSQL-badge]: https://img.shields.io/badge/PostgreSQL_15+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white
[PostgreSQL-url]: https://www.postgresql.org/
[Leaflet-badge]: https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white
[Leaflet-url]: https://leafletjs.com/
[H3-badge]: https://img.shields.io/badge/Uber_H3_Spatial-000000?style=for-the-badge&logo=uber&logoColor=white
[H3-url]: https://h3geo.org/
[Vue-badge]: https://img.shields.io/badge/Vue.js_3-4FC08D?style=for-the-badge&logo=vuedotjs&logoColor=white
[Vue-url]: https://vuejs.org/
[Python-badge]: https://img.shields.io/badge/Python_3.11-3776AB?style=for-the-badge&logo=python&logoColor=white
[Python-url]: https://www.python.org/
