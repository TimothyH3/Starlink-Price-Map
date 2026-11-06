# Supabase PostgreSQL + PostGIS Setup Guide

This directory contains the database migration script for the **Starlink High-Demand Congestion Surcharge Tracker**.

## 1. Prerequisites
1. Create a free project at [supabase.com](https://supabase.com).
2. Go to your project's **SQL Editor**.

## 2. Execute Migration
1. Copy the contents of `schema.sql`.
2. Paste into the Supabase SQL Editor and click **Run**.
3. Verify that:
   - The `postgis` extension is activated.
   - The table `starlink_surcharges` is created with PostGIS `GEOMETRY(Point, 4326)` column.
   - Row Level Security (RLS) is enabled:
     - `anon` and `authenticated` roles have `SELECT` privileges.
     - `service_role` has full write and update privileges.
   - Spatial RPC functions `upsert_starlink_surcharge`, `get_nearby_surcharge`, and `get_surcharges_geojson` are compiled.
   - Initial ~60 US corridor seed points are populated.

## 3. Retrieve Credentials
From your Supabase Project Settings (**Settings** -> **API**):
* **Project URL**: `https://<your-project-ref>.supabase.co`
* **Anon Key (Public)**: `eyJhbGciOi...` (Configured in frontend map client)
* **Service Role Key (Secret)**: `eyJhbGciOi...` (Configured in GitHub Secrets & Cloudflare Worker)

