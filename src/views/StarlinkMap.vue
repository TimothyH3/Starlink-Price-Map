<template>
  <div class="starlink-map-container" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">
    <!-- Ambient Atmospheric Glows -->
    <div class="ambient-glow" aria-hidden="true"></div>
    <div class="ambient-glow glow-secondary" aria-hidden="true"></div>

    <!-- Top Navigation & Telemetry HUD -->
    <header class="map-hud-header">
      <div class="hud-brand">
        <a href="/" class="brand-back-btn" title="Return to Portfolio">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span class="font-mono">tjhansen.net</span>
        </a>
        <span class="hud-divider">/</span>
        <div class="hud-title-group">
          <h1 class="hud-title">Starlink High-Demand Surcharge Map</h1>
          <span class="hud-badge font-mono">LIVE TELEMETRY</span>
        </div>
      </div>

      <!-- Quick Search Bar -->
      <div class="hud-search-bar">
        <div class="search-input-wrapper">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            v-model="searchQuery"
            @input="onSearchInput"
            @keydown.enter="executeSearch"
            placeholder="Search US address, city, or zip (e.g. Bend, OR)..."
            class="search-input font-sans"
          />
          <button v-if="searchQuery" @click="clearSearch" class="search-clear-btn" aria-label="Clear search">✕</button>
        </div>

        <!-- Search Results Dropdown -->
        <ul v-if="searchResults.length > 0" class="search-dropdown font-sans">
          <li
            v-for="(item, idx) in searchResults"
            :key="idx"
            @click="selectSearchResult(item)"
            class="search-dropdown-item"
          >
            <div class="item-name">{{ item.display_name }}</div>
            <div class="item-coords font-mono">{{ item.lat.toFixed(4) }}, {{ item.lon.toFixed(4) }}</div>
          </li>
        </ul>
      </div>

      <!-- Quick Action Controls -->
      <div class="hud-controls">
        <div class="status-indicator" :title="'Database: ' + (supabaseOnline ? 'Connected' : 'Using Local Cache')">
          <span class="pulse-dot" :class="{ online: supabaseOnline }"></span>
          <span class="status-label font-mono">{{ supabaseOnline ? 'SUPABASE SYNCED' : 'OFFLINE CACHE' }}</span>
        </div>
        <button @click="toggleSidebar" class="hud-action-btn font-mono" title="Toggle Telemetry Sidebar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="9" y1="3" x2="9" y2="21"></line>
          </svg>
          <span>{{ isSidebarCollapsed ? 'PANEL' : 'HIDE' }}</span>
        </button>
      </div>
    </header>

    <!-- Main Workspace: Interactive Map Canvas -->
    <main class="map-viewport-wrapper">
      <div id="starlink-map-canvas" ref="mapCanvas" class="map-canvas"></div>

      <!-- Floating Map Legend & Tier Filters -->
      <div class="floating-legend font-mono">
        <div class="legend-header">
          <span class="legend-title">CONGESTION TIERS</span>
          <span class="legend-count">{{ filteredCount }} NODES</span>
        </div>
        <div class="legend-items">
          <label class="legend-item tier-cyan" :class="{ disabled: !tierFilters.tier0 }">
            <input type="checkbox" v-model="tierFilters.tier0" @change="applyTierFilters" />
            <span class="legend-swatch swatch-cyan"></span>
            <span class="legend-label">$0 Standard</span>
            <span class="tier-count">({{ tierCounts.tier0 }})</span>
          </label>
          <label class="legend-item tier-yellow" :class="{ disabled: !tierFilters.tier1 }">
            <input type="checkbox" v-model="tierFilters.tier1" @change="applyTierFilters" />
            <span class="legend-swatch swatch-yellow"></span>
            <span class="legend-label">$100–$250 Surcharge</span>
            <span class="tier-count">({{ tierCounts.tier1 }})</span>
          </label>
          <label class="legend-item tier-orange" :class="{ disabled: !tierFilters.tier2 }">
            <input type="checkbox" v-model="tierFilters.tier2" @change="applyTierFilters" />
            <span class="legend-swatch swatch-orange"></span>
            <span class="legend-label">$500–$750 Surcharge</span>
            <span class="tier-count">({{ tierCounts.tier2 }})</span>
          </label>
          <label class="legend-item tier-red" :class="{ disabled: !tierFilters.tier3 }">
            <input type="checkbox" v-model="tierFilters.tier3" @change="applyTierFilters" />
            <span class="legend-swatch swatch-red"></span>
            <span class="legend-label">$1,000+ Severe</span>
            <span class="tier-count">({{ tierCounts.tier3 }})</span>
          </label>
          <label class="legend-item tier-purple" :class="{ disabled: !tierFilters.soldOut }">
            <input type="checkbox" v-model="tierFilters.soldOut" @change="applyTierFilters" />
            <span class="legend-swatch swatch-purple"></span>
            <span class="legend-label">Sold Out / Waitlist</span>
            <span class="tier-count">({{ tierCounts.soldOut }})</span>
          </label>
        </div>
      </div>

      <!-- Macro Corridor Quick Jumps -->
      <div class="corridor-quickjumps font-mono">
        <span class="quickjump-label">REGIONS:</span>
        <button @click="flyToRegion([45.5, -120.5], 6)" class="quickjump-btn">Pacific NW</button>
        <button @click="flyToRegion([38.5, -109.5], 6)" class="quickjump-btn">Intermountain</button>
        <button @click="flyToRegion([36.5, -83.0], 6)" class="quickjump-btn">Appalachia</button>
        <button @click="flyToRegion([32.5, -85.5], 6)" class="quickjump-btn">Southeast</button>
        <button @click="flyToRegion([31.0, -99.0], 6)" class="quickjump-btn">Texas</button>
        <button @click="resetMapBounds" class="quickjump-btn reset-btn">Reset US</button>
      </div>

      <!-- Telemetry Drawer / Sidebar -->
      <aside v-show="!isSidebarCollapsed" class="telemetry-sidebar font-sans">
        <div class="sidebar-section">
          <h2 class="sidebar-heading font-mono">SELECTION INSPECTOR</h2>

          <!-- Live Query Diagnostic Error Card -->
          <div v-if="liveQueryError" class="inspector-card card-error">
            <div class="card-status-banner banner-high_demand">
              <span class="banner-title font-mono">⚠️ LIVE QUERY FAILED</span>
              <span class="banner-surcharge font-mono">OFFLINE</span>
            </div>

            <div class="card-details font-mono">
              <div class="error-detail-box">
                <div class="error-detail-title">FAILURE DIAGNOSTIC:</div>
                <div class="error-detail-msg">{{ liveQueryError.message }}</div>
                <div class="error-endpoint-row">
                  <span>ENDPOINT PROBED:</span>
                  <code class="endpoint-code">{{ liveQueryError.endpoint }}</code>
                </div>
              </div>

              <div class="worker-config-panel">
                <label class="config-label font-sans">Worker API Endpoint URL:</label>
                <div class="config-input-group">
                  <input type="text" v-model="workerApiUrl" class="font-mono config-url-input" placeholder="http://localhost:8787/api/check-fee" />
                  <button @click="saveWorkerUrl" class="font-mono config-save-btn">SAVE</button>
                </div>
                <div class="config-help font-sans">
                  • <strong>Local test:</strong> Run <code>cd cloudflare-worker && npm run dev</code><br/>
                  • <strong>Deploy live:</strong> Run <code>cd cloudflare-worker && npm run deploy</code>
                </div>
              </div>
            </div>

            <div class="card-actions">
              <button
                @click="retryLiveWorkerCheck"
                class="live-check-btn font-mono"
                :disabled="isCheckingLive"
              >
                <span v-if="isCheckingLive" class="spinner"></span>
                <span>{{ isCheckingLive ? 'QUERYING...' : '🔄 RETRY LIVE CHECK' }}</span>
              </button>
            </div>
          </div>

          <!-- Active Inspected Pin Card -->
          <div v-else-if="inspectedLocation" class="inspector-card">
            <div class="card-status-banner" :class="'banner-' + inspectedLocation.status">
              <span class="banner-title font-mono">{{ getStatusTitle(inspectedLocation) }}</span>
              <span class="banner-surcharge font-mono">${{ inspectedLocation.surcharge_amount }}</span>
            </div>

            <div class="card-details font-mono">
              <div class="detail-row">
                <span class="detail-label">COORDINATES:</span>
                <span class="detail-value">{{ inspectedLocation.lat.toFixed(4) }}°N, {{ inspectedLocation.lng.toFixed(4) }}°W</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">LOCATION:</span>
                <span class="detail-value font-sans">{{ inspectedLocation.location_name || 'US Point' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">CACHE DISTANCE:</span>
                <span class="detail-value">{{ inspectedLocation.proximity_km ? `${inspectedLocation.proximity_km.toFixed(1)} km` : 'Exact Pin' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">LAST CHECKED:</span>
                <span class="detail-value">{{ formatDate(inspectedLocation.sampled_at) }}</span>
              </div>
            </div>

            <!-- Live Worker Trigger Action -->
            <div class="card-actions">
              <button
                @click="triggerLiveWorkerCheck(inspectedLocation.lat, inspectedLocation.lng)"
                class="live-check-btn font-mono"
                :disabled="isCheckingLive"
              >
                <span v-if="isCheckingLive" class="spinner"></span>
                <span>{{ isCheckingLive ? 'QUERYING STARLINK...' : '⚡ CHECK EXACT LIVE SURCHARGE' }}</span>
              </button>
              <p class="live-check-note font-sans">
                Queries Cloudflare Worker API proxy to probe live Starlink qualification and caches into PostGIS.
              </p>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else class="empty-inspector font-sans">
            <div class="empty-icon">📍</div>
            <p class="empty-text">Click anywhere on the map or search an address to inspect local Starlink congestion surcharges.</p>
          </div>
        </div>

        <!-- US Network Congestion Analytics -->
        <div class="sidebar-section">
          <h2 class="sidebar-heading font-mono">NETWORK CAPACITY STATS</h2>
          <div class="stats-grid font-mono">
            <div class="stat-box">
              <span class="stat-number text-accent">{{ stats.totalSamples }}</span>
              <span class="stat-label">TOTAL NODES</span>
            </div>
            <div class="stat-box">
              <span class="stat-number text-red">{{ stats.highDemandCount }}</span>
              <span class="stat-label">SURCHARGE ZONES</span>
            </div>
            <div class="stat-box">
              <span class="stat-number text-orange">${{ stats.avgSurcharge }}</span>
              <span class="stat-label">AVG SURCHARGE</span>
            </div>
            <div class="stat-box">
              <span class="stat-number text-crimson">${{ stats.maxSurcharge }}</span>
              <span class="stat-label">MAX SURCHARGE</span>
            </div>
          </div>
        </div>

        <!-- Architecture Specs Footer -->
        <div class="sidebar-section stack-specs font-mono">
          <h2 class="sidebar-heading">INFRASTRUCTURE STACK</h2>
          <ul class="specs-list">
            <li><span class="spec-bullet">•</span> PostGIS / Supabase Geometries</li>
            <li><span class="spec-bullet">•</span> Cloudflare Worker Live Proxy</li>
            <li><span class="spec-bullet">•</span> Weekly GitHub Actions Cron</li>
            <li><span class="spec-bullet">•</span> Haversine Proximity Cache (25 km)</li>
          </ul>
        </div>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';

// Leaflet loaded via CDN in public index or dynamically imported
declare const L: any;

interface SurchargeRecord {
  id?: number | string;
  lat: number;
  lng: number;
  surcharge_amount: number;
  status: 'standard' | 'high_demand' | 'sold_out';
  sampled_at: string;
  sample_type?: string;
  location_name?: string;
  proximity_km?: number;
}

// Configurable Endpoints
const SUPABASE_URL = (window as any).STARLINK_CONFIG?.SUPABASE_URL || 'https://xyz.supabase.co';
const SUPABASE_ANON_KEY = (window as any).STARLINK_CONFIG?.SUPABASE_ANON_KEY || 'public-anon-key';
const workerApiUrl = ref(
  localStorage.getItem('starlink_worker_url') ||
  (window as any).STARLINK_CONFIG?.WORKER_API_URL ||
  'https://starlink-surcharge-worker.tjhansen.workers.dev/api/check-fee'
);

// Reactive State
const mapCanvas = ref<HTMLElement | null>(null);
const isSidebarCollapsed = ref(false);
const searchQuery = ref('');
const searchResults = ref<any[]>([]);
const supabaseOnline = ref(false);
const isCheckingLive = ref(false);
const inspectedLocation = ref<SurchargeRecord | null>(null);
const liveQueryError = ref<{ message: string; endpoint: string; lat: number; lng: number } | null>(null);
const filteredCount = ref(0);

const tierFilters = reactive({
  tier0: true,
  tier1: true,
  tier2: true,
  tier3: true,
  soldOut: true
});

const tierCounts = reactive({
  tier0: 0,
  tier1: 0,
  tier2: 0,
  tier3: 0,
  soldOut: 0
});

const stats = reactive({
  totalSamples: 0,
  highDemandCount: 0,
  avgSurcharge: 0,
  maxSurcharge: 0
});

// Map Engine References
let mapInstance: any = null;
let markersLayerGroup: any = null;
let activePinMarker: any = null;
let rawSurchargeData: SurchargeRecord[] = [];

// Fallback baseline dataset if Supabase is offline
const BASELINE_SEEDS: SurchargeRecord[] = [
  { lat: 47.6062, lng: -122.3321, surcharge_amount: 100, status: 'high_demand', location_name: 'Seattle Hinterlands, WA', sampled_at: '2026-11-05T04:00:00Z' },
  { lat: 44.0582, lng: -121.3153, surcharge_amount: 250, status: 'high_demand', location_name: 'Bend Deschutes, OR', sampled_at: '2026-11-04T04:00:00Z' },
  { lat: 43.6150, lng: -116.2023, surcharge_amount: 250, status: 'high_demand', location_name: 'Boise Valley, ID', sampled_at: '2026-11-03T04:00:00Z' },
  { lat: 48.1920, lng: -114.3553, surcharge_amount: 500, status: 'high_demand', location_name: 'Kalispell Flathead, MT', sampled_at: '2026-11-02T04:00:00Z' },
  { lat: 45.6770, lng: -111.0429, surcharge_amount: 500, status: 'high_demand', location_name: 'Bozeman Gallatin, MT', sampled_at: '2026-11-05T04:00:00Z' },
  { lat: 40.7608, lng: -111.8910, surcharge_amount: 100, status: 'high_demand', location_name: 'Wasatch Corridor, UT', sampled_at: '2026-11-04T04:00:00Z' },
  { lat: 37.1041, lng: -113.5684, surcharge_amount: 500, status: 'high_demand', location_name: 'St. George Basin, UT', sampled_at: '2026-11-03T04:00:00Z' },
  { lat: 39.1911, lng: -106.8370, surcharge_amount: 1000, status: 'high_demand', location_name: 'Aspen Roaring Fork, CO', sampled_at: '2026-11-05T04:00:00Z' },
  { lat: 43.4799, lng: -110.7624, surcharge_amount: 1000, status: 'high_demand', location_name: 'Jackson Hole, WY', sampled_at: '2026-11-05T04:00:00Z' },
  { lat: 35.1983, lng: -111.6513, surcharge_amount: 500, status: 'high_demand', location_name: 'Flagstaff Coconino, AZ', sampled_at: '2026-11-04T04:00:00Z' },
  { lat: 34.8697, lng: -111.8315, surcharge_amount: 500, status: 'high_demand', location_name: 'Sedona Red Rock, AZ', sampled_at: '2026-11-04T04:00:00Z' },
  { lat: 34.2542, lng: -110.0831, surcharge_amount: 500, status: 'high_demand', location_name: 'Show Low White Mtns, AZ', sampled_at: '2026-11-03T04:00:00Z' },
  { lat: 35.5951, lng: -82.5515, surcharge_amount: 500, status: 'high_demand', location_name: 'Asheville Blue Ridge, NC', sampled_at: '2026-11-05T04:00:00Z' },
  { lat: 35.7143, lng: -83.5102, surcharge_amount: 1000, status: 'high_demand', location_name: 'Gatlinburg Smokies, TN', sampled_at: '2026-11-05T04:00:00Z' },
  { lat: 38.3498, lng: -81.6326, surcharge_amount: 250, status: 'high_demand', location_name: 'Charleston Corridor, WV', sampled_at: '2026-11-04T04:00:00Z' },
  { lat: 34.5262, lng: -84.0713, surcharge_amount: 500, status: 'high_demand', location_name: 'Dahlonega North GA, GA', sampled_at: '2026-11-05T04:00:00Z' },
  { lat: 30.4005, lng: -86.1477, surcharge_amount: 500, status: 'high_demand', location_name: 'Destin Hinterland, FL', sampled_at: '2026-11-05T04:00:00Z' },
  { lat: 30.2752, lng: -98.8719, surcharge_amount: 500, status: 'high_demand', location_name: 'Fredericksburg Hill Country, TX', sampled_at: '2026-11-04T04:00:00Z' },
  { lat: 44.7631, lng: -85.6206, surcharge_amount: 500, status: 'high_demand', location_name: 'Traverse City, MI', sampled_at: '2026-11-03T04:00:00Z' },
  { lat: 45.8944, lng: -89.6886, surcharge_amount: 500, status: 'high_demand', location_name: 'Minocqua Northwoods, WI', sampled_at: '2026-11-04T04:00:00Z' },
  { lat: 39.3280, lng: -120.1278, surcharge_amount: 1000, status: 'high_demand', location_name: 'Truckee High Sierra, CA', sampled_at: '2026-11-05T04:00:00Z' },
  { lat: 37.6485, lng: -118.9721, surcharge_amount: 1000, status: 'high_demand', location_name: 'Mammoth Lakes, CA', sampled_at: '2026-11-05T04:00:00Z' },
  { lat: 34.1347, lng: -116.3131, surcharge_amount: 500, status: 'high_demand', location_name: 'Joshua Tree Desert, CA', sampled_at: '2026-11-04T04:00:00Z' },
  { lat: 28.5383, lng: -81.3792, surcharge_amount: 0, status: 'standard', location_name: 'Orlando Central Metro, FL', sampled_at: '2026-11-01T04:00:00Z' },
  { lat: 41.3114, lng: -105.5005, surcharge_amount: 0, status: 'standard', location_name: 'Laramie Basin, WY', sampled_at: '2026-11-01T04:00:00Z' }
];

// Haversine Distance Calculator (km)
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Color and Tier Mapping
function getTierColor(surcharge: number, status: string): string {
  if (status === 'sold_out') return '#c084fc'; // Purple
  if (surcharge >= 1000) return '#ef4444'; // Red
  if (surcharge >= 500) return '#fb923c'; // Orange
  if (surcharge >= 100) return '#facc15'; // Yellow
  return '#22d3ee'; // Soft Cyan ($0 Standard)
}

function getStatusTitle(rec: SurchargeRecord): string {
  if (rec.status === 'sold_out') return 'SOLD OUT / WAITLIST';
  if (rec.surcharge_amount >= 1000) return 'SEVERE CONGESTION SURCHARGE';
  if (rec.surcharge_amount >= 500) return 'HIGH DEMAND SURCHARGE';
  if (rec.surcharge_amount >= 100) return 'MODERATE SURCHARGE ZONE';
  return 'STANDARD RESIDENTIAL CAPACITY ($0)';
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 3600 * 24));
    if (diffDays <= 0) return 'Today (Live)';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  } catch {
    return dateStr;
  }
}

// Initialize Leaflet Map
async function initMap() {
  if (typeof L === 'undefined') {
    // Dynamically load Leaflet if not present on page
    await loadLeafletScript();
  }

  if (!mapCanvas.value) return;

  // Center on Contiguous US
  mapInstance = L.map(mapCanvas.value, {
    center: [39.8283, -98.5795],
    zoom: 5,
    minZoom: 3,
    maxZoom: 14,
    zoomControl: false
  });

  // Zoom control positioned in bottom-right
  L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

  // Esri World Dark Gray Canvas (100% Free, Zero API Key, Zero Watermark)
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16
  }).addTo(mapInstance);

  // Dark Gray Reference Overlay (Labels & US State Borders)
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    attribution: '',
    maxZoom: 16
  }).addTo(mapInstance);

  markersLayerGroup = L.layerGroup().addTo(mapInstance);

  // Map Click Handler: Drop Pin & Inspect Local Cache
  mapInstance.on('click', (e: any) => {
    handleMapClick(e.latlng.lat, e.latlng.lng);
  });

  // Load Data from Supabase (or fallback cache)
  await fetchSurchargeData();
}

