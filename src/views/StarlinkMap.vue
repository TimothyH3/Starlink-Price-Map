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
          <h1 class="hud-title">Starlink Service Cost Map</h1>
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
            placeholder="Search US address, city, or zip (e.g. Denver, CO)..."
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
          <span class="legend-title">MONTHLY SERVICE TIERS</span>
          <span class="legend-count">{{ filteredCount }} NODES</span>
        </div>
        <div class="legend-items">
          <label class="legend-item tier-green" :class="{ disabled: !tierFilters.tierDiscount }">
            <input type="checkbox" v-model="tierFilters.tierDiscount" @change="applyTierFilters" />
            <span class="legend-swatch swatch-green"></span>
            <span class="legend-label">$55/mo Regional Discount</span>
            <span class="tier-count">({{ tierCounts.tierDiscount }})</span>
          </label>
          <label class="legend-item tier-cyan" :class="{ disabled: !tierFilters.tierStandard }">
            <input type="checkbox" v-model="tierFilters.tierStandard" @change="applyTierFilters" />
            <span class="legend-swatch swatch-cyan"></span>
            <span class="legend-label">$120/mo Standard Plan</span>
            <span class="tier-count">({{ tierCounts.tierStandard }})</span>
          </label>
          <label class="legend-item tier-orange" :class="{ disabled: !tierFilters.tierCongested }">
            <input type="checkbox" v-model="tierFilters.tierCongested" @change="applyTierFilters" />
            <span class="legend-swatch swatch-orange"></span>
            <span class="legend-label">$130+/mo Congestion Rate</span>
            <span class="tier-count">({{ tierCounts.tierCongested }})</span>
          </label>
          <label class="legend-item tier-red" :class="{ disabled: !tierFilters.tierSurcharge }">
            <input type="checkbox" v-model="tierFilters.tierSurcharge" @change="applyTierFilters" />
            <span class="legend-swatch swatch-red"></span>
            <span class="legend-label">+$100+ Demand Surcharge</span>
            <span class="tier-count">({{ tierCounts.tierSurcharge }})</span>
          </label>
          <label class="legend-item tier-purple" :class="{ disabled: !tierFilters.tierSoldOut }">
            <input type="checkbox" v-model="tierFilters.tierSoldOut" @change="applyTierFilters" />
            <span class="legend-swatch swatch-purple"></span>
            <span class="legend-label">Sold Out / Waitlist</span>
            <span class="tier-count">({{ tierCounts.tierSoldOut }})</span>
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
            <div class="card-status-banner" :class="getBannerClass(inspectedLocation)">
              <span class="banner-title font-mono">{{ getStatusTitle(inspectedLocation) }}</span>
              <span class="banner-surcharge font-mono">{{ isPending(inspectedLocation) ? 'PENDING' : '$' + getPointFee(inspectedLocation) + '/mo' }}</span>
            </div>

            <!-- Surcharge Callout Banner -->
            <div v-if="(inspectedLocation.surcharge_amount || 0) > 0" class="surcharge-alert-banner font-mono">
              <span>⚠️</span>
              <span>+${{ inspectedLocation.surcharge_amount }} ONE-TIME CONGESTION SURCHARGE</span>
            </div>
            <div v-else-if="!isPending(inspectedLocation) && inspectedLocation.status !== 'sold_out'" class="surcharge-none-banner font-mono">
              <span>✓</span>
              <span>No upfront demand surcharge ($0)</span>
            </div>

            <div class="card-details font-mono">
              <div class="detail-row">
                <span class="detail-label">MONTHLY SERVICE:</span>
                <span class="detail-value">{{ isPending(inspectedLocation) ? 'Awaiting check' : '$' + getPointFee(inspectedLocation) + '/mo' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">RATE BREAKDOWN:</span>
                <span class="detail-value font-sans" style="font-size:0.72rem;">{{ isPending(inspectedLocation) ? 'Unknown' : getRateBreakdownText(inspectedLocation) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">UPFRONT SURCHARGE:</span>
                <span class="detail-value" :style="{ color: (inspectedLocation.surcharge_amount || 0) > 0 ? '#ef4444' : '#34d399' }">{{ isPending(inspectedLocation) ? 'Pending' : ((inspectedLocation.surcharge_amount || 0) > 0 ? '+$' + inspectedLocation.surcharge_amount : '$0') }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">COORDINATES:</span>
                <span class="detail-value">{{ inspectedLocation.lat.toFixed(4) }}°N, {{ inspectedLocation.lng.toFixed(4) }}°W</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">LOCATION:</span>
                <span class="detail-value font-sans">{{ inspectedLocation.location_name || 'US Point' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">DATA STATUS:</span>
                <span class="detail-value">{{ inspectedLocation.isLiveVerified ? 'Verified Live from Starlink Checkout' : inspectedLocation.isUnsampled ? 'No verified sample in database' : (inspectedLocation.proximity_km === 0 ? 'Verified Ingested Node' : `Ingested Sample (${inspectedLocation.proximity_km?.toFixed(1)} km away)`) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">LAST CHECKED:</span>
                <span class="detail-value">{{ isPending(inspectedLocation) ? 'Awaiting check' : formatDate(inspectedLocation.sampled_at) }}</span>
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
                <span>{{ isCheckingLive ? 'PROBING STARLINK CHECKOUT...' : '⚡ CHECK LIVE STARLINK SERVICE COST' }}</span>
              </button>
              <p class="live-check-note font-sans">
                {{ inspectedLocation.isLiveVerified 
                  ? 'Directly qualified from Starlink checkout session via Cloudflare Worker proxy.' 
                  : inspectedLocation.isUnsampled
                    ? 'Click above to query live Starlink address qualification and checkout pricing.'
                    : 'Verified sample from Supabase PostGIS.' }}
              </p>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else class="empty-inspector font-sans">
            <div class="empty-icon">📍</div>
            <p class="empty-text">Click anywhere on the map or search an address to inspect local Starlink monthly service rates and congestion fees.</p>
          </div>
        </div>

        <!-- US Network Pricing Analytics -->
        <div class="sidebar-section">
          <h2 class="sidebar-heading font-mono">NETWORK PRICING STATS</h2>
          <div class="stats-grid font-mono">
            <div class="stat-box">
              <span class="stat-number text-accent">{{ stats.totalSamples }}</span>
              <span class="stat-label">TOTAL NODES</span>
            </div>
            <div class="stat-box">
              <span class="stat-number text-green">{{ stats.discountNodes }}</span>
              <span class="stat-label">DISCOUNT NODES</span>
            </div>
            <div class="stat-box">
              <span class="stat-number text-orange">{{ stats.totalSamples > 0 ? '$' + stats.avgMonthly + '/mo' : '$0' }}</span>
              <span class="stat-label">AVG SERVICE COST</span>
            </div>
            <div class="stat-box">
              <span class="stat-number text-crimson">{{ stats.surchargesFound }}</span>
              <span class="stat-label">SURCHARGES FOUND</span>
            </div>
          </div>
        </div>

        <!-- Architecture Specs Footer -->
        <div class="sidebar-section stack-specs font-mono">
          <h2 class="sidebar-heading">INFRASTRUCTURE STACK</h2>
          <ul class="specs-list">
            <li><span class="spec-bullet">•</span> 4-Step Starlink Qualification Pipeline</li>
            <li><span class="spec-bullet">•</span> PostGIS / Supabase Geometries</li>
            <li><span class="spec-bullet">•</span> Cloudflare Worker Edge Proxy</li>
            <li><span class="spec-bullet">•</span> Weekly Rotating Honeycomb Grid</li>
          </ul>
        </div>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';

declare const L: any;

interface SurchargeRecord {
  id?: number | string;
  lat: number;
  lng: number;
  monthly_service_fee?: number | null;
  service_price_adjustment?: number;
  surcharge_amount: number | null;
  status: 'standard' | 'discounted' | 'congested' | 'high_demand' | 'sold_out' | 'unsampled';
  sampled_at: string;
  sample_type?: string;
  location_name?: string;
  proximity_km?: number;
  isUnsampled?: boolean;
  isLiveVerified?: boolean;
}

// Configurable Endpoints
const SUPABASE_URL = (window as any).STARLINK_CONFIG?.SUPABASE_URL || 'https://lbwwynyvpvecgclvyqrv.supabase.co';
const SUPABASE_ANON_KEY = (window as any).STARLINK_CONFIG?.SUPABASE_ANON_KEY || 'public-anon-key';
let savedWorkerUrl = localStorage.getItem('starlink_worker_url');
if (savedWorkerUrl && savedWorkerUrl.includes('tjhansen.workers.dev')) {
  savedWorkerUrl = 'https://starlink-surcharge-worker.starlink-surcharge-map.workers.dev/api/check-fee';
  localStorage.setItem('starlink_worker_url', savedWorkerUrl);
}

const workerApiUrl = ref(
  savedWorkerUrl ||
  (window as any).STARLINK_CONFIG?.WORKER_API_URL ||
  'https://starlink-surcharge-worker.starlink-surcharge-map.workers.dev/api/check-fee'
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
  tierDiscount: true,
  tierStandard: true,
  tierCongested: true,
  tierSurcharge: true,
  tierSoldOut: true
});

const tierCounts = reactive({
  tierDiscount: 0,
  tierStandard: 0,
  tierCongested: 0,
  tierSurcharge: 0,
  tierSoldOut: 0
});

const stats = reactive({
  totalSamples: 0,
  discountNodes: 0,
  avgMonthly: 120,
  surchargesFound: 0
});

// Map Engine References
let mapInstance: any = null;
let markersLayerGroup: any = null;
let activePinMarker: any = null;
let rawSurchargeData: SurchargeRecord[] = [];

function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getPointFee(rec: SurchargeRecord): number {
  if (rec.monthly_service_fee !== undefined && rec.monthly_service_fee !== null) {
    return rec.monthly_service_fee;
  }
  if (rec.status === 'discounted') return 55;
  if (rec.status === 'congested') return 130;
  return 120;
}

function isPending(rec: SurchargeRecord): boolean {
  return !!rec.isUnsampled || rec.status === 'unsampled' || (rec.monthly_service_fee === null && rec.surcharge_amount === null);
}

function getTierColor(node: SurchargeRecord): string {
  if (node.status === 'sold_out') return '#c084fc';
  const s = node.surcharge_amount || 0;
  if (s > 0) return '#ef4444';
  const fee = getPointFee(node);
  if (fee > 120) return '#f97316';
  if (fee < 120) return '#10b981';
  return '#38bdf8';
}

function getBannerClass(rec: SurchargeRecord): string {
  if (rec.status === 'sold_out') return 'banner-sold_out';
  if ((rec.surcharge_amount || 0) > 0) return 'banner-high_demand';
  const fee = getPointFee(rec);
  if (fee > 120) return 'banner-congested';
  if (fee < 120) return 'banner-discount';
  if (isPending(rec)) return 'banner-unsampled';
  return 'banner-standard';
}

function getStatusTitle(rec: SurchargeRecord): string {
  if (rec.status === 'sold_out') return 'SOLD OUT / WAITLIST';
  if ((rec.surcharge_amount || 0) > 0) return 'CONGESTION SURCHARGE ZONE';
  const fee = getPointFee(rec);
  if (fee > 120) return 'CONGESTION ADJUSTED RATE';
  if (fee < 120) return 'REGIONAL CAPACITY DISCOUNT';
  if (isPending(rec)) return 'UNSAMPLED CELL';
  return 'STANDARD RESIDENTIAL PLAN';
}

function getRateBreakdownText(rec: SurchargeRecord): string {
  const fee = getPointFee(rec);
  const adj = fee - 120;
  if (adj > 0) return `+$${adj}/mo congestion adjustment above $120 base`;
  if (adj < 0) return `-$${Math.abs(adj)}/mo excess capacity regional discount`;
  return `Standard $120/mo base rate`;
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

async function initMap() {
  if (typeof L === 'undefined') {
    await loadLeafletScript();
  }

  if (!mapCanvas.value) return;

  mapInstance = L.map(mapCanvas.value, {
    center: [39.8283, -98.5795],
    zoom: 5,
    minZoom: 3,
    maxZoom: 14,
    zoomControl: false
  });

  L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16
  }).addTo(mapInstance);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    attribution: '',
    maxZoom: 16
  }).addTo(mapInstance);

  markersLayerGroup = L.layerGroup().addTo(mapInstance);

  mapInstance.on('click', (e: any) => {
    handleMapClick(e.latlng.lat, e.latlng.lng);
  });

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
        rawSurchargeData = [];
        supabaseOnline.value = true;
      }
    } else {
      rawSurchargeData = [];
      supabaseOnline.value = false;
    }
  } catch (err) {
    console.warn('Supabase fetch failed. Awaiting data ingestion.', err);
    rawSurchargeData = [];
    supabaseOnline.value = false;
  }

  computeStats();
  renderMarkers();
}

function computeStats() {
  const total = rawSurchargeData.length;
  stats.totalSamples = total;

  let discCount = 0;
  let stdCount = 0;
  let congCount = 0;
  let surchCount = 0;
  let soldCount = 0;
  let sumMonthly = 0;

  tierCounts.tierDiscount = 0;
  tierCounts.tierStandard = 0;
  tierCounts.tierCongested = 0;
  tierCounts.tierSurcharge = 0;
  tierCounts.tierSoldOut = 0;

  for (const item of rawSurchargeData) {
    const s = item.surcharge_amount || 0;
    const fee = getPointFee(item);
    const isSold = item.status === 'sold_out';

    sumMonthly += fee;

    if (isSold) soldCount++;
    if (s > 0) surchCount++;
    if (!isSold && fee < 120) discCount++;
    else if (!isSold && fee === 120) stdCount++;
    else if (!isSold && fee > 120) congCount++;
  }

  tierCounts.tierDiscount = discCount;
  tierCounts.tierStandard = stdCount;
  tierCounts.tierCongested = congCount;
  tierCounts.tierSurcharge = surchCount;
  tierCounts.tierSoldOut = soldCount;

  stats.discountNodes = discCount;
  stats.surchargesFound = surchCount;
  stats.avgMonthly = total > 0 ? Math.round(sumMonthly / total) : 120;
}

function renderMarkers() {
  if (!markersLayerGroup) return;
  markersLayerGroup.clearLayers();

  let count = 0;
  for (const node of rawSurchargeData) {
    const s = node.surcharge_amount || 0;
    const fee = getPointFee(node);
    const isSold = node.status === 'sold_out';

    if (isSold && !tierFilters.tierSoldOut) continue;
    if (s > 0 && !tierFilters.tierSurcharge) continue;
    if (!isSold && s === 0 && fee < 120 && !tierFilters.tierDiscount) continue;
    if (!isSold && s === 0 && fee === 120 && !tierFilters.tierStandard) continue;
    if (!isSold && s === 0 && fee > 120 && !tierFilters.tierCongested) continue;

    count++;
    const color = getTierColor(node);
    const radius = s > 0 ? 8.5 : fee > 120 ? 7.5 : fee < 120 ? 7.0 : 6.0;

    const marker = L.circleMarker([node.lat, node.lng], {
      radius,
      fillColor: color,
      color: '#ffffff',
      weight: 1.2,
      opacity: 0.9,
      fillOpacity: 0.8
    });

    const tip = isSold
      ? 'Waitlist / Sold Out'
      : s > 0
        ? `$${fee}/mo (+$${s} Surcharge)`
        : fee < 120
          ? `$${fee}/mo (Regional Discount)`
          : fee > 120
            ? `$${fee}/mo (Congestion Rate)`
            : `$120/mo Standard`;

    marker.bindTooltip(tip, { direction: 'top', offset: [0, -6] });

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

function handleMapClick(lat: number, lng: number) {
  let nearestNode: SurchargeRecord | null = null;
  let minDistance = Infinity;

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
    inspectedLocation.value = {
      lat,
      lng,
      monthly_service_fee: null,
      surcharge_amount: null,
      status: 'unsampled',
      isUnsampled: true,
      location_name: `Unsampled Coordinate (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`,
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

async function triggerLiveWorkerCheck(lat: number, lng: number) {
  isCheckingLive.value = true;
  liveQueryError.value = null;

  const targetUrl = `${workerApiUrl.value}?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const resp = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const result = await resp.json();
      if (result.source === 'verified_live' || result.source === 'postgis_cache') {
        const updatedRecord: SurchargeRecord = {
          lat: result.lat,
          lng: result.lng,
          monthly_service_fee: result.monthly_service_fee,
          service_price_adjustment: result.service_price_adjustment,
          surcharge_amount: result.surcharge_amount,
          status: result.status,
          sampled_at: result.timestamp || new Date().toISOString(),
          location_name: result.location_name || `Coordinate (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°W)`,
          proximity_km: result.distance_km || 0,
          isLiveVerified: result.source === 'verified_live',
          isUnsampled: false
        };
        inspectedLocation.value = updatedRecord;

        const existingIdx = rawSurchargeData.findIndex(
          p => Math.abs(p.lat - updatedRecord.lat) < 0.001 && Math.abs(p.lng - updatedRecord.lng) < 0.001
        );
        if (existingIdx >= 0) {
          rawSurchargeData[existingIdx] = updatedRecord;
        } else {
          rawSurchargeData.unshift(updatedRecord);
        }
        computeStats();
        renderMarkers();
      } else {
        inspectedLocation.value = {
          lat: result.lat,
          lng: result.lng,
          monthly_service_fee: result.monthly_service_fee,
          surcharge_amount: result.surcharge_amount,
          status: result.status || 'unsampled',
          sampled_at: result.timestamp || new Date().toISOString(),
          location_name: result.location_name || `Coordinate (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°W)`,
          isUnsampled: true,
          proximity_km: 0
        };
      }
      dropRadarPin(lat, lng);
    } else {
      let errBody = '';
      try { errBody = await resp.text(); } catch {}
      liveQueryError.value = {
        message: `HTTP ${resp.status} (${resp.statusText}): ${errBody || 'Proxy error'}`,
        endpoint: targetUrl,
        lat,
        lng
      };
    }
  } catch (err: any) {
    console.error('Failed to trigger live service cost check:', err);
    let reason = '';
    if (err.name === 'AbortError') {
      reason = 'Request timed out after 12 seconds. The Worker API endpoint did not respond.';
    } else {
      reason = `Network connection failed (${err.message || 'DNS Resolution Failed'}).`;
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
  z-index: 120;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.7);
  max-height: 280px;
  overflow-y: auto;
}

.search-dropdown-item {
  padding: 8px 14px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 120ms ease;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-coords {
  font-size: 0.68rem;
  color: #64748b;
  margin-top: 2px;
}

/* Controls */
.hud-controls {
  display: flex;
  align-items: center;
  gap: 14px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #eab308;
}
.pulse-dot.online {
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
}

.status-label {
  font-size: 0.7rem;
  color: #94a3b8;
  letter-spacing: 0.05em;
}

.hud-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 180ms ease;
}
.hud-action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
}

/* Main Workspace */
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
  min-width: 250px;
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
.swatch-green { background-color: #10b981; box-shadow: 0 0 6px rgba(16, 185, 129, 0.7); }
.swatch-cyan { background-color: #38bdf8; box-shadow: 0 0 6px rgba(56, 189, 248, 0.7); }
.swatch-orange { background-color: #f97316; box-shadow: 0 0 6px rgba(249, 115, 22, 0.7); }
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
.banner-discount {
  background: rgba(16, 185, 129, 0.14);
  border-bottom-color: rgba(16, 185, 129, 0.3);
}
.banner-discount .banner-surcharge {
  color: #34d399;
}
.banner-standard {
  background: rgba(56, 189, 248, 0.12);
  border-bottom-color: rgba(56, 189, 248, 0.25);
}
.banner-standard .banner-surcharge {
  color: #38bdf8;
}
.banner-congested {
  background: rgba(249, 115, 22, 0.14);
  border-bottom-color: rgba(249, 115, 22, 0.3);
}
.banner-congested .banner-surcharge {
  color: #fb923c;
}
.banner-high_demand {
  background: rgba(239, 68, 68, 0.15);
  border-bottom-color: rgba(239, 68, 68, 0.3);
}
.banner-high_demand .banner-surcharge {
  color: #ef4444;
}
.banner-sold_out {
  background: rgba(192, 132, 252, 0.15);
  border-bottom-color: rgba(192, 132, 252, 0.3);
}
.banner-sold_out .banner-surcharge {
  color: #c084fc;
}
.banner-unsampled {
  background: rgba(148, 163, 184, 0.1);
  border-bottom-color: rgba(148, 163, 184, 0.25);
}
.banner-unsampled .banner-surcharge {
  color: #94a3b8;
}

.banner-title {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.banner-surcharge {
  font-size: 1.15rem;
  font-weight: 700;
}

.surcharge-alert-banner {
  margin: 10px 14px 2px 14px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.14);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fca5a5;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.surcharge-none-banner {
  margin: 8px 14px 0 14px;
  padding: 6px 12px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #6ee7b7;
  font-size: 0.72rem;
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
.text-green { color: #34d399; }
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

/* Error Diagnostic Card */
.card-error {
  border-color: rgba(239, 68, 68, 0.35);
}
.error-detail-box {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 10px;
}
.error-detail-title {
  color: #ef4444;
  font-weight: 600;
  font-size: 0.7rem;
  margin-bottom: 4px;
}
.error-detail-msg {
  color: #fca5a5;
  font-size: 0.72rem;
  line-height: 1.4;
  margin-bottom: 8px;
}
.error-endpoint-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.68rem;
  color: #94a3b8;
}
.endpoint-code {
  background: rgba(0, 0, 0, 0.4);
  padding: 3px 6px;
  border-radius: 4px;
  color: #e2e8f0;
  word-break: break-all;
}

.worker-config-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.config-label {
  font-size: 0.7rem;
  color: #94a3b8;
}
.config-input-group {
  display: flex;
  gap: 6px;
}
.config-url-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  padding: 4px 8px;
  color: #ffffff;
  font-size: 0.72rem;
}
.config-save-btn {
  background: #0284c7;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 0.7rem;
  cursor: pointer;
}
.config-help {
  font-size: 0.68rem;
  color: #64748b;
  line-height: 1.4;
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
