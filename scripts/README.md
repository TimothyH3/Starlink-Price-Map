# Background Sampling Script & Pipeline

This directory contains the Python sparse sampling engine for tracking Starlink High-Demand Congestion Surcharges.

## Overview
1. **Macro Anchors**: Probes ~60 macro seed points situated across US broadband bottleneck corridors (Pacific Northwest, Intermountain West, Appalachia, Southeast, and Texas).
2. **Radial Scatter**: When a seed point returns a surcharge ($100–$1,500), it generates 10 offset coordinates:
   - 4 cardinal points (North, East, South, West) at ~25 km.
   - 6 circular points at ~70 km (30°, 90°, 150°, 210°, 270°, 330°).
3. **Database Ingestion**: Upserts all collected points with PostGIS geometries into Supabase.

## Local Execution

### Install Dependencies
```bash
pip install -r scripts/requirements.txt
```

### Dry Run (No Supabase writes)
```bash
python scripts/sample_demand.py
```

### Production Run with Supabase Ingestion
Set environment variables:
```bash
export SUPABASE_URL="https://your-ref.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..."
python scripts/sample_demand.py
```

## GitHub Actions Automated Schedule
The workflow at `.github/workflows/sample.yml` automatically triggers:
* **Cron**: Every Sunday at `04:00 UTC` (`0 4 * * 0`).
* **Manual Dispatch**: Go to **Actions** -> **Starlink Demand Surcharge Sampler** -> **Run workflow**.

Configure the following GitHub repository secrets:
* `SUPABASE_URL`
* `SUPABASE_SERVICE_ROLE_KEY`

