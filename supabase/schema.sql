-- ============================================================================
-- STARLINK HIGH-DEMAND CONGESTION SURCHARGE TRACKER
-- Supabase PostgreSQL + PostGIS Schema & Spatial Migrations
-- Target Database: Supabase PostgreSQL 15+ with PostGIS
-- ============================================================================

-- 1. Enable PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Drop existing objects if recreating (clean deployment)
-- DROP TABLE IF EXISTS starlink_surcharges CASCADE;

-- 3. Create starlink_surcharges Table
CREATE TABLE IF NOT EXISTS starlink_surcharges (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coordinates GEOMETRY(Point, 4326) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    surcharge_amount INTEGER NOT NULL DEFAULT 0 CHECK (surcharge_amount >= 0),
    status TEXT NOT NULL CHECK (status IN ('standard', 'high_demand', 'sold_out')),
    sampled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sample_type TEXT NOT NULL CHECK (sample_type IN ('scheduled_seed', 'radial_scatter', 'user_lookup')),
    location_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Spatial and Performance Indexes
-- GIST index for fast radius/spatial proximity queries (e.g. ST_DWithin)
CREATE INDEX IF NOT EXISTS idx_starlink_surcharges_geom 
    ON starlink_surcharges USING GIST (coordinates);

-- B-Tree indexes for filtering by tier, status, and freshness
CREATE INDEX IF NOT EXISTS idx_starlink_surcharges_sampled_at 
    ON starlink_surcharges (sampled_at DESC);

CREATE INDEX IF NOT EXISTS idx_starlink_surcharges_amount 
    ON starlink_surcharges (surcharge_amount);

CREATE INDEX IF NOT EXISTS idx_starlink_surcharges_status 
    ON starlink_surcharges (status);

-- Rounded spatial coordinate index to deduplicate/upsert points within ~500m
CREATE UNIQUE INDEX IF NOT EXISTS idx_starlink_surcharges_rounded_coords
    ON starlink_surcharges (ROUND(lat::NUMERIC, 3), ROUND(lng::NUMERIC, 3));

-- 5. Row Level Security (RLS) Configuration
ALTER TABLE starlink_surcharges ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access" ON starlink_surcharges;
DROP POLICY IF EXISTS "Allow service_role full access" ON starlink_surcharges;

-- Allow anon and authenticated clients read-only access (Used by frontend map client)
CREATE POLICY "Allow public read access" 
    ON starlink_surcharges 
    FOR SELECT 
    TO anon, authenticated 
    USING (true);

-- Restrict INSERT, UPDATE, DELETE to service_role (Used by GitHub Actions & Cloudflare Worker)
CREATE POLICY "Allow service_role full access" 
    ON starlink_surcharges 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- 6. Spatial Helper Functions & Stored Procedures (RPC)

-- Function: Upsert Surcharge Sample
-- Inserts a new sample or updates an existing coordinate within ~0.005 deg (~500m)
CREATE OR REPLACE FUNCTION upsert_starlink_surcharge(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_surcharge_amount INTEGER,
    p_status TEXT,
    p_sample_type TEXT,
    p_location_name TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id BIGINT;
    v_geom GEOMETRY(Point, 4326);
BEGIN
    v_geom := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

    INSERT INTO starlink_surcharges (
        coordinates, lat, lng, surcharge_amount, status, sampled_at, sample_type, location_name
    )
    VALUES (
        v_geom, p_lat, p_lng, p_surcharge_amount, p_status, NOW(), p_sample_type, p_location_name
    )
    ON CONFLICT (ROUND(lat::NUMERIC, 3), ROUND(lng::NUMERIC, 3))
    DO UPDATE SET
        surcharge_amount = EXCLUDED.surcharge_amount,
        status = EXCLUDED.status,
        sampled_at = NOW(),
        sample_type = EXCLUDED.sample_type,
        location_name = COALESCE(EXCLUDED.location_name, starlink_surcharges.location_name),
        coordinates = EXCLUDED.coordinates,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Function: Check Proximity Cache
-- Finds the nearest sample within a given radius in kilometers and maximum age in days
CREATE OR REPLACE FUNCTION get_nearby_surcharge(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_km DOUBLE PRECISION DEFAULT 25.0,
    p_max_age_days INTEGER DEFAULT 14
)
RETURNS TABLE (
    id BIGINT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    surcharge_amount INTEGER,
    status TEXT,
    sample_type TEXT,
    sampled_at TIMESTAMPTZ,
    distance_km DOUBLE PRECISION,
    days_ago INTEGER,
    is_cached BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_geom GEOMETRY(Point, 4326);
BEGIN
    v_target_geom := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

    RETURN QUERY
    SELECT 
        s.id,
        s.lat,
        s.lng,
        s.surcharge_amount,
        s.status,
        s.sample_type,
        s.sampled_at,
        ROUND((ST_Distance(s.coordinates::geography, v_target_geom::geography) / 1000.0)::NUMERIC, 2)::DOUBLE PRECISION AS distance_km,
        EXTRACT(DAY FROM (NOW() - s.sampled_at))::INTEGER AS days_ago,
        (s.sampled_at >= NOW() - (p_max_age_days || ' days')::INTERVAL) AS is_cached
    FROM starlink_surcharges s
    WHERE ST_DWithin(s.coordinates::geography, v_target_geom::geography, p_radius_km * 1000.0)
    ORDER BY ST_Distance(s.coordinates::geography, v_target_geom::geography) ASC
    LIMIT 1;
END;
$$;

-- Function: Export Full GeoJSON FeatureCollection
-- Highly optimized GeoJSON generator for MapLibre / Leaflet data sources
CREATE OR REPLACE FUNCTION get_surcharges_geojson()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'type', 'Feature',
                    'id', s.id,
                    'geometry', ST_AsGeoJSON(s.coordinates)::jsonb,
                    'properties', jsonb_build_object(
                        'id', s.id,
                        'lat', s.lat,
                        'lng', s.lng,
                        'surcharge_amount', s.surcharge_amount,
                        'status', s.status,
                        'sample_type', s.sample_type,
                        'sampled_at', s.sampled_at,
                        'location_name', s.location_name
                    )
                )
            ),
            '[]'::jsonb
        )
    )
    FROM starlink_surcharges s;
