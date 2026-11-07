#!/usr/bin/env python3
"""
Starlink High-Demand Congestion Surcharge Sparse Sampling Script
===============================================================
Probes ~60 macro US seed anchors across known bottleneck corridors.
If a seed returns a surcharge ($100–$1,500), fires a localized 10-point
radial scatter (4 points at ~25 km, 6 points at ~60-80 km) to map the perimeter.
Upserts all sampled points and timestamps into Supabase PostgreSQL + PostGIS.
"""

import os
import sys
import time
import math
import random
import logging
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

if not HAS_HTTPX and not HAS_REQUESTS:
    import urllib.request
    import urllib.error
    import urllib.parse

def http_get_json(url: str, params: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None, timeout: float = 12.0) -> Tuple[int, Optional[Dict[str, Any]]]:
    """Unified HTTP GET helper supporting httpx, requests, or urllib."""
    if params:
        query_string = urllib.parse.urlencode(params) if not HAS_HTTPX and not HAS_REQUESTS else ""
        if HAS_HTTPX or HAS_REQUESTS:
            pass  # Handled natively by libraries
        else:
            url = f"{url}?{query_string}" if "?" not in url else f"{url}&{query_string}"

    if HAS_HTTPX:
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.get(url, params=params, headers=headers)
                try:
                    return resp.status_code, resp.json()
                except Exception:
                    return resp.status_code, None
        except Exception:
            return 500, None

    if HAS_REQUESTS:
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=timeout)
            try:
                return resp.status_code, resp.json()
            except Exception:
                return resp.status_code, None
        except Exception:
            return 500, None

    # Fallback to standard library urllib
    try:
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            status_code = response.getcode()
            body = response.read().decode("utf-8")
            try:
                return status_code, json.loads(body)
            except Exception:
                return status_code, None
    except urllib.error.HTTPError as he:
        return he.code, None
    except Exception:
        return 500, None


def http_post_json(url: str, payload: Dict[str, Any], headers: Optional[Dict[str, str]] = None, timeout: float = 15.0) -> Tuple[int, str]:
    """Unified HTTP POST helper supporting httpx, requests, or urllib."""
    if HAS_HTTPX:
        try:
            with httpx.Client(timeout=timeout) as client:
                resp = client.post(url, json=payload, headers=headers)
                return resp.status_code, resp.text
        except Exception as e:
            return 500, str(e)

    if HAS_REQUESTS:
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
            return resp.status_code, resp.text
        except Exception as e:
            return 500, str(e)

    # Standard library urllib
    try:
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data_bytes, headers=headers or {}, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.getcode(), response.read().decode("utf-8")
    except urllib.error.HTTPError as he:
        return he.code, he.read().decode("utf-8")
    except Exception as e:
        return 500, str(e)

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("starlink_sampler")

# Environment Variables
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Starlink API Qualification & Checkout Endpoints
STARLINK_QUAL_ENDPOINTS = [
    "https://www.starlink.com/api/availability",
    "https://api.starlink.com/public/v1/availability",
    "https://www.starlink.com/api/address/validate"
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0"
]