function loadLeafletScript(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).L) return resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

// Fetch Surcharge Points from Supabase PostGIS
async function fetchSurchargeData() {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/starlink_surcharges?select=*&order=sampled_at.desc`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) {
        rawSurchargeData = data;
        supabaseOnline.value = true;
      } else {
        rawSurchargeData = BASELINE_SEEDS;
      }
    } else {
      rawSurchargeData = BASELINE_SEEDS;
    }
  } catch (err) {
    console.warn('Supabase fetch failed. Falling back to local cache.', err);
    rawSurchargeData = BASELINE_SEEDS;
  }

  computeStats();
  renderMarkers();
}

function computeStats() {
  stats.totalSamples = rawSurchargeData.length;
  let surcharges = 0;
  let maxS = 0;
  let highCount = 0;

  tierCounts.tier0 = 0;
  tierCounts.tier1 = 0;
  tierCounts.tier2 = 0;
  tierCounts.tier3 = 0;
  tierCounts.soldOut = 0;

  for (const item of rawSurchargeData) {
    const s = item.surcharge_amount || 0;
    if (s > maxS) maxS = s;
    if (s > 0) {
      surcharges += s;
      highCount++;
    }

    if (item.status === 'sold_out') tierCounts.soldOut++;
    else if (s >= 1000) tierCounts.tier3++;
    else if (s >= 500) tierCounts.tier2++;
    else if (s >= 100) tierCounts.tier1++;
    else tierCounts.tier0++;
  }

  stats.highDemandCount = highCount;
  stats.avgSurcharge = highCount > 0 ? Math.round(surcharges / highCount) : 0;
  stats.maxSurcharge = maxS;
}

// Render Surcharge Nodes onto Leaflet Layer
function renderMarkers() {
  if (!markersLayerGroup) return;
  markersLayerGroup.clearLayers();

  let count = 0;
  for (const node of rawSurchargeData) {
    const s = node.surcharge_amount || 0;
    const isSoldOut = node.status === 'sold_out';

    // Apply Tier Visibility Filters
    if (isSoldOut && !tierFilters.soldOut) continue;
    if (!isSoldOut && s === 0 && !tierFilters.tier0) continue;
    if (!isSoldOut && s >= 100 && s < 500 && !tierFilters.tier1) continue;
    if (!isSoldOut && s >= 500 && s < 1000 && !tierFilters.tier2) continue;
    if (!isSoldOut && s >= 1000 && !tierFilters.tier3) continue;

    count++;
    const color = getTierColor(s, node.status);
    const radius = s >= 1000 ? 9 : s >= 500 ? 8 : s >= 100 ? 7 : 5;

    const marker = L.circleMarker([node.lat, node.lng], {
      radius,
      fillColor: color,
      color: '#ffffff',
      weight: 1.2,
      opacity: 0.9,
      fillOpacity: 0.75
    });

    marker.on('click', (e: any) => {
      L.DomEvent.stopPropagation(e);
      inspectPoint(node);
    });

    markersLayerGroup.addLayer(marker);
  }
  filteredCount.value = count;
}

function applyTierFilters() {
  renderMarkers();
}

// Map Click: Check 25 km Proximity Cache
function handleMapClick(lat: number, lng: number) {
  let nearestNode: SurchargeRecord | null = null;
  let minDistance = Infinity;

  // Local spatial calculation using Haversine
  for (const node of rawSurchargeData) {
    const dist = calculateHaversineDistance(lat, lng, node.lat, node.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearestNode = node;
    }
  }

  const isCachedWithin25km = minDistance <= 25.0;

  if (isCachedWithin25km && nearestNode) {
    inspectedLocation.value = {
      ...nearestNode,
      proximity_km: minDistance,
      location_name: nearestNode.location_name || `Area near ${lat.toFixed(3)}°N, ${lng.toFixed(3)}°W`
    };
  } else {
    // Uncached location
    inspectedLocation.value = {
      lat,
      lng,
      surcharge_amount: 0,
      status: 'standard',
      location_name: `Uncached Coordinate (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`,
      sampled_at: new Date().toISOString(),
      proximity_km: minDistance < 1000 ? minDistance : undefined
    };
  }

  dropRadarPin(lat, lng);
}

function inspectPoint(node: SurchargeRecord) {
  inspectedLocation.value = { ...node, proximity_km: 0 };
  dropRadarPin(node.lat, node.lng);
}

function dropRadarPin(lat: number, lng: number) {
  if (activePinMarker) {
    mapInstance.removeLayer(activePinMarker);
  }

  const radarIcon = L.divIcon({
    className: 'radar-pin-container',
    html: `
      <div class="radar-pulse"></div>
      <div class="radar-dot"></div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  activePinMarker = L.marker([lat, lng], { icon: radarIcon }).addTo(mapInstance);
}

function saveWorkerUrl() {
  localStorage.setItem('starlink_worker_url', workerApiUrl.value);
  alert('Worker API URL updated to: ' + workerApiUrl.value);
}

function retryLiveWorkerCheck() {
  if (liveQueryError.value) {
    const { lat, lng } = liveQueryError.value;
    triggerLiveWorkerCheck(lat, lng);
  }
}

// Live Cloudflare Worker Lookup Proxy (Strict Live Query Mode)
async function triggerLiveWorkerCheck(lat: number, lng: number) {
  isCheckingLive.value = true;
  liveQueryError.value = null;

  const targetUrl = `${workerApiUrl.value}?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const resp = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const result = await resp.json();
      const updatedRecord: SurchargeRecord = {
        lat: result.lat,
        lng: result.lng,
        surcharge_amount: result.surcharge_amount,
        status: result.status,
        sampled_at: result.timestamp || new Date().toISOString(),
        location_name: `Verified Live: ${lat.toFixed(3)}°N, ${lng.toFixed(3)}°W`,
        proximity_km: 0
      };

      inspectedLocation.value = updatedRecord;
      rawSurchargeData.unshift(updatedRecord);
      computeStats();
      renderMarkers();
      dropRadarPin(lat, lng);
    } else {
      let errBody = '';
      try { errBody = await resp.text(); } catch (e) {}
      liveQueryError.value = {
        message: `HTTP ${resp.status} (${resp.statusText}): ${errBody || 'Proxy returned an error'}`,
        endpoint: targetUrl,
        lat,
        lng
      };
    }
  } catch (err: any) {
    console.error('Failed to trigger live surcharge checker:', err);
    let reason = '';
    if (err.name === 'AbortError') {
      reason = 'Request timed out after 6 seconds. The Worker API endpoint did not respond.';
    } else {
      reason = `Network connection failed (${err.message || 'DNS Resolution Failed'}). The Worker has not been deployed to this URL yet, or is blocked by network/CORS policy.`;
    }

    liveQueryError.value = {
      message: reason,
      endpoint: targetUrl,
      lat,
      lng
    };
  } finally {
    isCheckingLive.value = false;
  }
}

// Geocoding Search via OpenStreetMap Nominatim
let searchDebounceTimer: any = null;
function onSearchInput() {
  clearTimeout(searchDebounceTimer);
  if (!searchQuery.value || searchQuery.value.trim().length < 3) {
    searchResults.value = [];
    return;
  }

  searchDebounceTimer = setTimeout(async () => {
    try {
      const q = encodeURIComponent(`${searchQuery.value.trim()}, USA`);
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=5&q=${q}`);
      if (resp.ok) {
        const list = await resp.json();
        searchResults.value = list.map((item: any) => ({
          display_name: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon)
        }));
      }
    } catch (e) {
      console.warn('Geocoding search failed:', e);
    }
  }, 350);
}