$$;

-- 7. Initial Seed Dataset (~60 Key US Broadband Corridors)
-- Seeds initial known bottlenecks across Pacific NW, Intermountain West, Appalachia, Southeast, and Texas
INSERT INTO starlink_surcharges (coordinates, lat, lng, surcharge_amount, status, sample_type, location_name, sampled_at)
VALUES
    -- Pacific Northwest (High Demand & Congestion Corridor)
    (ST_SetSRID(ST_MakePoint(-122.3321, 47.6062), 4326), 47.6062, -122.3321, 100, 'high_demand', 'scheduled_seed', 'Seattle Periphery, WA', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-121.3153, 44.0582), 4326), 44.0582, -121.3153, 250, 'high_demand', 'scheduled_seed', 'Bend Rural Corridor, OR', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-116.2023, 43.6150), 4326), 43.6150, -116.2023, 250, 'high_demand', 'scheduled_seed', 'Boise Valley, ID', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-114.3553, 48.1920), 4326), 48.1920, -114.3553, 500, 'high_demand', 'scheduled_seed', 'Kalispell Flathead, MT', NOW() - INTERVAL '3 days'),
    (ST_SetSRID(ST_MakePoint(-117.4260, 47.6588), 4326), 47.6588, -117.4260, 100, 'high_demand', 'scheduled_seed', 'Spokane County, WA', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-123.0868, 44.0521), 4326), 44.0521, -123.0868, 100, 'high_demand', 'scheduled_seed', 'Eugene Periphery, OR', NOW() - INTERVAL '3 days'),
    (ST_SetSRID(ST_MakePoint(-114.0076, 46.8721), 4326), 46.8721, -114.0076, 250, 'high_demand', 'scheduled_seed', 'Missoula Rural, MT', NOW() - INTERVAL '4 days'),
    (ST_SetSRID(ST_MakePoint(-111.0429, 45.6770), 4326), 45.6770, -111.0429, 500, 'high_demand', 'scheduled_seed', 'Bozeman Gallatin, MT', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-116.7804, 47.6777), 4326), 47.6777, -116.7804, 250, 'high_demand', 'scheduled_seed', 'Coeur d Alene, ID', NOW() - INTERVAL '2 days'),

    -- Intermountain West & Desert Corridors
    (ST_SetSRID(ST_MakePoint(-111.8910, 40.7608), 4326), 40.7608, -111.8910, 100, 'high_demand', 'scheduled_seed', 'Wasatch Front, UT', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-113.5684, 37.1041), 4326), 37.1041, -113.5684, 500, 'high_demand', 'scheduled_seed', 'St. George Basin, UT', NOW() - INTERVAL '3 days'),
    (ST_SetSRID(ST_MakePoint(-104.9903, 39.7392), 4326), 39.7392, -104.9903, 100, 'high_demand', 'scheduled_seed', 'Front Range Urban Fringe, CO', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-107.8801, 37.2753), 4326), 37.2753, -107.8801, 500, 'high_demand', 'scheduled_seed', 'Durango San Juan, CO', NOW() - INTERVAL '4 days'),
    (ST_SetSRID(ST_MakePoint(-106.8370, 39.1911), 4326), 39.1911, -106.8370, 1000, 'high_demand', 'scheduled_seed', 'Aspen Roaring Fork, CO', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-110.7624, 43.4799), 4326), 43.4799, -110.7624, 1000, 'high_demand', 'scheduled_seed', 'Jackson Hole Valley, WY', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-105.5005, 41.3114), 4326), 41.3114, -105.5005, 0, 'standard', 'scheduled_seed', 'Laramie Plains, WY', NOW() - INTERVAL '5 days'),
    (ST_SetSRID(ST_MakePoint(-111.6513, 35.1983), 4326), 35.1983, -111.6513, 500, 'high_demand', 'scheduled_seed', 'Flagstaff Coconino, AZ', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-110.0831, 34.2542), 4326), 34.2542, -110.0831, 500, 'high_demand', 'scheduled_seed', 'Show Low White Mtns, AZ', NOW() - INTERVAL '3 days'),
    (ST_SetSRID(ST_MakePoint(-111.8315, 34.8697), 4326), 34.8697, -111.8315, 500, 'high_demand', 'scheduled_seed', 'Sedona Red Rock, AZ', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-105.9378, 35.6870), 4326), 35.6870, -105.9378, 250, 'high_demand', 'scheduled_seed', 'Santa Fe Foothills, NM', NOW() - INTERVAL '3 days'),
    (ST_SetSRID(ST_MakePoint(-105.5734, 36.4072), 4326), 36.4072, -105.5734, 500, 'high_demand', 'scheduled_seed', 'Taos Valley, NM', NOW() - INTERVAL '4 days'),
    (ST_SetSRID(ST_MakePoint(-119.8138, 39.5296), 4326), 39.5296, -119.8138, 250, 'high_demand', 'scheduled_seed', 'Reno / Tahoe Basin, NV', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-115.1398, 36.1699), 4326), 36.1699, -115.1398, 0, 'standard', 'scheduled_seed', 'Clark County Periphery, NV', NOW() - INTERVAL '6 days'),

    -- Appalachia & Ozarks Corridors
    (ST_SetSRID(ST_MakePoint(-82.5515, 35.5951), 4326), 35.5951, -82.5515, 500, 'high_demand', 'scheduled_seed', 'Asheville Blue Ridge, NC', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-81.6758, 36.2168), 4326), 36.2168, -81.6758, 500, 'high_demand', 'scheduled_seed', 'Boone High Country, NC', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-83.5102, 35.7143), 4326), 35.7143, -83.5102, 1000, 'high_demand', 'scheduled_seed', 'Smoky Mtns Gatlinburg, TN', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-85.3097, 35.0456), 4326), 35.0456, -85.3097, 250, 'high_demand', 'scheduled_seed', 'Chattanooga Periphery, TN', NOW() - INTERVAL '3 days'),
    (ST_SetSRID(ST_MakePoint(-84.3880, 36.0104), 4326), 36.0104, -84.3880, 250, 'high_demand', 'scheduled_seed', 'Oak Ridge Cumberland, TN', NOW() - INTERVAL '4 days'),
    (ST_SetSRID(ST_MakePoint(-81.6326, 38.3498), 4326), 38.3498, -81.6326, 250, 'high_demand', 'scheduled_seed', 'Charleston Kanawha, WV', NOW() - INTERVAL '3 days'),
    (ST_SetSRID(ST_MakePoint(-79.9559, 39.6295), 4326), 39.6295, -79.9559, 250, 'high_demand', 'scheduled_seed', 'Morgantown Corridor, WV', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-84.5037, 38.0406), 4326), 38.0406, -84.5037, 100, 'high_demand', 'scheduled_seed', 'Lexington Bluegrass, KY', NOW() - INTERVAL '4 days'),
    (ST_SetSRID(ST_MakePoint(-83.4488, 37.2487), 4326), 37.2487, -83.4488, 500, 'high_demand', 'scheduled_seed', 'Hazard Eastern Coalfields, KY', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-79.9414, 37.2710), 4326), 37.2710, -79.9414, 250, 'high_demand', 'scheduled_seed', 'Roanoke Valley, VA', NOW() - INTERVAL '3 days'),
    (ST_SetSRID(ST_MakePoint(-78.8689, 38.4496), 4326), 38.4496, -78.8689, 250, 'high_demand', 'scheduled_seed', 'Shenandoah Valley, VA', NOW() - INTERVAL '4 days'),
    (ST_SetSRID(ST_MakePoint(-93.2185, 36.6437), 4326), 36.6437, -93.2185, 500, 'high_demand', 'scheduled_seed', 'Branson Ozark Lakes, MO', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-94.1574, 36.0626), 4326), 36.0626, -94.1574, 250, 'high_demand', 'scheduled_seed', 'Fayetteville Boston Mtns, AR', NOW() - INTERVAL '3 days'),

    -- Southeast & Gulf Coast Corridors
    (ST_SetSRID(ST_MakePoint(-84.0713, 34.5262), 4326), 34.5262, -84.0713, 500, 'high_demand', 'scheduled_seed', 'Dahlonega North GA, GA', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-83.3779, 33.9519), 4326), 33.9519, -83.3779, 100, 'high_demand', 'scheduled_seed', 'Athens Rural Outer, GA', NOW() - INTERVAL '3 days'),
    (ST_SetSRID(ST_MakePoint(-86.2996, 32.3792), 4326), 32.3792, -86.2996, 100, 'high_demand', 'scheduled_seed', 'Montgomery Black Belt, AL', NOW() - INTERVAL '4 days'),
    (ST_SetSRID(ST_MakePoint(-85.9767, 34.0143), 4326), 34.0143, -85.9767, 250, 'high_demand', 'scheduled_seed', 'Gadsden Lookout Mtn, AL', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-89.0928, 30.3674), 4326), 30.3674, -89.0928, 100, 'high_demand', 'scheduled_seed', 'Gulfport Hinterlands, MS', NOW() - INTERVAL '5 days'),
    (ST_SetSRID(ST_MakePoint(-86.1477, 30.4005), 4326), 30.4005, -86.1477, 500, 'high_demand', 'scheduled_seed', 'Destin Panhandle, FL', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-82.3248, 29.6516), 4326), 29.6516, -82.3248, 100, 'high_demand', 'scheduled_seed', 'Gainesville Nature Coast, FL', NOW() - INTERVAL '4 days'),
    (ST_SetSRID(ST_MakePoint(-81.3792, 28.5383), 4326), 28.5383, -81.3792, 0, 'standard', 'scheduled_seed', 'Central Florida Metro, FL', NOW() - INTERVAL '6 days'),

    -- Texas & South Central Corridors
    (ST_SetSRID(ST_MakePoint(-98.8719, 30.2752), 4326), 30.2752, -98.8719, 500, 'high_demand', 'scheduled_seed', 'Fredericksburg Hill Country, TX', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-97.7431, 30.2672), 4326), 30.2672, -97.7431, 100, 'high_demand', 'scheduled_seed', 'Austin Rural Exurb, TX', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-95.3698, 29.7604), 4326), 29.7604, -95.3698, 0, 'standard', 'scheduled_seed', 'Houston Outer Belt, TX', NOW() - INTERVAL '5 days'),
    (ST_SetSRID(ST_MakePoint(-97.1467, 31.5493), 4326), 31.5493, -97.1467, 250, 'high_demand', 'scheduled_seed', 'Waco Brazos Corridor, TX', NOW() - INTERVAL '3 days'),
    (ST_SetSRID(ST_MakePoint(-99.7331, 32.4487), 4326), 32.4487, -99.7331, 100, 'high_demand', 'scheduled_seed', 'Abilene West Plains, TX', NOW() - INTERVAL '4 days'),
    (ST_SetSRID(ST_MakePoint(-101.8552, 33.5779), 4326), 33.5779, -101.8552, 100, 'high_demand', 'scheduled_seed', 'Lubbock South Plains, TX', NOW() - INTERVAL '4 days'),
    (ST_SetSRID(ST_MakePoint(-97.5164, 35.4676), 4326), 35.4676, -97.5164, 0, 'standard', 'scheduled_seed', 'Oklahoma City Exurb, OK', NOW() - INTERVAL '6 days'),

    -- Great Lakes & Midwest Bottlenecks
    (ST_SetSRID(ST_MakePoint(-85.6206, 44.7631), 4326), 44.7631, -85.6206, 500, 'high_demand', 'scheduled_seed', 'Traverse City Northern MI, MI', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-87.3770, 46.5436), 4326), 46.5436, -87.3770, 250, 'high_demand', 'scheduled_seed', 'Marquette Upper Peninsula, MI', NOW() - INTERVAL '3 days'),
    (ST_SetSRID(ST_MakePoint(-89.6886, 45.8944), 4326), 45.8944, -89.6886, 500, 'high_demand', 'scheduled_seed', 'Minocqua Northwoods, WI', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-91.2396, 43.8014), 4326), 43.8014, -91.2396, 100, 'high_demand', 'scheduled_seed', 'La Crosse Driftless, WI', NOW() - INTERVAL '4 days'),
    (ST_SetSRID(ST_MakePoint(-94.1632, 46.3527), 4326), 46.3527, -94.1632, 250, 'high_demand', 'scheduled_seed', 'Brainerd Lakes, MN', NOW() - INTERVAL '3 days'),
    (ST_SetSRID(ST_MakePoint(-90.1848, 46.7867), 4326), 46.7867, -90.1848, 0, 'standard', 'scheduled_seed', 'Ironwood Border, MI/WI', NOW() - INTERVAL '5 days'),

    -- California & Southwest Hinterlands
    (ST_SetSRID(ST_MakePoint(-120.1278, 39.3280), 4326), 39.3280, -120.1278, 1000, 'high_demand', 'scheduled_seed', 'Truckee High Sierra, CA', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-118.9721, 37.6485), 4326), 37.6485, -118.9721, 1000, 'high_demand', 'scheduled_seed', 'Mammoth Lakes Eastern Sierra, CA', NOW() - INTERVAL '1 day'),
    (ST_SetSRID(ST_MakePoint(-122.3861, 41.3100), 4326), 41.3100, -122.3861, 500, 'high_demand', 'scheduled_seed', 'Mount Shasta Siskiyou, CA', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-123.7995, 39.3077), 4326), 39.3077, -123.7995, 500, 'high_demand', 'scheduled_seed', 'Mendocino Coast, CA', NOW() - INTERVAL '2 days'),
    (ST_SetSRID(ST_MakePoint(-116.8989, 33.1245), 4326), 33.1245, -116.8989, 250, 'high_demand', 'scheduled_seed', 'Ramona San Diego Foothills, CA', NOW() - INTERVAL '3 days'),
    (ST_SetSRID(ST_MakePoint(-116.3131, 34.1347), 4326), 34.1347, -116.3131, 500, 'high_demand', 'scheduled_seed', 'Joshua Tree High Desert, CA', NOW() - INTERVAL '1 day')
ON CONFLICT (ROUND(lat::NUMERIC, 3), ROUND(lng::NUMERIC, 3))
DO UPDATE SET
    surcharge_amount = EXCLUDED.surcharge_amount,
    status = EXCLUDED.status,
    sampled_at = EXCLUDED.sampled_at,
    sample_type = EXCLUDED.sample_type,
    location_name = EXCLUDED.location_name;

-- Completed Supabase Schema Setup.