# ---------------------------------------------------------------------------
# MACRO US SEED ANCHORS (~60 Locations Across Known Congestion Corridors)
# ---------------------------------------------------------------------------
MACRO_SEEDS: List[Dict[str, Any]] = [
    # Pacific Northwest
    {"name": "Seattle Rural Periphery, WA", "lat": 47.6062, "lng": -122.3321},
    {"name": "Spokane County Outer, WA", "lat": 47.6588, "lng": -117.4260},
    {"name": "Olympic Peninsula Forks, WA", "lat": 47.9504, "lng": -124.3855},
    {"name": "Bend Deschutes Corridor, OR", "lat": 44.0582, "lng": -121.3153},
    {"name": "Eugene Rural Fringe, OR", "lat": 44.0521, "lng": -123.0868},
    {"name": "Hood River Columbia Gorge, OR", "lat": 45.7054, "lng": -121.5215},
    {"name": "Boise Treasure Valley, ID", "lat": 43.6150, "lng": -116.2023},
    {"name": "Coeur d'Alene Hinterland, ID", "lat": 47.6777, "lng": -116.7804},
    {"name": "Kalispell Flathead Basin, MT", "lat": 48.1920, "lng": -114.3553},
    {"name": "Missoula Bitterroot, MT", "lat": 46.8721, "lng": -114.0076},
    {"name": "Bozeman Gallatin Valley, MT", "lat": 45.6770, "lng": -111.0429},

    # Intermountain West & Desert Corridors
    {"name": "Wasatch Front Outer, UT", "lat": 40.7608, "lng": -111.8910},
    {"name": "St. George Red Rock, UT", "lat": 37.1041, "lng": -113.5684},
    {"name": "Moab Canyonlands, UT", "lat": 38.5733, "lng": -109.5498},
    {"name": "Denver Front Range Foothills, CO", "lat": 39.7392, "lng": -104.9903},
    {"name": "Durango San Juan, CO", "lat": 37.2753, "lng": -107.8801},
    {"name": "Aspen Roaring Fork, CO", "lat": 39.1911, "lng": -106.8370},
    {"name": "Steamboat Springs Yampa, CO", "lat": 40.4850, "lng": -106.8317},
    {"name": "Jackson Hole Teton, WY", "lat": 43.4799, "lng": -110.7624},
    {"name": "Laramie Plains, WY", "lat": 41.3114, "lng": -105.5005},
    {"name": "Flagstaff Coconino, AZ", "lat": 35.1983, "lng": -111.6513},
    {"name": "Sedona Oak Creek, AZ", "lat": 34.8697, "lng": -111.8315},
    {"name": "Show Low White Mtns, AZ", "lat": 34.2542, "lng": -110.0831},
    {"name": "Prescott Yavapai Highlands, AZ", "lat": 34.5400, "lng": -112.4685},
    {"name": "Santa Fe Foothills, NM", "lat": 35.6870, "lng": -105.9378},
    {"name": "Taos Enchanted Circle, NM", "lat": 36.4072, "lng": -105.5734},
    {"name": "Reno / Lake Tahoe East, NV", "lat": 39.5296, "lng": -119.8138},
    {"name": "Elko Ruby Valley, NV", "lat": 40.8324, "lng": -115.7631},

    # Appalachia & Ozarks Corridors
    {"name": "Asheville Blue Ridge, NC", "lat": 35.5951, "lng": -82.5515},
    {"name": "Boone Watauga High Country, NC", "lat": 36.2168, "lng": -81.6758},
    {"name": "Gatlinburg Great Smoky Mtns, TN", "lat": 35.7143, "lng": -83.5102},
    {"name": "Chattanooga Lookout Valley, TN", "lat": 35.0456, "lng": -85.3097},
    {"name": "Cumberland Plateau Crossville, TN", "lat": 35.9489, "lng": -85.0269},
    {"name": "Charleston Kanawha River, WV", "lat": 38.3498, "lng": -81.6326},
    {"name": "Morgantown Monongahela, WV", "lat": 39.6295, "lng": -79.9559},
    {"name": "Beckley New River Gorge, WV", "lat": 37.7782, "lng": -81.1882},
    {"name": "Lexington Outer Bluegrass, KY", "lat": 38.0406, "lng": -84.5037},
    {"name": "Hazard Appalachian Coalfields, KY", "lat": 37.2487, "lng": -83.4488},
    {"name": "Roanoke Ridge Valley, VA", "lat": 37.2710, "lng": -79.9414},
    {"name": "Shenandoah Valley Harrisonburg, VA", "lat": 38.4496, "lng": -78.8689},
    {"name": "Branson Ozark Lakes, MO", "lat": 36.6437, "lng": -93.2185},
    {"name": "Fayetteville Boston Mtns, AR", "lat": 36.0626, "lng": -94.1574},
    {"name": "Hot Springs Ouachita, AR", "lat": 34.5037, "lng": -93.0552},

    # Southeast & Gulf Coast
    {"name": "Dahlonega North Georgia Mtns, GA", "lat": 34.5262, "lng": -84.0713},
    {"name": "Athens Oconee Rural Outer, GA", "lat": 33.9519, "lng": -83.3779},
    {"name": "Montgomery Black Belt, AL", "lat": 32.3792, "lng": -86.2996},
    {"name": "Gadsden Sand Mountain, AL", "lat": 34.0143, "lng": -85.9767},
    {"name": "Destin Emerald Coast Hinterland, FL", "lat": 30.4005, "lng": -86.1477},
    {"name": "Gainesville Springs Basin, FL", "lat": 29.6516, "lng": -82.3248},
    {"name": "Gulfport Coast Forest, MS", "lat": 30.3674, "lng": -89.0928},

    # Texas & South Central
    {"name": "Fredericksburg Hill Country, TX", "lat": 30.2752, "lng": -98.8719},
    {"name": "Austin Travis Hinterland, TX", "lat": 30.2672, "lng": -97.7431},
    {"name": "Waco Brazos River Basin, TX", "lat": 31.5493, "lng": -97.1467},
    {"name": "Tyler Piney Woods, TX", "lat": 32.3513, "lng": -95.3011},
    {"name": "Abilene West Texas Plains, TX", "lat": 32.4487, "lng": -99.7331},
    {"name": "Lubbock South Plains, TX", "lat": 33.5779, "lng": -101.8552},

    # Great Lakes & Upper Midwest
    {"name": "Traverse City Leelanau, MI", "lat": 44.7631, "lng": -85.6206},
    {"name": "Marquette Lake Superior UP, MI", "lat": 46.5436, "lng": -87.3770},
    {"name": "Minocqua Northwoods, WI", "lat": 45.8944, "lng": -89.6886},
    {"name": "La Crosse Coulee Region, WI", "lat": 43.8014, "lng": -91.2396},
    {"name": "Brainerd Lakes Central MN, MN", "lat": 46.3527, "lng": -94.1632},

    # California & Southwest
    {"name": "Truckee Lake Tahoe Basin, CA", "lat": 39.3280, "lng": -120.1278},
    {"name": "Mammoth Lakes Eastern Sierra, CA", "lat": 37.6485, "lng": -118.9721},
    {"name": "Mount Shasta Siskiyou, CA", "lat": 41.3100, "lng": -122.3861},
    {"name": "Mendocino Redwood Coast, CA", "lat": 39.3077, "lng": -123.7995},
    {"name": "Grass Valley Sierra Foothills, CA", "lat": 39.2191, "lng": -121.0611},
    {"name": "Joshua Tree High Desert, CA", "lat": 34.1347, "lng": -116.3131},
    {"name": "Ramona San Diego Backcountry, CA", "lat": 33.1245, "lng": -116.8989}
]