function executeSearch() {
  if (searchResults.value.length > 0) {
    selectSearchResult(searchResults.value[0]);
  }
}

function selectSearchResult(item: any) {
  searchQuery.value = item.display_name.split(',')[0];
  searchResults.value = [];
  mapInstance.flyTo([item.lat, item.lon], 9, { duration: 1.4 });
  handleMapClick(item.lat, item.lon);
}

function clearSearch() {
  searchQuery.value = '';
  searchResults.value = [];
}

function flyToRegion(center: [number, number], zoom: number) {
  if (mapInstance) {
    mapInstance.flyTo(center, zoom, { duration: 1.2 });
  }
}

function resetMapBounds() {
  if (mapInstance) {
    mapInstance.flyTo([39.8283, -98.5795], 5, { duration: 1.2 });
  }
}

function toggleSidebar() {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
  setTimeout(() => {
    if (mapInstance) mapInstance.invalidateSize();
  }, 250);
}

onMounted(() => {
  initMap();
});

onBeforeUnmount(() => {
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
});
</script>

<style scoped>
/* ==========================================================================
   STARLINK HIGH-DEMAND SURCHARGE TELEMETRY STYLING (tjhansen.net Native)
   ========================================================================== */
.starlink-map-container {
  position: relative;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #07090e;
  color: #f1f5f9;
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

/* Ambient Glows */
.ambient-glow {
  position: absolute;
  top: -150px;
  right: -100px;
  width: 480px;
  height: 480px;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, transparent 70%);
  pointer-events: none;
  z-index: 5;
}
.glow-secondary {
  top: auto;
  bottom: -150px;
  left: -100px;
  background: radial-gradient(circle, rgba(129, 140, 248, 0.08) 0%, transparent 70%);
}

