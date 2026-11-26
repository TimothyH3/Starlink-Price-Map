/**
 * Cloudflare Worker: Starlink Regional Service Cost & Surcharge Spatial API Proxy
 * Routes:
 *   - GET /check-fee?lat={lat}&lng={lng} or /api/check-fee
 *   - GET /points or /api/points
 *   - POST /ingest or /api/ingest
 *   - DELETE /points?filter=...
 *   - GET /api/cron-tick (Manual trigger / diagnostic)
 *   - GET /api/migrate-thresholds (Sync PostGIS database rows to new tier definitions)
 *
 * Scheduled Cron: Runs every 10 minutes ("* /10 * * * *") via native Cloudflare Cron Triggers.
 * Cost: $0.00 / month (Included entirely within free plan).
 */

import * as h3 from 'h3-js';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ALLOWED_ORIGINS?: string;
}

export interface ServiceCostResult {
  lat: number;
  lng: number;
  base_service_fee: number | null;
  service_price_adjustment: number;
  total_monthly_fee: number | null;
  monthly_service_fee: number | null; // Alias of total_monthly_fee for backward compatibility
  surcharge_amount: number | null;
  status: 'discounted' | 'standard' | 'congested' | 'high_demand' | 'sold_out' | 'unsampled';
  tier_label: string;
  adjustment_description?: string;
  location_name?: string;
  timestamp: string;
  last_checked?: string;
  source: 'verified_live' | 'postgis_cache' | 'standard_capacity' | 'unsampled' | 'cron_worker';
  distance_km?: number;
  message?: string;
  starlink_verify_url: string;
}

export interface MacroHex {
  h3Index: string;
  resolution: number;
  centerLat: number;
  centerLng: number;
  avgPrice: number;
  count: number;
  tier: 'discounted' | 'standard' | 'congested' | 'high_demand' | 'sold_out';
  color: string;
  boundary: [number, number][];
}

export interface MacroHexBundle {
  res4: MacroHex[];
  res3: MacroHex[];
  res2: MacroHex[];
}

function formatPrice(val: number): string {
  return val % 1 === 0 ? val.toFixed(0) : val.toFixed(2);
}

// ---------------------------------------------------------------------------
// CONUS & WATER BODY BOUNDARY VERIFICATION
// ---------------------------------------------------------------------------
const CONUS_STATES = new Set([
  'AL', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV',
  'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD',
  'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
]);

// Polygons covering water surfaces of the Great Lakes and Gulf of Mexico
const WATER_POLYGONS: Record<string, [number, number][]> = {
  lakeSuperior: [
    [46.7, -92.2], [47.0, -91.7], [47.4, -91.0], [47.9, -90.0], [48.0, -89.4],
    [48.3, -89.2], [48.8, -88.5], [49.0, -88.0], [48.8, -87.0], [48.8, -86.2],
    [48.0, -85.2], [47.5, -84.8], [46.8, -84.4], [46.4, -84.6], [46.5, -85.5],
    [46.7, -86.5], [46.5, -87.4], [46.9, -87.9], [47.4, -88.0], [47.4, -88.5],
    [47.0, -88.6], [46.8, -89.4], [46.7, -90.8], [46.7, -92.2]
  ],
  lakeMichigan: [
    [41.62, -87.20], [41.75, -87.50], [41.88, -87.60], [42.05, -87.66], [42.50, -87.80],
    [43.00, -87.88], [43.50, -87.75], [44.00, -87.60], [44.50, -87.45], [45.30, -87.00],
    [45.85, -87.00], [46.00, -86.50], [46.10, -85.70], [45.80, -84.75], [45.50, -84.95],
    [45.00, -85.40], [44.20, -86.35], [43.20, -86.35], [42.20, -86.45], [41.75, -86.85],
    [41.62, -87.20]
  ],
  lakeHuron: [
    [43.0, -82.4], [43.5, -82.5], [44.0, -83.0], [44.5, -83.4], [45.4, -83.5],
    [45.9, -84.3], [46.1, -84.1], [46.4, -83.7], [46.1, -82.5], [46.0, -81.0],
    [45.4, -80.4], [44.7, -79.8], [44.4, -80.5], [44.0, -81.7], [43.2, -82.0],
    [43.0, -82.4]
  ],
  lakeErie: [
    [41.4, -82.8], [41.6, -83.4], [41.9, -83.2], [42.0, -82.6], [42.3, -81.8],
    [42.7, -80.8], [42.9, -79.0], [42.8, -78.9], [42.5, -79.5], [42.1, -80.2],
    [41.7, -81.4], [41.4, -82.4], [41.4, -82.8]
  ],
  lakeOntario: [
    [43.3, -79.8], [43.6, -79.5], [43.8, -78.8], [44.0, -77.8], [44.2, -76.5],
    [44.0, -76.3], [43.6, -76.3], [43.3, -77.0], [43.2, -77.8], [43.2, -79.2],
    [43.3, -79.8]
  ],
  gulfOfMexico: [
    [24.0, -97.5], [26.0, -97.1], [27.8, -97.0], [28.5, -96.0], [29.0, -94.8],
    [29.4, -93.8], [29.2, -91.0], [28.8, -89.4], [30.0, -88.5], [30.0, -86.0],
    [29.6, -84.0], [28.0, -83.0], [26.5, -82.2], [25.0, -81.8], [24.3, -82.5],
    [24.0, -97.5]
  ]
};