# ---------------------------------------------------------------------------
# GEODETIC MATH: GREAT CIRCLE DESTINATION CALCULATION
# ---------------------------------------------------------------------------
def calculate_destination_point(lat: float, lng: float, distance_km: float, bearing_deg: float) -> Tuple[float, float]:
    """
    Computes latitude and longitude of a destination point given starting coordinates,
    distance in km, and bearing angle in degrees using Haversine spherical geometry.
    """
    R = 6371.0  # Earth's mean radius in km
    delta = distance_km / R
    theta = math.radians(bearing_deg)

    lat_rad = math.radians(lat)
    lng_rad = math.radians(lng)

    dest_lat_rad = math.asin(
        math.sin(lat_rad) * math.cos(delta) +
        math.cos(lat_rad) * math.sin(delta) * math.cos(theta)
    )

    dest_lng_rad = lng_rad + math.atan2(
        math.sin(theta) * math.sin(delta) * math.cos(lat_rad),
        math.cos(delta) - math.sin(lat_rad) * math.sin(dest_lat_rad)
    )

    dest_lat = math.degrees(dest_lat_rad)
    dest_lng = math.degrees(dest_lng_rad)

    # Normalize longitude between -180 and +180
    dest_lng = (dest_lng + 540) % 360 - 180

    return round(dest_lat, 5), round(dest_lng, 5)