/* HUD Header */
.map-hud-header {
  height: 64px;
  background: rgba(7, 9, 14, 0.88);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  z-index: 100;
  gap: 16px;
}

.hud-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  font-size: 0.85rem;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 180ms ease;
  text-decoration: none;
}
.brand-back-btn:hover {
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.3);
  background: rgba(56, 189, 248, 0.08);
}

.hud-divider {
  color: #475569;
}

.hud-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hud-title {
  font-size: 0.98rem;
  font-weight: 600;
  color: #f8fafc;
  margin: 0;
  letter-spacing: -0.01em;
}

.hud-badge {
  font-size: 0.65rem;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
  letter-spacing: 0.05em;
}

/* Search Bar */
.hud-search-bar {
  position: relative;
  flex: 1;
  max-width: 480px;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 14px;
  color: #64748b;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 8px 36px 8px 40px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #f1f5f9;
  font-size: 0.88rem;
  outline: none;
  transition: border-color 180ms ease, background 180ms ease;
}
.search-input:focus {
  border-color: rgba(56, 189, 248, 0.5);
  background: rgba(255, 255, 255, 0.08);
}

.search-clear-btn {
  position: absolute;
  right: 12px;
  color: #94a3b8;
  font-size: 0.8rem;
  background: none;
  border: none;
  cursor: pointer;
}

