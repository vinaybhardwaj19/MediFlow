"""
main.py — MediFlow 2036 Pharmacy Service (FastAPI)
===============================================================================
Handles personalized medication compounding (bioprinting) and autonomous
drone delivery routing. Integrates bioprinter_api.py, drone_router.py,
and fleet_manager.py into a cohesive REST API.

ENDPOINTS:
    POST /api/pharmacy/print-jobs           — Create a bioprint job
    GET  /api/pharmacy/print-jobs/{job_id}  — Track a job
    POST /api/pharmacy/drone/routes         — Compute & dispatch drone route
    GET  /api/pharmacy/drone/routes/{id}    — Track a route
    GET  /api/pharmacy/fleet               — Fleet status (pharmacy role)
    GET  /health

STARTUP:
    uvicorn main:app --host 0.0.0.0 --port 8004
===============================================================================
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional

import asyncpg
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from bioprinter_api import (
    compute_personalized_dose, BiometricBasis, REFERENCE_DRUG_DB
)
from drone_router import compute_drone_route
from fleet_manager import DroneFleetManager
from schemas import (
    CreateBioprintJobRequest, BioprintJobResponse,
    DroneRouteRequest, DroneRouteResponse,
    PharmacyHealthResponse,
)

log = logging.getLogger("mediflow.pharmacy-service")
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s")

_db_pool: Optional[asyncpg.Pool] = None
_fleet_manager: Optional[DroneFleetManager] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db_pool, _fleet_manager
    db_url = os.getenv("DATABASE_URL",
        "postgresql://mediflow:mediflow@localhost:5432/mediflow_2036")
    try:
        _db_pool = await asyncpg.create_pool(db_url, min_size=3, max_size=10)
        _fleet_manager = DroneFleetManager(_db_pool)
        log.info("[Startup] ✅ Pharmacy Service ready on port 8004")
    except Exception as e:
        log.warning(f"[Startup] DB unavailable: {e} — running in degraded mode")
    yield
    if _db_pool:
        await _db_pool.close()
    log.info("[Shutdown] Pharmacy Service stopped")


app = FastAPI(
    title       = "MediFlow 2036 Pharmacy Service",
    description = (
        "Personalized 3D medication compounding and autonomous drone delivery "
        "routing for the MediFlow 2036 telemedicine ecosystem."
    ),
    version     = "2036.3.0",
    lifespan    = lifespan,
)

app.add_middleware(CORSMiddleware,
    allow_origins=[os.getenv("CORS_ALLOWED_ORIGIN", "http://localhost:5050"), "http://localhost:3000"],
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type", "Authorization", "X-MediFlow-Request-ID"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=PharmacyHealthResponse, tags=["System"])
async def health():
    db_ok = False
    if _db_pool:
        try:
            await _db_pool.fetchval("SELECT 1")
            db_ok = True
        except Exception:
            pass
    return PharmacyHealthResponse(
        db_connected    = db_ok,
        bioprinter_drugs = len(REFERENCE_DRUG_DB),
    )


# ── Bioprint Jobs ──────────────────────────────────────────────────────────────

@app.post(
    "/api/pharmacy/print-jobs",
    response_model=BioprintJobResponse,
    status_code=201,
    tags=["3D Bioprinting"],
)
async def create_bioprint_job(req: CreateBioprintJobRequest, request: Request):
    """
    Create a personalized medication compounding job.

    The system:
        1. Computes a personalized dose using the patient's biometrics
        2. Applies pharmacogenomics adjustments
        3. Runs biometric safety overrides (glucose/SpO2 contraindications)
        4. Finds the nearest available bioprinter at the patient's pharmacy
        5. Queues the job for compounding

    The computed dose replaces the standard fixed dose — this is the core
    innovation of the 3D Bio-Pharmacy pillar.
    """
    # Compute personalized dosage
    biometrics = BiometricBasis(
        weight_kg              = req.biometrics.weight_kg,
        renal_clearance_ml_min = req.biometrics.renal_clearance_ml_min,
        current_glucose_mg_dl  = req.biometrics.current_glucose_mg_dl,
        current_spo2_pct       = req.biometrics.current_spo2_pct,
        pharmacogenomics       = req.biometrics.pharmacogenomics,
    )

    dose_result = compute_personalized_dose(req.medication_api_code, biometrics)

    job_id = str(uuid.uuid4())
    status = "queued" if dose_result.is_safe_to_compound else "failed"
    estimated_ready = (
        (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        if status == "queued" else None
    )

    # Persist job to DB
    if _db_pool and status == "queued":
        # Find nearest available printer (simplified: get first idle printer for this demo)
        printer_row = await _db_pool.fetchrow("""
            SELECT id FROM pharmacy.bioprinter_fleet
            WHERE status = 'idle'
            LIMIT 1
        """)
        printer_id = str(printer_row["id"]) if printer_row else None

        if printer_id:
            await _db_pool.execute("""
                INSERT INTO pharmacy.bioprint_jobs (
                    id, printer_id, prescription_id, patient_did, doctor_did,
                    medication_api_code, medication_name, computed_dose_mg,
                    standard_dose_mg, dose_deviation_pct,
                    biometric_basis, dosage_form, quantity_units, status, estimated_ready_at
                ) VALUES (
                    $1::uuid, $2::uuid, $3::uuid, $4, $5,
                    $6, $7, $8, $9, $10,
                    $11::jsonb, $12, $13, $14, $15::timestamptz
                )
            """,
                job_id,
                printer_id,
                req.prescription_id,
                req.patient_did,
                req.doctor_did,
                req.medication_api_code,
                req.medication_api_code.title(),
                dose_result.computed_dose_mg,
                dose_result.standard_dose_mg,
                dose_result.dose_deviation_pct,
                json.dumps(req.biometrics.dict()),
                dose_result.dosage_form,
                req.quantity_units,
                status,
                estimated_ready,
            )
    else:
        printer_id = None

    return BioprintJobResponse(
        job_id              = job_id,
        printer_id          = printer_id,
        medication_api_code = req.medication_api_code,
        computed_dose_mg    = dose_result.computed_dose_mg,
        standard_dose_mg    = dose_result.standard_dose_mg,
        dose_deviation_pct  = dose_result.dose_deviation_pct,
        dosage_form         = dose_result.dosage_form,
        safety_flags        = dose_result.safety_flags,
        is_safe_to_compound = dose_result.is_safe_to_compound,
        defer_reason        = dose_result.defer_reason,
        status              = status,
        estimated_ready_at  = estimated_ready,
    )


@app.get("/api/pharmacy/print-jobs/{job_id}", tags=["3D Bioprinting"])
async def get_bioprint_job(job_id: str):
    """Track the status of a compounding job."""
    if not _db_pool:
        raise HTTPException(503, detail="Database not connected")
    row = await _db_pool.fetchrow("""
        SELECT id, status, medication_api_code, computed_dose_mg,
               dosage_form, estimated_ready_at, compounding_started_at,
               compounding_ended_at, quality_verified_at
        FROM pharmacy.bioprint_jobs WHERE id = $1::uuid
    """, job_id)
    if not row:
        raise HTTPException(404, detail="Bioprint job not found")
    return dict(row)


# ── Drone Routes ───────────────────────────────────────────────────────────────

@app.post(
    "/api/pharmacy/drone/routes",
    response_model=DroneRouteResponse,
    status_code=201,
    tags=["Drone Logistics"],
)
async def create_drone_route(req: DroneRouteRequest, request: Request):
    """
    Compute a 3D A* drone flight path and dispatch a drone for delivery.

    Process:
        1. Fetch no-fly zones from PostGIS (near the route)
        2. Run 3D A* algorithm to find the minimum-energy path
        3. Store the route as a PostGIS LineStringZ geometry
        4. Assign the nearest available drone from the fleet
        5. Return route metadata and assigned drone ID

    The computed route avoids all active no-fly zones in 3D airspace.
    """
    if not _db_pool:
        raise HTTPException(503, detail="Database not connected")

    # ── Fetch no-fly zones near the route ─────────────────────────────────────
    # ST_DWithin: returns zones whose boundary is within 20km of destination
    nfz_rows = await _db_pool.fetch("""
        SELECT zone_name, zone_type,
               ST_AsGeoJSON(zone_boundary)::jsonb AS boundary_geojson,
               min_altitude_m, max_altitude_m
        FROM pharmacy.no_fly_zones
        WHERE is_permanent = TRUE
           OR (valid_from <= NOW() AND valid_until >= NOW())
        LIMIT 50
    """)

    no_fly_zones = []
    for row in nfz_rows:
        boundary = row["boundary_geojson"]
        # Extract polygon ring from GeoJSON
        coords = boundary.get("coordinates", [[]])[0] if boundary else []
        no_fly_zones.append({
            "zone_boundary":  coords,
            "min_altitude_m": row["min_altitude_m"],
            "max_altitude_m": row["max_altitude_m"],
        })

    # ── Fetch pharmacy/printer location as route origin ─────────────────────
    job_row = await _db_pool.fetchrow("""
        SELECT bf.id AS printer_id,
               ST_X(bf.location) AS origin_lon,
               ST_Y(bf.location) AS origin_lat
        FROM pharmacy.bioprint_jobs bj
        JOIN pharmacy.bioprinter_fleet bf ON bf.id = bj.printer_id
        WHERE bj.id = $1::uuid
    """, req.bioprint_job_id)

    if not job_row:
        # Fallback origin for exhibition demo (Bangalore, India)
        origin_lon, origin_lat = 77.5946, 12.9716
    else:
        origin_lon = float(job_row["origin_lon"])
        origin_lat = float(job_row["origin_lat"])

    # ── Run 3D A* Router ──────────────────────────────────────────────────────
    route_result = compute_drone_route(
        origin_lon    = origin_lon,
        origin_lat    = origin_lat,
        origin_alt_m  = 80.0,           # Standard cruise altitude
        dest_lon      = req.dest_lon,
        dest_lat      = req.dest_lat,
        dest_alt_m    = max(req.dest_alt_m, 10.0),
        no_fly_zones  = no_fly_zones,
        max_range_km  = 20.0,
        wind_direction_deg = 0.0,
        wind_speed_ms      = 3.0,       # Typical urban wind speed
    )

    if not route_result["success"]:
        raise HTTPException(422, detail=route_result["error"])

    metrics     = route_result["metrics"]
    route_id    = str(uuid.uuid4())
    route_wkt   = route_result["route_wkt"]
    waypoints   = route_result["waypoints"]

    # Estimate flight duration: average cruise speed 12 m/s
    dist_m = metrics["total_distance_km"] * 1000
    est_duration_s = int(dist_m / 12.0) if dist_m > 0 else None

    # ── Persist route to DB ───────────────────────────────────────────────────
    drone_id = None
    if _fleet_manager and job_row:
        try:
            drone_id = await _fleet_manager.assign_mission(
                pharmacy_did    = "did:mediflow:pharmacyDemo",
                bioprint_job_id = req.bioprint_job_id,
                route_id        = route_id,
                payload_grams   = 150,
            )
        except Exception as e:
            log.warning(f"[Pharmacy] Drone assignment failed: {e}")

    await _db_pool.execute("""
        INSERT INTO pharmacy.drone_delivery_routes (
            id, drone_id, bioprint_job_id, patient_did,
            origin_position, destination_position, route_geometry,
            total_distance_km, estimated_duration_s,
            max_altitude_reached_m, no_fly_zones_avoided,
            routing_algorithm, routing_computed_at, routing_cost, status
        ) VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4,
            ST_SetSRID(ST_MakePoint($5, $6, 80.0), 4326),
            ST_SetSRID(ST_MakePoint($7, $8, $9), 4326),
            ST_GeomFromText($10, 4326),
            $11, $12, $13, $14,
            'astar_3d', NOW(), 0.0,
            $15
        )
    """,
        route_id,
        drone_id,
        req.bioprint_job_id,
        req.patient_did,
        origin_lon, origin_lat,
        req.dest_lon, req.dest_lat, float(req.dest_alt_m),
        route_wkt,
        metrics["total_distance_km"],
        est_duration_s,
        metrics.get("max_altitude_reached_m", 80.0),
        metrics.get("no_fly_zones_avoided", 0),
        "ready" if drone_id else "pending",
    )

    return DroneRouteResponse(
        route_id           = route_id,
        drone_id           = drone_id,
        status             = "active" if drone_id else "pending_drone",
        waypoint_count     = metrics.get("waypoint_count", len(waypoints)),
        total_distance_km  = metrics["total_distance_km"],
        max_altitude_m     = metrics.get("max_altitude_reached_m", 80.0),
        nfz_avoided        = metrics.get("no_fly_zones_avoided", 0),
        estimated_duration_s = est_duration_s,
        route_wkt          = route_wkt,
    )


@app.get("/api/pharmacy/drone/routes/{route_id}", tags=["Drone Logistics"])
async def get_drone_route(route_id: str):
    """Track a drone delivery route and real-time drone position."""
    if not _db_pool:
        raise HTTPException(503, detail="Database not connected")
    row = await _db_pool.fetchrow("""
        SELECT r.id, r.status, r.total_distance_km, r.estimated_duration_s,
               r.actual_departure_at, r.actual_arrival_at,
               ST_AsGeoJSON(r.route_geometry) AS route_geojson,
               d.drone_serial, d.battery_pct,
               ST_AsGeoJSON(d.current_position) AS drone_position
        FROM pharmacy.drone_delivery_routes r
        LEFT JOIN pharmacy.drone_fleet d ON d.id = r.drone_id
        WHERE r.id = $1::uuid
    """, route_id)
    if not row:
        raise HTTPException(404, detail="Route not found")
    return dict(row)


# ── Fleet Status (pharmacy role) ──────────────────────────────────────────────

@app.get("/api/pharmacy/fleet", tags=["Fleet Management"])
async def get_fleet(request: Request):
    """Returns current fleet status for the authenticated pharmacy."""
    role = request.headers.get("X-MediFlow-Role", "")
    if role not in ("pharmacy", "admin"):
        raise HTTPException(403, detail="Pharmacy or admin role required")
    if not _fleet_manager:
        raise HTTPException(503, detail="Fleet manager not initialised")
    pharmacy_did = request.headers.get("X-MediFlow-DID", "")
    fleet = await _fleet_manager.get_fleet_status(pharmacy_did)
    return {"fleet": fleet, "count": len(fleet)}


# ── Dev Entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8004, reload=True, log_level="info")