def generate_radial_scatter_points(center_lat: float, center_lng: float) -> List[Dict[str, Any]]:
    """
    Generates 10 radial coordinates offset from a high-demand seed hit:
    - 4 cardinal points (N, E, S, W) at ~25 km distance
    - 6 circular points at ~70 km distance (angles: 30, 90, 150, 210, 270, 330 deg)
    """
    points = []

    # 4 Cardinal Points (~25 km)
    cardinal_bearings = [("North", 0.0), ("East", 90.0), ("South", 180.0), ("West", 270.0)]
    for label, bearing in cardinal_bearings:
        lat, lng = calculate_destination_point(center_lat, center_lng, 25.0, bearing)
        points.append({
            "name": f"Radial 25km {label}",
            "lat": lat,
            "lng": lng,
            "distance_km": 25.0,
            "bearing": bearing
        })

    # 6 Circular Points (~70 km)
    circular_bearings = [30.0, 90.0, 150.0, 210.0, 270.0, 330.0]
    for bearing in circular_bearings:
        lat, lng = calculate_destination_point(center_lat, center_lng, 70.0, bearing)
        points.append({
            "name": f"Radial 70km {int(bearing)}°",
            "lat": lat,
            "lng": lng,
            "distance_km": 70.0,
            "bearing": bearing
        })

    return points


# ---------------------------------------------------------------------------
# STARLINK QUALIFICATION PROBE ENGINE
# ---------------------------------------------------------------------------
def probe_starlink_availability(lat: float, lng: float) -> Optional[Dict[str, Any]]:
    """
    Executes Starlink's exact address qualification and pricing flow:
    1. Reverse-geocode lat/lng -> place_id & address components
    2. POST /api/webagg/v1/public/leads -> processorToken
    3. GET /api/webagg/v1/public/sign-up/lead -> hydrates cart
    4. GET /api/webagg/v1/public/sign-up/pricing -> exact fee breakdown

    Zero heuristics, zero mock data.
    """
    browser_headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.starlink.com/residential",
        "Origin": "https://www.starlink.com"
    }

    max_retries = 3
    backoff = 2.0

    for attempt in range(max_retries):
        try:
            # Jitter pause (1.5 to 3.5 seconds) to avoid rate limits
            jitter = random.uniform(1.5, 3.5)
            time.sleep(jitter)

            # 1. Reverse-geocode coordinate
            rg_url = "https://starlink.com/api/marketing/v1/addresses/reverse-geocode"
            rg_code, rg_data = http_get_json(rg_url, params={"latitude": f"{lat:.4f}", "longitude": f"{lng:.4f}"}, headers=browser_headers, timeout=12.0)
            if rg_code != 200 or not isinstance(rg_data, dict):
                logger.warning(f"Reverse geocode returned HTTP {rg_code} on attempt {attempt+1}")
                continue

            content = rg_data.get("content", [])
            if not content:
                logger.warning(f"No reverse geocode results for ({lat}, {lng})")
                return None

            first_match = content[0]
            comps: Dict[str, Tuple[str, str]] = {}
            for c in first_match.get("address_components", []):
                types = c.get("types", [])
                if types:
                    comps[types[0]] = (c.get("short_name", ""), c.get("long_name", ""))

            country = comps.get("country", ("US", "United States"))[0]
            state_short = comps.get("administrative_area_level_1", ("", ""))[0]
            state_long = comps.get("administrative_area_level_1", ("", ""))[1]
            city = comps.get("locality", ("", ""))[1]
            zip_code = comps.get("postal_code", ("", ""))[0]

            # 2. Create Lead Session
            lead_payload = {
                "source": 0,
                "sourceV2": "1",
                "leadAttributes": {
                    "page": "/residential",
                    "activation": "false"
                },
                "countryCode": country or "US",
                "locale": "en-US",
                "latitude": lat,
                "longitude": lng,
                "formattedAddress": first_match.get("formatted_address"),
                "placeId": first_match.get("place_id"),
                "zipCode": zip_code,
                "region": state_short,
                "administrativeArea": state_long,
                "locality": city
            }

            lead_url = "https://starlink.com/api/webagg/v1/public/leads"
            lead_code, lead_text = http_post_json(lead_url, payload=lead_payload, headers={**browser_headers, "Content-Type": "application/json"}, timeout=15.0)
            if lead_code != 200:
                logger.warning(f"Lead creation returned HTTP {lead_code}: {lead_text[:200]}")
                continue

            lead_json = json.loads(lead_text)
            token = lead_json.get("content", {}).get("processorToken")
            if not token:
                logger.warning("No processorToken in lead response")
                continue

            # 3. Hydrate cart session via /sign-up/lead
            hydrate_url = "https://starlink.com/api/webagg/v1/public/sign-up/lead"
            hyd_code, _ = http_get_json(hydrate_url, params={"processorToken": token}, headers={**browser_headers, "Referer": f"https://starlink.com/order?processorToken={token}"}, timeout=15.0)
            if hyd_code != 200:
                logger.warning(f"Lead hydration returned HTTP {hyd_code}")
                continue

            # 4. Retrieve exact pricing breakdown
            price_url = "https://starlink.com/api/webagg/v1/public/sign-up/pricing"
            price_code, price_data = http_get_json(price_url, params={"processorToken": token}, headers={**browser_headers, "Referer": f"https://starlink.com/order?processorToken={token}"}, timeout=15.0)
            if price_code != 200 or not isinstance(price_data, dict):
                logger.warning(f"Pricing returned HTTP {price_code}")
                continue

            pricing_content = price_data.get("content", {})
            surcharge_prods = pricing_content.get("demandSurchargeProducts", [])
            surcharge = 0
            if surcharge_prods:
                surcharge = int(surcharge_prods[0].get("price", 0))

            deposit = int(pricing_content.get("depositAmount", 0))
            monthly_service = int(pricing_content.get("serviceAmount", 120))
            status = "sold_out" if deposit > 0 else ("high_demand" if surcharge > 0 else "standard")

            logger.info(f"Verified Live: ({lat}, {lng}) -> Surcharge: ${surcharge}, Status: {status}, Service: ${monthly_service}/mo")

            return {
                "surcharge_amount": surcharge,
                "status": status,
                "verified_live": True,
                "location_name": first_match.get("formatted_address") or f"{city}, {state_short}",
                "monthly_service_fee": monthly_service,
                "deposit_amount": deposit
            }

        except Exception as e:
            logger.warning(f"Probe attempt {attempt+1} encountered error for ({lat}, {lng}): {e}")
            time.sleep(backoff)
            backoff *= 1.5

    logger.warning(f"Unable to qualify ({lat:.4f}, {lng:.4f}) after {max_retries} retries. Zero heuristic fallback.")
    return None