.search-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: #0e121b;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  list-style: none;
  padding: 6px 0;
  margin: 0;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
  z-index: 200;
  max-height: 280px;
  overflow-y: auto;
}

.search-dropdown-item {
  padding: 8px 14px;
  cursor: pointer;
  transition: background 150ms ease;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.search-dropdown-item:last-child {
  border-bottom: none;
}
.search-dropdown-item:hover {
  background: rgba(56, 189, 248, 0.1);
}
.item-name {
  font-size: 0.82rem;
  color: #f1f5f9;
}
.item-coords {
  font-size: 0.72rem;
  color: #94a3b8;
  margin-top: 2px;
}

/* Controls */
.hud-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.72rem;
  color: #94a3b8;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #eab308;
  box-shadow: 0 0 8px rgba(234, 179, 8, 0.6);
}
.pulse-dot.online {
  background-color: #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
}

.hud-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  color: #f1f5f9;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 180ms ease;
}
.hud-action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

/* Viewport & Map */
.map-viewport-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  overflow: hidden;
}

.map-canvas {
  flex: 1;
  height: 100%;
  background: #07090e;
  z-index: 10;
}

/* Floating Legend */
.floating-legend {
  position: absolute;
  top: 18px;
  left: 18px;
  background: rgba(14, 18, 27, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 14px 16px;
  z-index: 50;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
  min-width: 230px;
}

.legend-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.76rem;
  color: #cbd5e1;
  cursor: pointer;
  user-select: none;
}
.legend-item.disabled {
  opacity: 0.4;
}

