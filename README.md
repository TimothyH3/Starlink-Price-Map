<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->
<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![LinkedIn][linkedin-shield]][linkedin-url]



<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/TimothyH3/Starlink-Price-Map">
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
      <path d="M2 12h20"/>
    </svg>
  </a>

  <h3 align="center">Starlink Price Map</h3>

  <p align="center">
    Geospatial map tracking Starlink Residential monthly service costs, regional pricing tiers, and demand surcharges across the United States.
    <br />
    <a href="https://tjhansen.net/starlink-surcharge-map"><strong>Explore the map »</strong></a>
    <br />
    <br />
    <a href="https://tjhansen.net/starlink-surcharge-map">View Live Demo</a>
    &middot;
    <a href="https://github.com/TimothyH3/Starlink-Price-Map/issues">Report Bug</a>
    &middot;
    <a href="https://github.com/TimothyH3/Starlink-Price-Map/issues">Request Feature</a>
  </p>
</div>


<img width="1437" height="815" alt="image" src="https://github.com/user-attachments/assets/b5b77a40-d5ad-40ac-a692-a7c93c02787a" />

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#why-i-built-this">Why I Built This</a></li>
        <li><a href="#respectful-server-traffic-methods">Respectful Server Traffic Methods</a></li>
        <li><a href="#pricing-tiers">Pricing Tiers</a></li>
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
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>


<!-- ABOUT THE PROJECT -->
## About The Project

This application maps Starlink Residential service pricing across the continental United States. It identifies regional price adjustments, base rates, upfront hardware surcharges, and cell capacity statuses.

### Why I Built This

I travel full-time and frequently change my Starlink Residential service address to stay connected. Starlink monthly rates vary depending on location:

* Discounted regions cost between $27.50 and $55.00/month.
* Standard base rate regions cost $120.00/month.
* Congested regions cost between $130.00 and $170.00+/month.
* Certain high-demand areas include an upfront $100 to $1,500 hardware surcharge, or require waitlist deposits when capacity is full.

Starlink does not provide a dedicated pricing map. The official availability map only indicates whether an area has service or a waitlist. Finding the price for a new location requires typing individual street addresses into the checkout flow one at a time. This makes budgeting internet costs difficult when planning travel.

This map provides an overview of service costs across the country so travelers can plan their bills before moving.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Respectful Server Traffic Methods

To avoid generating excess traffic on Starlink's checkout servers, the system uses the following methods:

* **25 km Spatial Caching (PostGIS):** When an address or coordinate is checked, the system queries Supabase PostGIS within a 25 km radius. If verified pricing exists within that range, it returns the cached result. No request is sent to Starlink.
* **Low-Frequency Edge Sampling:** Background data collection runs on a Cloudflare Worker Cron Trigger once every 10 minutes (`*/10 * * * *`). It probes 1 to 2 coordinates per run, generating 6 to 12 requests per hour.
* **Water Body Exclusion:** Ray-casting algorithms check coordinates before making network requests. Points falling into the Great Lakes, Gulf of Mexico, or coastal waters are discarded.
* **Land Boundary Verification:** Coordinates must resolve to a valid continental US state before qualification runs.
* **Direct REST Calls:** The worker calls the qualification endpoints directly, avoiding the bandwidth and resource overhead of headless browsers like Puppeteer or Selenium.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Pricing Tiers

Cells follow Uber H3 Resolution 5 hexagons (~12.5 km circumradius), matching Starlink beam coverage:

| Tier | Status Key | Monthly Price | Description |
| :--- | :--- | :--- | :--- |
| **Discounted** | `discounted` | **≤ $55.00/mo** | Regional discounts ($27.50, $38.50, $49.50, $55.00) in high-capacity markets |
| **Standard** | `standard` | **$55.00 – $130.00/mo** | Standard rate areas ($60.50, $66.00, $120.00 base rate) |
| **Congested** | `congested` | **$130.00 – $170.00/mo** | Cells with service price adjustments ($143.00, $156.00) |
| **High Demand** | `high_demand` | **≥ $170.00/mo** | Areas with recurring adjustments and/or upfront hardware surcharges ($100–$1,500) |
| **Unavailable** | `sold_out` | **N/A** | Cells at full capacity requiring a waitlist deposit |

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

To run a local copy of the project or deploy the worker, follow these steps.

### Prerequisites

* Node.js (v18+) and npm
  ```sh
  npm install npm@latest -g
  ```
* Cloudflare Wrangler CLI
  ```sh
  npm install -g wrangler
  ```
* A Supabase project with PostGIS enabled.

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/TimothyH3/Starlink-Price-Map.git
   cd Starlink-Price-Map
   ```
2. Install npm packages:
   ```sh
   npm install
   ```
3. Set up database tables:
   * Open the Supabase SQL editor.
   * Run the schema queries in [`supabase/schema.sql`](supabase/schema.sql).
4. Deploy the Cloudflare Worker:
   ```sh
   cd cloudflare-worker
   npm install
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler deploy
   ```
5. Run the frontend:
   ```sh
   npm run dev
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ROADMAP -->
## Roadmap

- [x] Baseline Continental US grid sampling
- [ ] Historical rate change tracking per cell
- [ ] Complete map coverage

See the [open issues](https://github.com/TimothyH3/Starlink-Price-Map/issues) for proposed features and bug reports.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTACT -->
## Contact

Timothy Hansen - [@TimothyH3](https://github.com/TimothyH3)

Project Link: [https://github.com/TimothyH3/Starlink-Price-Map](https://github.com/TimothyH3/Starlink-Price-Map)  
Live Tool: [https://tjhansen.net/starlink-surcharge-map](https://tjhansen.net/starlink-surcharge-map)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/TimothyH3/Starlink-Price-Map.svg?style=for-the-badge
[contributors-url]: https://github.com/TimothyH3/Starlink-Price-Map/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/TimothyH3/Starlink-Price-Map.svg?style=for-the-badge
[forks-url]: https://github.com/TimothyH3/Starlink-Price-Map/network/members
[stars-shield]: https://img.shields.io/github/stars/TimothyH3/Starlink-Price-Map.svg?style=for-the-badge
[stars-url]: https://github.com/TimothyH3/Starlink-Price-Map/stargazers
[issues-shield]: https://img.shields.io/github/issues/TimothyH3/Starlink-Price-Map.svg?style=for-the-badge
[issues-url]: https://github.com/TimothyH3/Starlink-Price-Map/issues
[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?style=for-the-badge&logo=linkedin&colorB=555
[linkedin-url]: https://linkedin.com/in/timothy-hansen-swe
[product-screenshot]: https://tjhansen.net/assets/images/project-3.svg

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
[H3-badge]: https://img.shields.io/badge/Uber_H3-000000?style=for-the-badge&logo=uber&logoColor=white
[H3-url]: https://h3geo.org/
[Vue-badge]: https://img.shields.io/badge/Vue.js-4FC08D?style=for-the-badge&logo=vuedotjs&logoColor=white
[Vue-url]: https://vuejs.org/
[Python-badge]: https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white
[Python-url]: https://www.python.org/