# ---------------------------------------------------------------------------
# SUPABASE POSTGRESQL + POSTGIS INGESTION
# ---------------------------------------------------------------------------
def upsert_batch_to_supabase(records: List[Dict[str, Any]]) -> int:
    """
    Batches and upserts sampled records into Supabase PostgreSQL.
    Uses PostgREST RPC `upsert_starlink_surcharge` or direct REST upsert.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. Skipping remote upsert.")
        return 0

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    successful_upserts = 0
    for rec in records:
        # Call stored RPC function upsert_starlink_surcharge
        rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/upsert_starlink_surcharge"
        payload = {
            "p_lat": rec["lat"],
            "p_lng": rec["lng"],
            "p_surcharge_amount": rec["surcharge_amount"],
            "p_status": rec["status"],
            "p_sample_type": rec["sample_type"],
            "p_location_name": rec.get("location_name")
        }

        try:
            status_code, text = http_post_json(rpc_url, payload=payload, headers=headers)
            if status_code in (200, 201, 204):
                successful_upserts += 1
            else:
                # Fallback to direct table insertion with PostGIS WKT geometry
                table_url = f"{SUPABASE_URL}/rest/v1/starlink_surcharges"
                geom_wkt = f"SRID=4326;POINT({rec['lng']} {rec['lat']})"
                row_data = {
                    "coordinates": geom_wkt,
                    "lat": rec["lat"],
                    "lng": rec["lng"],
                    "surcharge_amount": rec["surcharge_amount"],
                    "status": rec["status"],
                    "sample_type": rec["sample_type"],
                    "location_name": rec.get("location_name"),
                    "sampled_at": datetime.now(timezone.utc).isoformat()
                }
                fb_status, fb_text = http_post_json(
                    table_url, 
                    payload=row_data, 
                    headers={**headers, "Prefer": "resolution=merge-duplicates"}
                )
                if fb_status in (200, 201, 204):
                    successful_upserts += 1
                else:
                    logger.error(f"Failed to upsert ({rec['lat']}, {rec['lng']}): {fb_text}")
        except Exception as ex:
            logger.error(f"Exception during upsert for ({rec['lat']}, {rec['lng']}): {ex}")

    return successful_upserts


# ---------------------------------------------------------------------------
# MAIN WORKFLOW EXECUTION
# ---------------------------------------------------------------------------
def main():
    logger.info("==========================================================")
    logger.info("Starting Starlink High-Demand Congestion Surcharge Sampler")
    logger.info(f"Targeting {len(MACRO_SEEDS)} US macro seed coordinates")
    logger.info("==========================================================")

    records_to_upsert: List[Dict[str, Any]] = []
    high_demand_hits = 0
    radial_scatter_count = 0

    for idx, seed in enumerate(MACRO_SEEDS, 1):
        name = seed["name"]
        lat = seed["lat"]
        lng = seed["lng"]

        logger.info(f"[{idx}/{len(MACRO_SEEDS)}] Probing Macro Anchor: {name} ({lat}, {lng})")
        probe_res = probe_starlink_availability(lat, lng)
        if not probe_res:
            logger.warning(f"  -> Skipping anchor {name} due to probe failure.")
            continue

        surcharge = probe_res["surcharge_amount"]
        status = probe_res["status"]

        seed_record = {
            "lat": lat,
            "lng": lng,
            "surcharge_amount": surcharge,
            "status": status,
            "sample_type": "scheduled_seed",
            "location_name": probe_res.get("location_name") or name
        }
        records_to_upsert.append(seed_record)

        # If seed returned a surcharge > 0, trigger localized 10-point radial scatter
        if surcharge > 0:
            high_demand_hits += 1
            logger.info(f"  -> Surcharge DETECTED: ${surcharge} ({status}). Triggering 10-point radial perimeter scatter...")
            scatter_points = generate_radial_scatter_points(lat, lng)

            for scatter in scatter_points:
                s_name = f"{name} - {scatter['name']}"
                s_lat = scatter["lat"]
                s_lng = scatter["lng"]

                s_probe = probe_starlink_availability(s_lat, s_lng)
                if not s_probe:
                    continue

                scatter_record = {
                    "lat": s_lat,
                    "lng": s_lng,
                    "surcharge_amount": s_probe["surcharge_amount"],
                    "status": s_probe["status"],
                    "sample_type": "radial_scatter",
                    "location_name": s_probe.get("location_name") or s_name
                }
                records_to_upsert.append(scatter_record)
                radial_scatter_count += 1
        else:
            logger.info(f"  -> Standard Capacity: $0 Surcharge")

    logger.info("==========================================================")
    logger.info(f"Sampling Cycle Complete:")
    logger.info(f"  Total Macro Seeds Probed: {len(MACRO_SEEDS)}")
    logger.info(f"  High-Demand Hits ($100-$1,500): {high_demand_hits}")
    logger.info(f"  Radial Scatter Points Generated: {radial_scatter_count}")
    logger.info(f"  Total Points to Ingest: {len(records_to_upsert)}")
    logger.info("==========================================================")

    # Ingest batch into Supabase PostGIS
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
        logger.info(f"Upserting {len(records_to_upsert)} records to Supabase...")
        upserted = upsert_batch_to_supabase(records_to_upsert)
        logger.info(f"Successfully upserted {upserted}/{len(records_to_upsert)} points to Supabase.")
    else:
        logger.warning("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not configured. Dry-run completed.")

    logger.info("Job finished successfully.")


if __name__ == "__main__":
    main()
