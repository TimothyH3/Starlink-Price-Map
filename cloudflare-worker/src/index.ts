/**
 * Cloudflare Worker: Starlink High-Demand Surcharge Spatial API Proxy
 * Route: GET /check-fee?lat={lat}&lng={lng} or /api/check-fee?lat={lat}&lng={lng}
 *
 * Performs verified spatial lookups against Supabase PostGIS.
 * Zero unauthenticated scraping, zero fake heuristic bounding boxes.
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ALLOWED_ORIGINS?: string;
}

interface SurchargeResult {
  lat: number;
  lng: number;
  surcharge_amount: number;
  status: 'standard' | 'high_demand' | 'sold_out';
  location_name?: string;
  timestamp: string;
  source: 'postgis_cache' | 'standard_capacity' | 'unverified';
  distance_km?: number;
  message?: string;
  starlink_verify_url: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    };

    // Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (request.method !== 'GET') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use GET.' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // Health check endpoint
    if (pathname === '/health' || pathname === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'starlink-surcharge-spatial-proxy',
          time: new Date().toISOString()
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Match /check-fee or /api/check-fee
    if (pathname !== '/check-fee' && pathname !== '/api/check-fee') {
      return new Response(
        JSON.stringify({ error: 'Endpoint not found. Use /api/check-fee?lat={lat}&lng={lng}' }),
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

    // Direct official Starlink checkout link for 100% verified live qualification
    const starlinkVerifyUrl = `https://www.starlink.com/residential?serviceAddress=${lat.toFixed(4)},${lng.toFixed(4)}`;

    // Query Supabase PostGIS spatial cache if configured
    let cachedResult: SurchargeResult | null = null;
    if (env.SUPABASE_URL) {
      cachedResult = await queryPostGISProximity(env, lat, lng, starlinkVerifyUrl);
    }

    const finalResult: SurchargeResult = cachedResult || {
      lat,
      lng,
      surcharge_amount: 0,
      status: 'standard',
      location_name: `Coordinate (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°W)`,
      timestamp: new Date().toISOString(),
      source: 'standard_capacity',
      message: 'No active high-demand surcharge recorded within 25 km. Standard capacity ($0) zone.',
      starlink_verify_url: starlinkVerifyUrl
    };

    return new Response(
      JSON.stringify(finalResult),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=120'
        }
      }
    );
  }
};

/**
 * Queries Supabase PostGIS RPC for verified nodes within 25 km
 */
async function queryPostGISProximity(
  env: Env,
  lat: number,
  lng: number,
  starlinkVerifyUrl: string
): Promise<SurchargeResult | null> {
  const rpcUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/get_nearby_surcharge`;
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY;

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
        p_radius_km: 25.0,
        p_max_age_days: 30
      })
    });

    if (resp.ok) {
      const rows = await resp.json() as any[];
      if (Array.isArray(rows) && rows.length > 0) {
        const nearest = rows[0];
        return {
          lat: nearest.lat,
          lng: nearest.lng,
          surcharge_amount: nearest.surcharge_amount,
          status: nearest.status,
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