function pointInPolygon(lat: number, lng: number, vs: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isWaterCoordinate(lat: number, lng: number): boolean {
  // Reject non-CONUS bounding box
  if (lat < 24.4 || lat > 49.4 || lng < -125.0 || lng > -66.9) {
    return true;
  }
  // Check Great Lakes and Gulf polygons
  for (const poly of Object.values(WATER_POLYGONS)) {
    if (pointInPolygon(lat, lng, poly)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// STRATEGIC TARGET LOCATIONS ACROSS CONTINENTAL US
// ---------------------------------------------------------------------------
const PRIORITY_CANDIDATE_TARGETS: { name: string; lat: number; lng: number }[] = [
  // Appalachia & Blue Ridge
  { name: 'Asheville Blue Ridge, NC', lat: 35.5951, lng: -82.5515 },
  { name: 'Boone Watauga High Country, NC', lat: 36.2168, lng: -81.6758 },
  { name: 'Gatlinburg Great Smoky Mtns, TN', lat: 35.7143, lng: -83.5102 },
  { name: 'Chattanooga Cumberland Plateau, TN', lat: 35.0456, lng: -85.3097 },
  { name: 'Knoxville Ridge Corridor, TN', lat: 36.0104, lng: -84.3880 },
  { name: 'Dahlonega North GA Mtns, GA', lat: 34.5262, lng: -84.0713 },
  { name: 'Hazard Eastern Coalfields, KY', lat: 37.2487, lng: -83.4488 },
  { name: 'Charleston Kanawha Valley, WV', lat: 38.3498, lng: -81.6326 },
  { name: 'Roanoke Blue Ridge Valley, VA', lat: 37.2710, lng: -79.9414 },
  { name: 'Shenandoah Valley, VA', lat: 38.4496, lng: -78.8689 },

  // Missouri Ozarks & Arkansas
  { name: 'Hartshorn Ozarks, MO', lat: 37.2650, lng: -91.6850 },
  { name: 'Branson Ozark Lakes, MO', lat: 36.6437, lng: -93.2185 },
  { name: 'Rolla Missouri Ozarks, MO', lat: 37.9514, lng: -91.7713 },
  { name: 'West Plains Ozark Highlands, MO', lat: 36.7281, lng: -91.8524 },
  { name: 'Fayetteville Ozarks, AR', lat: 36.0626, lng: -94.1574 },
  { name: 'Mountain Home Ozark Lakes, AR', lat: 36.3353, lng: -92.3854 },
  { name: 'Hot Springs Ouachita, AR', lat: 34.5037, lng: -93.0552 },

  // Pacific Northwest & Intermountain West
  { name: 'Seattle Puget Sound, WA', lat: 47.6062, lng: -122.3321 },
  { name: 'Spokane Inland Empire, WA', lat: 47.6588, lng: -117.4260 },
  { name: 'Bend Deschutes Corridor, OR', lat: 44.0582, lng: -121.3153 },
  { name: 'Eugene Willamette Valley, OR', lat: 44.0521, lng: -123.0868 },
  { name: 'Boise Treasure Valley, ID', lat: 43.6150, lng: -116.2023 },
  { name: 'Coeur d Alene Hinterland, ID', lat: 47.6777, lng: -116.7804 },
  { name: 'Kalispell Flathead Basin, MT', lat: 48.1920, lng: -114.3553 },
  { name: 'Bozeman Gallatin Valley, MT', lat: 45.6770, lng: -111.0429 },
  { name: 'Missoula Clark Fork, MT', lat: 46.8721, lng: -114.0076 },
  { name: 'Jackson Hole Teton, WY', lat: 43.4799, lng: -110.7624 },
  { name: 'Wasatch Front Salt Lake, UT', lat: 40.7608, lng: -111.8910 },
  { name: 'St. George Red Rock, UT', lat: 37.1041, lng: -113.5684 },

  // Rocky Mountains & Southwest
  { name: 'Aspen Roaring Fork, CO', lat: 39.1911, lng: -106.8370 },
  { name: 'Durango San Juan, CO', lat: 37.2753, lng: -107.8801 },
  { name: 'Denver Front Range, CO', lat: 39.7392, lng: -104.9903 },
  { name: 'Flagstaff Coconino, AZ', lat: 35.1983, lng: -111.6513 },
  { name: 'Sedona Oak Creek, AZ', lat: 34.8697, lng: -111.8315 },
  { name: 'Show Low White Mtns, AZ', lat: 34.2542, lng: -110.0831 },
  { name: 'Santa Fe Foothills, NM', lat: 35.6870, lng: -105.9378 },
  { name: 'Taos Enchanted Circle, NM', lat: 36.4072, lng: -105.5734 },

  // California & Nevada
  { name: 'Truckee Lake Tahoe Basin, CA', lat: 39.3280, lng: -120.1278 },
  { name: 'Mammoth Lakes Eastern Sierra, CA', lat: 37.6485, lng: -118.9721 },
  { name: 'Mount Shasta Siskiyou, CA', lat: 41.3100, lng: -122.3861 },
  { name: 'Mendocino Coastal Ridge, CA', lat: 39.3077, lng: -123.7995 },
  { name: 'Joshua Tree High Desert, CA', lat: 34.1347, lng: -116.3131 },
  { name: 'Reno Tahoe Corridor, NV', lat: 39.5296, lng: -119.8138 },

  // Texas & Deep South
  { name: 'Austin Travis Exurb, TX', lat: 30.2672, lng: -97.7431 },
  { name: 'Fredericksburg Hill Country, TX', lat: 30.2752, lng: -98.8719 },
  { name: 'Waco Brazos Corridor, TX', lat: 31.5493, lng: -97.1467 },
  { name: 'Lubbock South Plains, TX', lat: 33.5779, lng: -101.8552 },
  { name: 'Kerrville Guadalupe, TX', lat: 30.0474, lng: -99.1403 },
  { name: 'Huntsville Tennessee Valley, AL', lat: 34.6818, lng: -86.5810 },
  { name: 'Destin Inland Corridor, FL', lat: 30.4505, lng: -86.2000 },
  { name: 'Lakeland Polk Heartland, FL', lat: 28.0395, lng: -81.9498 },

  // Midwest & Northwoods
  { name: 'Minocqua Northwoods, WI', lat: 45.8944, lng: -89.6886 },
  { name: 'Traverse City Inland, MI', lat: 44.7000, lng: -85.5500 },
  { name: 'Brainerd Lakes, MN', lat: 46.3527, lng: -94.1632 },
  { name: 'Carbondale Shawnee, IL', lat: 37.7273, lng: -89.2168 },
  { name: 'Bloomington Hoosier, IN', lat: 39.1653, lng: -86.5264 }
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

    // Ingest batch endpoint
    if (request.method === 'POST' && (pathname === '/ingest' || pathname === '/api/ingest')) {
      try {
        const body = await request.json() as any;
        const records = Array.isArray(body) ? body : (body.records || [body]);
        let savedCount = 0;
        for (const rec of records) {
          if (typeof rec.lat === 'number' && typeof rec.lng === 'number') {
            await saveToSupabase(env, rec, supabaseKey);
            savedCount++;
          }
        }
        return new Response(
          JSON.stringify({ success: true, count: savedCount }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err?.message || 'Failed to ingest records' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Cron diagnostic probe endpoint: triggers one automated scheduled sampling batch manually
    if (pathname === '/api/cron-tick' || pathname === '/cron-tick') {
      try {
        const tickResult = await runScheduledSampling(env);
        return new Response(
          JSON.stringify({
            status: 'ok',
            type: 'manual_cron_trigger',
            timestamp: new Date().toISOString(),
            ...tickResult
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err?.message || 'Cron tick execution failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Database migration endpoint: synchronizes existing PostGIS rows to new tier definitions
    if (pathname === '/api/migrate-thresholds' || pathname === '/migrate-thresholds') {
      try {
        const migrationResult = await migrateSupabaseThresholds(env, supabaseKey);
        return new Response(
          JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            migration: migrationResult
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err?.message || 'Threshold migration failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Administrative delete endpoint
    if (request.method === 'DELETE' && (pathname === '/points' || pathname === '/api/points')) {
      const deleteFilter = url.searchParams.get('filter');
      if (!deleteFilter) {
        return new Response(
          JSON.stringify({ error: "Missing required 'filter' query parameter (e.g. location_name=like.86VG*)." }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const deleteUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/starlink_surcharges?${deleteFilter}`;
      try {
        const delResp = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=representation'
          }
        });
        const respText = await delResp.text();
        return new Response(respText, {
          status: delResp.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err?.message || 'Failed to delete records from Supabase' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (request.method !== 'GET') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use GET, POST, or DELETE.' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Health check
    if (pathname === '/health' || pathname === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'starlink-service-cost-spatial-proxy',
          cron: 'active (every 10 min)',
          time: new Date().toISOString()
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deliver all ingested nodes from Supabase to frontend
    if (pathname === '/points' || pathname === '/api/points') {
      const points = await fetchPointsFromSupabase(env);
      return new Response(
        JSON.stringify(points),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60, s-maxage=300'
          }
        }
      );
    }

    // Deliver precalculated high-level Uber H3 macro hexagons (Res 4 regional, Res 3 national, Res 2 continental)
    if (pathname === '/macro-hexes' || pathname === '/api/macro-hexes') {
      const bundle = await getPrecalculatedMacroHexes(env);
      const resParam = url.searchParams.get('res');
      let result: any = bundle;
      if (resParam === '4') result = bundle.res4;
      else if (resParam === '3') result = bundle.res3;
      else if (resParam === '2') result = bundle.res2;

      return new Response(
        JSON.stringify(result),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=120, s-maxage=600'
          }
        }
      );
    }

    // Single location lookup: GET /check-fee?lat={lat}&lng={lng}
    if (pathname !== '/check-fee' && pathname !== '/api/check-fee') {
      return new Response(
        JSON.stringify({ error: 'Endpoint not found. Use /api/check-fee?lat={lat}&lng={lng} or /api/points' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const latParam = url.searchParams.get('lat');
    const lngParam = url.searchParams.get('lng');

    if (!latParam || !lngParam) {
      return new Response(
        JSON.stringify({ error: "Missing required query parameters 'lat' and 'lng'." }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lat = parseFloat(latParam);
    const lng = parseFloat(lngParam);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return new Response(
        JSON.stringify({ error: "Invalid coordinate bounds. Latitude must be between -90 and 90, Longitude between -180 and 180." }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const starlinkVerifyUrl = `https://www.starlink.com/residential?serviceAddress=${lat.toFixed(4)},${lng.toFixed(4)}`;
    const forceLive = url.searchParams.get('force') === 'true' || url.searchParams.get('refresh') === 'true';

    // Tier 1: Query Supabase PostGIS spatial cache (radius 25 km) unless forced
    let result: ServiceCostResult | null = null;
    if (!forceLive && env.SUPABASE_URL && supabaseKey) {
      result = await queryPostGISProximity(env, lat, lng, starlinkVerifyUrl, supabaseKey);
    }

    // Tier 2: If no PostGIS cache hit, attempt genuine Starlink live qualification
    if (!result) {
      result = await probeStarlinkLive(lat, lng, starlinkVerifyUrl);

      // Save verified live result into Supabase in background
      if (result && result.source === 'verified_live' && env.SUPABASE_URL && supabaseKey) {
        ctx.waitUntil(saveToSupabase(env, result, supabaseKey));
      }
    }

    // Tier 3: Return unsampled status if unreachable
    const finalResult: ServiceCostResult = result || {
      lat,
      lng,
      base_service_fee: null,
      service_price_adjustment: 0,
      total_monthly_fee: null,
      monthly_service_fee: null,
      surcharge_amount: null,
      status: 'unsampled',
      tier_label: 'Unsampled Cell',
      location_name: `Coordinate (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°W)`,
      timestamp: new Date().toISOString(),
      source: 'unsampled',
      message: 'No verified sample in database within 25 km. Awaiting background sampling pipeline ingestion.',
      starlink_verify_url: starlinkVerifyUrl
    };

    return new Response(
      JSON.stringify(finalResult),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': finalResult.source === 'verified_live' ? 'public, max-age=3600' : 'public, max-age=60'
        }
      }
    );
  },

  /**
   * Cloudflare Worker Native Cron Trigger handler
   * Runs automatically every 10 minutes on Cloudflare's edge isolates.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledSampling(env));
  }
};

/**
 * Executes a deterministic scheduled sampling step across the Continental US
 */
async function runScheduledSampling(env: Env): Promise<{ sampled: any[]; message: string }> {
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!env.SUPABASE_URL || !supabaseKey) {
    return { sampled: [], message: 'Supabase credentials missing' };
  }

  // Deterministic 10-minute tick index ensures seamless progression without external DB state
  const tickIndex = Math.floor(Date.now() / (10 * 60 * 1000));
  const candidateIndex = tickIndex % PRIORITY_CANDIDATE_TARGETS.length;
  const target = PRIORITY_CANDIDATE_TARGETS[candidateIndex];

  // Secondary candidate target spaced half-way through the list
  const secondaryIndex = (candidateIndex + Math.floor(PRIORITY_CANDIDATE_TARGETS.length / 2)) % PRIORITY_CANDIDATE_TARGETS.length;
  const secondaryTarget = PRIORITY_CANDIDATE_TARGETS[secondaryIndex];

  const targetsToProbe = [target, secondaryTarget];
  const results: any[] = [];

  for (const t of targetsToProbe) {
    // Water gatekeeper: Skip coordinates inside Great Lakes or ocean
    if (isWaterCoordinate(t.lat, t.lng)) {
      console.warn(`[Cron Trigger] Skipping target in water body: ${t.name} (${t.lat}, ${t.lng})`);
      continue;
    }

    const starlinkVerifyUrl = `https://www.starlink.com/residential?serviceAddress=${t.lat.toFixed(4)},${t.lng.toFixed(4)}`;
    try {
      const liveRes = await probeStarlinkLive(t.lat, t.lng, starlinkVerifyUrl);
      if (liveRes && liveRes.source === 'verified_live') {
        liveRes.source = 'cron_worker';
        await saveToSupabase(env, liveRes, supabaseKey);
        results.push({
          target: t.name,
          lat: t.lat,
          lng: t.lng,
          total_monthly_fee: liveRes.total_monthly_fee,
          status: liveRes.status,
          location_name: liveRes.location_name
        });
      }
    } catch (err: any) {
      console.error(`[Cron Trigger] Probe error for ${t.name}:`, err?.message || err);
    }
  }

  return {
    sampled: results,
    message: `Cron tick completed. Probed ${results.length}/${targetsToProbe.length} targets successfully.`
  };
}

/**
 * Executes Starlink's exact address qualification and pricing flow:
 * 1. Reverse-geocode lat/lng -> place_id & address components
 * 2. POST /api/webagg/v1/public/leads -> processorToken
 * 3. GET /api/webagg/v1/public/sign-up/lead -> hydrates cart
 * 4. GET /api/webagg/v1/public/sign-up/pricing -> exact fee breakdown
 */
async function probeStarlinkLive(
  lat: number,
  lng: number,
  starlinkVerifyUrl: string
): Promise<ServiceCostResult | null> {
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Origin': 'https://starlink.com',
    'Referer': 'https://starlink.com/residential'
  };

  try {
    // 1. Reverse geocode
    const geoResp = await fetch(
      `https://starlink.com/api/marketing/v1/addresses/reverse-geocode?latitude=${lat}&longitude=${lng}`,
      { headers: browserHeaders }
    );
    if (!geoResp.ok) return null;
    const geoData = await geoResp.json() as any;
    const firstMatch = geoData?.content?.[0];
    if (!firstMatch) return null;

    const comps: Record<string, { short_name: string; long_name: string }> = {};
    for (const c of firstMatch.address_components || []) {
      if (c.types?.[0]) {
        comps[c.types[0]] = { short_name: c.short_name, long_name: c.long_name };
      }
    }

    const country = comps['country']?.short_name || 'US';
    const stateShort = comps['administrative_area_level_1']?.short_name || '';
    const stateLong = comps['administrative_area_level_1']?.long_name || '';
    const city = comps['locality']?.long_name || '';
    const zipCode = comps['postal_code']?.short_name || '';

    // Gatekeeper: Must be within Continental US land boundaries and have a valid address
    if (country !== 'US' || !CONUS_STATES.has(stateShort)) {
      console.warn(`[Starlink Live] Address is not within CONUS: ${firstMatch.formatted_address} (${stateShort}, ${country})`);
      return null;
    }

    // 2. Create Lead
    const leadPayload = {
      source: 0,
      sourceV2: '1',
      leadAttributes: {
        page: '/residential',
        activation: 'false'
      },
      countryCode: country,
      locale: 'en-US',
      latitude: lat,
      longitude: lng,
      formattedAddress: firstMatch.formatted_address,
      placeId: firstMatch.place_id,
      zipCode: zipCode,
      region: stateShort,
      administrativeArea: stateLong,
      locality: city
    };

    const leadResp = await fetch('https://starlink.com/api/webagg/v1/public/leads', {
      method: 'POST',
      headers: {
        ...browserHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(leadPayload)
    });
    if (!leadResp.ok) return null;
    const leadData = await leadResp.json() as any;
    const processorToken = leadData?.content?.processorToken;
    if (!processorToken) return null;

    // 3. Hydrate lead/cart session
    const hydrateResp = await fetch(
      `https://starlink.com/api/webagg/v1/public/sign-up/lead?processorToken=${processorToken}`,
      {
        headers: {
          ...browserHeaders,
          'Referer': `https://starlink.com/order?processorToken=${processorToken}`
        }
      }
    );
    if (!hydrateResp.ok) return null;

    // 4. Retrieve exact pricing breakdown
    const priceResp = await fetch(
      `https://starlink.com/api/webagg/v1/public/sign-up/pricing?processorToken=${processorToken}`,
      {
        headers: {
          ...browserHeaders,
          'Referer': `https://starlink.com/order?processorToken=${processorToken}`
        }
      }
    );
    if (!priceResp.ok) return null;
    const priceData = await priceResp.json() as any;
    const content = priceData?.content || {};

    const surchargeProds = content.demandSurchargeProducts || [];
    let surcharge = 0;
    if (surchargeProds.length > 0) {
      surcharge = surchargeProds[0].price || 0;
    }

    const deposit = content.depositAmount || 0;
    const baseServiceFee = content.serviceAmount ?? 120;

    // Authentically extract Service Price Adjustment from Starlink promotionEvaluation
    let servicePriceAdjustment = 0;
    let adjustmentDesc = 'Service Price Adjustment';

    const promoApps = content.promotionEvaluation?.promotionApplications || [];
    for (const app of promoApps) {
      const desc = (app.publicDescription || app.description || '').trim();
      if (/service.*adjustment|price.*adjustment/i.test(desc)) {
        servicePriceAdjustment = Number(app.unitDelta ?? app.lineDelta ?? 0);
        adjustmentDesc = app.publicDescription || 'Service Price Adjustment';
        break;
      }
    }

    // Total monthly service cost includes the adjustment added to the base
    const totalMonthlyFee = Math.round((baseServiceFee + servicePriceAdjustment) * 100) / 100;

    let status: 'discounted' | 'standard' | 'congested' | 'high_demand' | 'sold_out' = 'standard';
    let tierLabel = `$${formatPrice(totalMonthlyFee)}/mo Standard Base Rate`;

    // Monthly service tiers: Green: <= $55, Blue: $55-130, Orange: $130-170, Red: $170+, Purple: unavailable
    if (deposit > 0) {
      status = 'sold_out';
      tierLabel = 'Unavailable (Sold Out)';
    } else if (totalMonthlyFee >= 170) {
      status = 'high_demand';
      tierLabel = `$${formatPrice(totalMonthlyFee)}/mo (High Demand)`;
    } else if (totalMonthlyFee >= 130) {
      status = 'congested';
      tierLabel = `$${formatPrice(totalMonthlyFee)}/mo (Congested)`;
    } else if (totalMonthlyFee > 55) {
      status = 'standard';
      tierLabel = `$${formatPrice(totalMonthlyFee)}/mo (Standard)`;
    } else {
      status = 'discounted';
      tierLabel = `$${formatPrice(totalMonthlyFee)}/mo (Discounted)`;
    }

    let summaryMsg = '';
    if (deposit > 0) {
      summaryMsg = `Verified live from Starlink checkout: Cell capacity currently sold out (Waitlist deposit required).`;
    } else if (surcharge > 0) {
      summaryMsg = `Verified live from Starlink checkout: $${formatPrice(totalMonthlyFee)}/mo service ($${formatPrice(baseServiceFee)} base ${servicePriceAdjustment >= 0 ? '+' : '-'}$${formatPrice(Math.abs(servicePriceAdjustment))} adjustment) + $${surcharge} one-time congestion surcharge.`;
    } else if (servicePriceAdjustment !== 0) {
      const sign = servicePriceAdjustment > 0 ? '+' : '-';
      summaryMsg = `Verified live from Starlink checkout: $${formatPrice(totalMonthlyFee)}/mo service ($${formatPrice(baseServiceFee)} base ${sign}$${formatPrice(Math.abs(servicePriceAdjustment))} ${adjustmentDesc}).`;
    } else {
      summaryMsg = `Verified live from Starlink checkout: $${formatPrice(totalMonthlyFee)}/mo standard residential plan.`;
    }

    return {
      lat,
      lng,
      base_service_fee: baseServiceFee,
      service_price_adjustment: servicePriceAdjustment,
      total_monthly_fee: totalMonthlyFee,
      monthly_service_fee: totalMonthlyFee,
      surcharge_amount: surcharge,
      status,
      tier_label: tierLabel,
      adjustment_description: adjustmentDesc,
      location_name: firstMatch.formatted_address || `${city}, ${stateShort}`,
      timestamp: new Date().toISOString(),
      source: 'verified_live',
      message: summaryMsg,
      starlink_verify_url: starlinkVerifyUrl
    };
  } catch (err) {
    console.error('Starlink live probe error:', err);
    return null;
  }
}

/**
 * Queries Supabase PostGIS RPC for verified nodes within 25 km
 */
async function queryPostGISProximity(
  env: Env,
  lat: number,
  lng: number,
  starlinkVerifyUrl: string,
  apiKey: string
): Promise<ServiceCostResult | null> {
  const rpcUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/get_nearby_surcharge`;

  if (!apiKey) return null;

  try {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_lat: lat,
        p_lng: lng,
        p_radius_km: 10.0,
        p_max_age_days: 30
      })
    });

    if (resp.ok) {
      const rows = await resp.json() as any[];
      if (Array.isArray(rows) && rows.length > 0) {
        const nearest = rows[0];
        const surcharge = nearest.surcharge_amount || 0;
        const totalMonthlyFee = nearest.total_monthly_fee ?? nearest.monthly_service_fee ?? (nearest.status === 'discounted' ? 55 : nearest.status === 'congested' ? 143 : 120);
        const baseService = nearest.base_service_fee ?? (totalMonthlyFee >= 130 ? 130 : totalMonthlyFee <= 55 ? 55 : 120);
        const adjustment = nearest.service_price_adjustment ?? Math.round((totalMonthlyFee - baseService) * 100) / 100;

        let status = nearest.status;
        if (!status || status === 'standard') {
          if (surcharge > 0 || totalMonthlyFee >= 170) status = 'high_demand';
          else if (totalMonthlyFee >= 130) status = 'congested';
          else if (totalMonthlyFee > 55) status = 'standard';
          else status = 'discounted';
        }

        let tierLabel = `$${formatPrice(totalMonthlyFee)}/mo`;
        if (surcharge > 0) tierLabel = `+$${surcharge} Demand Surcharge`;
        else if (status === 'discounted') tierLabel = `$${formatPrice(totalMonthlyFee)}/mo Discounted`;
        else if (status === 'congested') tierLabel = `$${formatPrice(totalMonthlyFee)}/mo Congested`;
        else tierLabel = `$${formatPrice(totalMonthlyFee)}/mo Standard`;

        return {
          lat: nearest.lat,
          lng: nearest.lng,
          base_service_fee: baseService,
          service_price_adjustment: adjustment,
          total_monthly_fee: totalMonthlyFee,
          monthly_service_fee: totalMonthlyFee,
          surcharge_amount: surcharge,
          status,
          tier_label: tierLabel,
          location_name: nearest.location_name || `PostGIS Node (${nearest.lat.toFixed(3)}°, ${nearest.lng.toFixed(3)}°)`,
          timestamp: nearest.sampled_at,
          source: 'postgis_cache',
          distance_km: Math.round(nearest.distance_km * 10) / 10,
          message: `Matched verified PostGIS sample located ${Math.round(nearest.distance_km * 10) / 10} km away.`,
          starlink_verify_url: starlinkVerifyUrl
        };
      }
    }
  } catch (err) {
    console.error('PostGIS proximity query failed:', err);
  }

  return null;
}

/**
 * Saves a live-verified coordinate into Supabase PostGIS cache using stored procedure
 */
async function saveToSupabase(
  env: Env,
  result: ServiceCostResult,
  apiKey: string
): Promise<void> {
  if (!env.SUPABASE_URL || !apiKey) return;

  const rpcUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/upsert_starlink_surcharge`;
  const payload = {
    p_lat: result.lat,
    p_lng: result.lng,
    p_surcharge_amount: result.surcharge_amount ?? 0,
    p_status: result.status,
    p_sample_type: (result as any).sample_type || result.source || 'live_user_qualified',
    p_location_name: result.location_name,
    p_base_service_fee: result.base_service_fee ?? 120,
    p_service_price_adjustment: result.service_price_adjustment ?? 0,
    p_total_monthly_fee: result.total_monthly_fee ?? (result as any).monthly_service_fee ?? 120,
    p_adjustment_description: result.adjustment_description || 'Service Price Adjustment'
  };

  try {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.warn('Supabase upsert warning:', resp.status, errText);
    }
  } catch (err) {
    console.error('Error saving to Supabase:', err);
  }
}

/**
 * Fetches all ingested surcharge & service cost nodes from Supabase
 */
async function fetchPointsFromSupabase(env: Env): Promise<any[]> {
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!env.SUPABASE_URL || !apiKey) return [];

  try {
    const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/starlink_surcharges?select=*&order=sampled_at.desc`;
    const resp = await fetch(url, {
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (resp.ok) {
      const data = await resp.json();
      return Array.isArray(data) ? data : [];
    }
  } catch (err) {
    console.error('Failed to fetch points from Supabase:', err);
  }
  return [];
}

/**
 * Migrates existing PostGIS database rows to align with newly defined thresholds:
 * - total_monthly_fee > 55 AND total_monthly_fee < 130 -> 'standard'
 * - total_monthly_fee <= 55 -> 'discounted'
 */
async function migrateSupabaseThresholds(env: Env, apiKey: string): Promise<any> {
  if (!env.SUPABASE_URL || !apiKey) {
    return { error: 'Missing Supabase credentials' };
  }

  const baseUrl = env.SUPABASE_URL.replace(/\/$/, '');
  const headers = {
    'apikey': apiKey,
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // 1. Update any nodes between $55 and $130 to 'standard'
  const patchStandardUrl = `${baseUrl}/rest/v1/starlink_surcharges?total_monthly_fee=gt.55&total_monthly_fee=lt.130`;
  const stdResp = await fetch(patchStandardUrl, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'standard' })
  });
  const stdData = await stdResp.json();

  // 2. Update any nodes <= $55 to 'discounted'
  const patchDiscountUrl = `${baseUrl}/rest/v1/starlink_surcharges?total_monthly_fee=lte.55`;
  const discResp = await fetch(patchDiscountUrl, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'discounted' })
  });
  const discData = await discResp.json();

  return {
    updatedStandardCount: Array.isArray(stdData) ? stdData.length : stdData,
    updatedDiscountCount: Array.isArray(discData) ? discData.length : discData
  };
}

let cachedMacroBundle: MacroHexBundle | null = null;
let lastMacroCalcTime = 0;

/**
 * Returns precalculated Uber H3 macro hexagons representing regional & national averages.
 * Stored in server memory and edge-cached to prevent on-page-load computation.
 */
export async function getPrecalculatedMacroHexes(env: Env, forceRefresh: boolean = false): Promise<MacroHexBundle> {
  const now = Date.now();
  if (!forceRefresh && cachedMacroBundle && (now - lastMacroCalcTime) < 120000) {
    return cachedMacroBundle;
  }
  const points = await fetchPointsFromSupabase(env);
  cachedMacroBundle = {
    res4: computeMacroHexes(points, 4),
    res3: computeMacroHexes(points, 3),
    res2: computeMacroHexes(points, 2)
  };
  lastMacroCalcTime = now;
  return cachedMacroBundle;
}

/**
 * Computes high-level Uber H3 hexagons from granular Resolution 5 nodes for a given target resolution.
 * Calculates the average price for all cells within each parent hexagon and applies the tier color.
 */
export function computeMacroHexes(points: any[], targetRes: number = 4): MacroHex[] {
  const groups = new Map<string, { sum: number; count: number; soldCount: number; latSum: number; lngSum: number }>();

  for (const pt of points) {
    const lat = Number(pt.lat);
    const lng = Number(pt.lng);
    if (isNaN(lat) || isNaN(lng)) continue;

    const cost = pt.total_monthly_fee ?? pt.monthly_service_fee ?? (pt.status === 'discounted' ? 55 : pt.status === 'congested' ? 143 : 120);
    const isSold = pt.status === 'sold_out';

    // Parent cell in Uber H3 hierarchy (Res 4 = regional, Res 3 = national entire-US, Res 2 = continental)
    let parentCell: string | null = null;
    try {
      const latLngToCell = (h3 as any).latLngToCell || (h3 as any).geoToH3;
      const cellToParent = (h3 as any).cellToParent || (h3 as any).h3ToParent;
      if (typeof latLngToCell === 'function' && typeof cellToParent === 'function') {
        const r5 = latLngToCell(lat, lng, 5);
        parentCell = cellToParent(r5, targetRes);
      }
    } catch {
      parentCell = null;
    }

    if (!parentCell) continue;

    if (!groups.has(parentCell)) {
      groups.set(parentCell, { sum: 0, count: 0, soldCount: 0, latSum: 0, lngSum: 0 });
    }
    const g = groups.get(parentCell)!;
    g.sum += Number(cost);
    g.count++;
    g.latSum += lat;
    g.lngSum += lng;
    if (isSold) g.soldCount++;
  }

  const macroHexes: MacroHex[] = [];

  for (const [parentCell, g] of groups.entries()) {
    const avgPrice = Math.round((g.sum / g.count) * 100) / 100;
    let tier: 'discounted' | 'standard' | 'congested' | 'high_demand' | 'sold_out' = 'standard';
    let color = '#38bdf8'; // Blue: $55 - $130

    if (g.soldCount === g.count) {
      tier = 'sold_out';
      color = '#c084fc'; // Purple: unavailable
    } else if (avgPrice >= 170) {
      tier = 'high_demand';
      color = '#ef4444'; // Red: $170+
    } else if (avgPrice >= 130) {
      tier = 'congested';
      color = '#f97316'; // Orange: $130 - $170
    } else if (avgPrice > 55) {
      tier = 'standard';
      color = '#38bdf8'; // Blue: $55 - $130
    } else {
      tier = 'discounted';
      color = '#10b981'; // Green: $0 - $55
    }

    let boundary: [number, number][] = [];
    let centerLat = g.latSum / g.count;
    let centerLng = g.lngSum / g.count;

    try {
      const cellToBoundary = (h3 as any).cellToBoundary || (h3 as any).h3ToGeoBoundary;
      if (typeof cellToBoundary === 'function') {
        boundary = cellToBoundary(parentCell) as [number, number][];
      }
      const cellToLatLng = (h3 as any).cellToLatLng || (h3 as any).h3ToGeo;
      if (typeof cellToLatLng === 'function') {
        const center = cellToLatLng(parentCell);
        centerLat = center[0];
        centerLng = center[1];
      }
    } catch (err) {
      console.warn('Error computing boundary for H3 index:', parentCell, err);
    }

    if (boundary.length >= 3) {
      macroHexes.push({
        h3Index: parentCell,
        resolution: targetRes,
        centerLat,
        centerLng,
        avgPrice,
        count: g.count,
        tier,
        color,
        boundary
      });
    }
  }

  return macroHexes;
}
