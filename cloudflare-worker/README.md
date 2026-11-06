# Cloudflare Worker: Live Surcharge Lookup API Proxy

A lightweight, zero-latency Cloudflare Worker proxy that enables frontend users to test their exact location when uncached. It probes Starlink's checkout qualification endpoint and asynchronously writes the result back into Supabase PostgreSQL + PostGIS via `ctx.waitUntil`.

## API Interface

### Endpoint
`GET /api/check-fee?lat={lat}&lng={lng}` or `GET /check-fee?lat={lat}&lng={lng}`

### Example Request
```bash
curl "https://starlink-surcharge-worker.tjhansen.workers.dev/api/check-fee?lat=35.5951&lng=-82.5515"
```

### Example Response
```json
{
  "lat": 35.5951,
  "lng": -82.5515,
  "surcharge_amount": 500,
  "status": "high_demand",
  "timestamp": "2026-11-06T20:45:00.123Z",
  "source": "live_probe"
}
```

## Setup & Deployment Instructions

### 1. Install Wrangler CLI
```bash
cd cloudflare-worker
npm install
```

### 2. Configure Cloudflare Secrets
Authenticate with Cloudflare:
```bash
npx wrangler login
```

Set your Supabase project credentials as encrypted secrets:
```bash
npx wrangler secret put SUPABASE_URL
# When prompted, paste your Supabase Project URL (e.g. https://xyz.supabase.co)

npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# When prompted, paste your Supabase Service Role Secret Key
```

### 3. Local Testing
```bash
npm run dev
# Worker starts at http://localhost:8787
# Test: http://localhost:8787/api/check-fee?lat=35.5951&lng=-82.5515
```

### 4. Deploy to Production
```bash
npm run deploy
```

Once deployed, copy your worker URL (e.g., `https://starlink-surcharge-worker.<account>.workers.dev`) and configure it in the frontend map client or DNS route.

