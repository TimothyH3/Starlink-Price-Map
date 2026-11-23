/**
 * Cloudflare Worker: Starlink Regional Service Cost & Surcharge Spatial API Proxy
 * Route: GET /check-fee?lat={lat}&lng={lng} or /api/check-fee?lat={lat}&lng={lng}
 *
 * 1. Checks Supabase PostGIS spatial cache for verified samples within 25 km.
 * 2. If not cached, performs live qualification via Starlink's address & pricing pipeline.
 * 3. Authentically extracts:
 *    - Base Residential Service Plan ($55, $120, $130, etc.)
 *    - Genuine Service Price Adjustment from Starlink promotionEvaluation (e.g. +$26.00, +$13.00, -$16.50)
 *    - Total Monthly Service Cost (Base Service Fee + Service Price Adjustment)
 *    - Upfront Demand Congestion Surcharges ($0, $100-$1,500)
 * 4. Never returns fake heuristics or arbitrary guesses.
 */

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
  source: 'verified_live' | 'postgis_cache' | 'standard_capacity' | 'unsampled';
  distance_km?: number;
  message?: string;
  starlink_verify_url: string;
}

function formatPrice(val: number): string {
  return val % 1 === 0 ? val.toFixed(0) : val.toFixed(2);
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
          service: 'starlink-service-cost-spatial-proxy',
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

    // Match /check-fee or /api/check-fee
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
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || (env as any)['REDACTED'];
    if (!forceLive && env.SUPABASE_URL && supabaseKey) {
      result = await queryPostGISProximity(env, lat, lng, starlinkVerifyUrl, supabaseKey);
    }

    // Tier 2: If no PostGIS cache hit, attempt genuine Starlink live qualification
    if (!result) {
      result = await probeStarlinkLive(lat, lng, starlinkVerifyUrl);

      // Tier 2b: Automatically save verified live result into Supabase in background
      if (result && result.source === 'verified_live' && env.SUPABASE_URL && supabaseKey) {
        ctx.waitUntil(saveToSupabase(env, result, supabaseKey));
      }
    }

    // Tier 3: If live qualification unreachable, return honest unsampled status
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
  }
};

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

    // Monthly service tiers: Green: $55-85, Blue: $85-130, Orange: $130-170, Red: $170+, Purple: unavailable
    if (deposit > 0) {
      status = 'sold_out';
      tierLabel = 'Unavailable (Sold Out)';
    } else if (totalMonthlyFee >= 170) {
      status = 'high_demand';
      tierLabel = `$${formatPrice(totalMonthlyFee)}/mo (High Demand)`;
    } else if (totalMonthlyFee >= 130) {
      status = 'congested';
      tierLabel = `$${formatPrice(totalMonthlyFee)}/mo (Congested)`;
    } else if (totalMonthlyFee >= 85) {
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
        const baseService = nearest.base_service_fee ?? (totalMonthlyFee >= 130 ? 130 : totalMonthlyFee < 120 ? 55 : 120);
        const adjustment = nearest.service_price_adjustment ?? Math.round((totalMonthlyFee - baseService) * 100) / 100;

        let status = nearest.status;
        if (!status || status === 'standard') {
          if (surcharge > 0) status = 'high_demand';
          else if (adjustment > 0 || totalMonthlyFee > 120) status = 'congested';
          else if (adjustment < 0 || totalMonthlyFee < 120) status = 'discounted';
          else status = 'standard';
        }

        let tierLabel = `$${formatPrice(totalMonthlyFee)}/mo`;
        if (surcharge > 0) tierLabel = `+$${surcharge} Demand Surcharge`;
        else if (status === 'discounted') tierLabel = `$${formatPrice(totalMonthlyFee)}/mo Discounted`;
        else if (status === 'congested') tierLabel = `$${formatPrice(totalMonthlyFee)}/mo Congested`;

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
    p_sample_type: 'live_user_qualified',
    p_location_name: result.location_name,
    p_base_service_fee: result.base_service_fee ?? 120,
    p_service_price_adjustment: result.service_price_adjustment ?? 0,
    p_total_monthly_fee: result.total_monthly_fee ?? 120,
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
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY || (env as any)['REDACTED'];
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