.legend-item input {
  cursor: pointer;
}

.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.swatch-cyan { background-color: #22d3ee; box-shadow: 0 0 6px rgba(34, 211, 238, 0.7); }
.swatch-yellow { background-color: #facc15; box-shadow: 0 0 6px rgba(250, 204, 21, 0.7); }
.swatch-orange { background-color: #fb923c; box-shadow: 0 0 6px rgba(251, 146, 60, 0.7); }
.swatch-red { background-color: #ef4444; box-shadow: 0 0 6px rgba(239, 68, 68, 0.7); }
.swatch-purple { background-color: #c084fc; box-shadow: 0 0 6px rgba(192, 132, 252, 0.7); }

.tier-count {
  margin-left: auto;
  color: #64748b;
  font-size: 0.7rem;
}

/* Quick Jumps */
.corridor-quickjumps {
  position: absolute;
  bottom: 24px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(14, 18, 27, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px 14px;
  z-index: 50;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
}

.quickjump-label {
  font-size: 0.72rem;
  color: #64748b;
}

.quickjump-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 0.74rem;
  cursor: pointer;
  transition: all 150ms ease;
}
.quickjump-btn:hover {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.3);
}
.quickjump-btn.reset-btn {
  color: #94a3b8;
  border-left: 1px solid rgba(255, 255, 255, 0.15);
  margin-left: 4px;
}

/* Telemetry Sidebar */
.telemetry-sidebar {
  width: 380px;
  height: 100%;
  background: #0b0e17;
  border-left: 1px solid rgba(255, 255, 255, 0.09);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  z-index: 60;
  box-shadow: -16px 0 40px rgba(0, 0, 0, 0.5);
}

.sidebar-section {
  padding: 20px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.sidebar-heading {
  font-size: 0.72rem;
  color: #64748b;
  letter-spacing: 0.08em;
  margin-bottom: 14px;
}

/* Inspector Card */
.inspector-card {
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  overflow: hidden;
}

.card-status-banner {
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(56, 189, 248, 0.1);
  border-bottom: 1px solid rgba(56, 189, 248, 0.2);
}
.banner-high_demand {
  background: rgba(239, 68, 68, 0.15);
  border-bottom-color: rgba(239, 68, 68, 0.3);
}
.banner-sold_out {
  background: rgba(192, 132, 252, 0.15);
  border-bottom-color: rgba(192, 132, 252, 0.3);
}

.banner-title {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.banner-surcharge {
  font-size: 1.15rem;
  font-weight: 700;
  color: #38bdf8;
}
.banner-high_demand .banner-surcharge {
  color: #ef4444;
}

.card-details {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.75rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
}
.detail-label {
  color: #64748b;
}
.detail-value {
  color: #e2e8f0;
}

.card-actions {
  padding: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.live-check-btn {
  width: 100%;
  padding: 10px 14px;
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #ffffff;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 180ms ease;
}
.live-check-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%);
  box-shadow: 0 0 16px rgba(56, 189, 248, 0.4);
}
.live-check-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.live-check-note {
  font-size: 0.7rem;
  color: #64748b;
  margin-top: 8px;
  line-height: 1.4;
  text-align: center;
}

/* Empty Inspector */
.empty-inspector {
  text-align: center;
  padding: 24px 16px;
  color: #64748b;
}
.empty-icon {
  font-size: 1.8rem;
  margin-bottom: 8px;
}
.empty-text {
  font-size: 0.82rem;
  line-height: 1.5;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-box {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-number {
  font-size: 1.25rem;
  font-weight: 700;
}
.stat-label {
  font-size: 0.68rem;
  color: #64748b;
}

.text-accent { color: #38bdf8; }
.text-red { color: #ef4444; }
.text-orange { color: #fb923c; }
.text-crimson { color: #f43f5e; }

/* Specs List */
.specs-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.72rem;
  color: #94a3b8;
}
.spec-bullet {
  color: #38bdf8;
  margin-right: 4px;
}

/* Radar Animation Marker */
:deep(.radar-pin-container) {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
:deep(.radar-dot) {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #38bdf8;
  border: 2px solid #ffffff;
  box-shadow: 0 0 10px #38bdf8;
}
:deep(.radar-pulse) {
  position: absolute;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid #38bdf8;
  animation: radarPing 1.6s cubic-bezier(0, 0, 0.2, 1) infinite;
}

@keyframes radarPing {
  75%, 100% {
    transform: scale(2.4);
    opacity: 0;
  }
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsiveness */
@media (max-width: 900px) {
  .map-hud-header {
    padding: 0 14px;
  }
  .hud-search-bar {
    max-width: 220px;
  }
  .corridor-quickjumps {
    display: none;
  }
  .telemetry-sidebar {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 320px;
  }
}
</style>

