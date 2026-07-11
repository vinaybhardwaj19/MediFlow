-- ============================================================================
-- Migration 005: Pharmacy & Drone Logistics Schema
-- MediFlow 2036 — Post-Quantum Telemedicine Ecosystem
-- ============================================================================
--
-- REAL-WORLD PROBLEM SOLVED:
--   1. DOSAGE IMPRECISION: Mass-produced pills contain fixed dosages that
--      ignore individual patient biometrics (weight, renal function, genetics).
--      A 60kg elderly woman and a 100kg athlete receive the same pill.
--
--   2. LAST-MILE DELIVERY: In rural areas and during peak traffic, critical
--      medications can take hours to arrive. A diabetic patient experiencing
--      a hypoglycemic crash cannot wait 45 minutes for a delivery driver.
--
-- SOLUTION ARCHITECTURE:
--   1. 3D BIO-PHARMACY: A robotic compounding system receives a "print job"
--      with precise dosage parameters (computed from the patient's real-time
--      biometrics and genomic data). It fabricates a personalised medication
--      form (tablet, gel, patch) within minutes.
--
--   2. DRONE ROUTING (PostGIS + 3D A*): A fleet of autonomous drones is
--      dispatched for critical medications. The routing engine uses PostGIS
--      3D geometry to compute optimal flight paths that:
--        - Avoid no-fly zones (airports, restricted airspace) as 3D polygons
--        - Navigate around building obstacles (3D geometry buffers)
--        - Respect altitude corridors (MIN/MAX flight altitude per zone)
--        - Optimise for battery range and wind resistance
--
-- POSTGIS FEATURES USED:
--   - geometry(Point, 4326):      WGS84 geographic coordinates
--   - geometry(PointZ, 4326):     3D coordinates (lat, lng, altitude_m)
--   - geometry(PolygonZ, 4326):   3D no-fly zone volumes
--   - ST_3DDistance():            True 3D Euclidean distance between points
--   - ST_3DIntersects():          Collision detection for path segments
--   - ST_MakePoint(lon, lat, alt): Construct 3D waypoints
--   - ST_Segmentize():            Densify flight paths for obstacle checking
-- ============================================================================

SET search_path TO pharmacy, public;

-- ── Table: bioprinter_fleet ───────────────────────────────────────────────────
-- Registry of 3D medication compounding units (bioprinters).
-- Each pharmacy has one or more bioprinter units, each with its own
-- capabilities and certified medication cartridge inventory.
CREATE TABLE pharmacy.bioprinter_fleet (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    pharmacy_did    TEXT        NOT NULL,   -- Owning pharmacy's DID

    -- Physical location of this printer (for drone dispatch calculation)
    -- PostGIS Point geometry: ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    location        geometry(Point, 4326) NOT NULL,

    -- Printer specifications
    printer_model       TEXT    NOT NULL,
    firmware_version    TEXT    NOT NULL,
    max_dosage_forms    TEXT[]  NOT NULL,   -- ['tablet','capsule','gel','patch','liquid','suppository']
    min_dose_precision_mg REAL  NOT NULL,   -- Minimum compounding resolution in milligrams

    -- Operational state
    status          TEXT        NOT NULL DEFAULT 'idle' CHECK (status IN (
        'idle',         -- Ready to accept new jobs
        'compounding',  -- Currently manufacturing
        'maintenance',  -- Scheduled maintenance window
        'error',        -- Hardware fault
        'calibrating'   -- Post-maintenance calibration
    )),
    current_job_id  UUID        NULL,
    queue_length    INT         NOT NULL DEFAULT 0,

    -- Cartridge inventory (each cartridge = one active pharmaceutical ingredient)
    cartridge_inventory JSONB   NOT NULL DEFAULT '[]',
    -- Structure: [{"api_code": "metformin", "available_mg": 50000, "expiry": "2036-12-01"}]

    last_calibrated_at  TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PostGIS spatial index on printer locations for nearest-printer queries
CREATE INDEX idx_bioprinter_location ON pharmacy.bioprinter_fleet USING gist(location);

COMMENT ON TABLE  pharmacy.bioprinter_fleet IS 'Registry of autonomous medication compounding units at pharmacy nodes.';
COMMENT ON COLUMN pharmacy.bioprinter_fleet.location IS 'PostGIS Point (WGS84) for nearest-printer routing and drone dispatch calculation.';


-- ── Table: bioprint_jobs ──────────────────────────────────────────────────────
-- Each row is one personalised medication compounding job.
-- The dosage is computed from the patient's REAL-TIME biometrics (from the
-- telemetry schema) and their genomic pharmacogenomics profile.
CREATE TABLE pharmacy.bioprint_jobs (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    printer_id      UUID        NOT NULL REFERENCES pharmacy.bioprinter_fleet(id),
    prescription_id UUID        NOT NULL,   -- Links to records schema prescription
    patient_did     TEXT        NOT NULL,
    doctor_did      TEXT        NOT NULL,

    -- ── Personalised Dosage Specification ────────────────────────────────────
    -- The core innovation: dosage is not fixed, it is computed per-patient.
    medication_api_code TEXT    NOT NULL,   -- Active Pharmaceutical Ingredient code
    medication_name     TEXT    NOT NULL,

    -- Computed dosage (personalised, NOT the standard adult dose)
    computed_dose_mg    REAL    NOT NULL CHECK (computed_dose_mg > 0),

    -- The biometric snapshot used to COMPUTE this dose
    -- Stores the relevant telemetry values at prescription time
    biometric_basis     JSONB   NOT NULL,
    -- Structure: {"weight_kg": 68.5, "renal_clearance_ml_min": 82,
    --             "current_glucose_mg_dl": 145, "avg_hr_24h": 72,
    --             "pharmacogenomics": {"CYP2D6": "poor_metabolizer"}}

    -- Standard dose reference (for deviation audit logging)
    standard_dose_mg    REAL    NULL,
    dose_deviation_pct  REAL    NULL,   -- (computed - standard) / standard * 100

    -- Output specification
    dosage_form         TEXT    NOT NULL CHECK (dosage_form IN ('tablet','capsule','gel','patch','liquid')),
    quantity_units      INT     NOT NULL DEFAULT 1,  -- Number of units to compound
    coating_type        TEXT    NULL,   -- 'immediate_release' | 'extended_release' | 'enteric'

    -- Job lifecycle
    status              TEXT    NOT NULL DEFAULT 'queued' CHECK (status IN (
        'queued',           -- Waiting for printer
        'compounding',      -- Actively being manufactured
        'quality_check',    -- Post-print pharmacist verification
        'ready_for_pickup', -- Awaiting drone collection
        'dispatched',       -- Loaded onto drone
        'delivered',        -- Confirmed patient receipt
        'cancelled',        -- Cancelled before compounding
        'failed'            -- Manufacturing error
    )),

    queued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    compounding_started_at TIMESTAMPTZ NULL,
    compounding_ended_at   TIMESTAMPTZ NULL,
    quality_verified_at    TIMESTAMPTZ NULL,
    quality_verified_by    TEXT        NULL,  -- Pharmacist DID

    estimated_ready_at  TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bioprint_patient  ON pharmacy.bioprint_jobs (patient_did, created_at DESC);
CREATE INDEX idx_bioprint_status   ON pharmacy.bioprint_jobs (status, queued_at);
CREATE INDEX idx_bioprint_printer  ON pharmacy.bioprint_jobs (printer_id, status);

COMMENT ON TABLE  pharmacy.bioprint_jobs IS 'Personalised medication compounding jobs. Dosage computed from patient biometrics and pharmacogenomics.';
COMMENT ON COLUMN pharmacy.bioprint_jobs.biometric_basis IS 'Snapshot of patient biometrics used for dose computation. Retained for clinical audit.';


-- ── Table: drone_fleet ────────────────────────────────────────────────────────
-- Real-time registry and state of the autonomous drone delivery fleet.
-- The current_position uses PostGIS 3D geometry (PointZ) to track
-- drones in three-dimensional airspace.
CREATE TABLE pharmacy.drone_fleet (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    pharmacy_did    TEXT        NOT NULL,   -- Owning pharmacy's DID
    drone_serial    TEXT        NOT NULL UNIQUE,

    -- ── 3D Airspace Tracking (PostGIS PointZ) ─────────────────────────────────
    -- CRITICAL: We use PointZ (3D Point) — not a 2D Point — to track altitude.
    -- Format: ST_SetSRID(ST_MakePoint(longitude, latitude, altitude_m), 4326)
    -- altitude_m: meters above WGS84 ellipsoid (GPS altitude)
    current_position    geometry(PointZ, 4326) NULL,
    home_base_position  geometry(PointZ, 4326) NOT NULL,  -- Pharmacy rooftop pad

    -- Flight capabilities
    max_payload_grams   INT     NOT NULL,
    max_range_km        REAL    NOT NULL,
    max_altitude_m      REAL    NOT NULL DEFAULT 120.0,  -- Regulatory default: 120m AGL
    cruise_speed_ms     REAL    NOT NULL,                -- Cruise speed in m/s
    battery_capacity_mah INT   NOT NULL,

    -- Real-time operational state
    status              TEXT    NOT NULL DEFAULT 'grounded' CHECK (status IN (
        'grounded',         -- At home base, fully charged
        'standby',          -- On pad, ready for immediate dispatch
        'en_route_pickup',  -- Flying to bioprinter for payload collection
        'payload_loaded',   -- Payload loaded, awaiting dispatch clearance
        'en_route_delivery',-- Flying to patient delivery point
        'returning',        -- Returning to home base
        'maintenance',      -- Scheduled maintenance
        'emergency_land'    -- Emergency landing protocol active
    )),
    battery_pct         INT     NULL CHECK (battery_pct BETWEEN 0 AND 100),
    current_payload_id  UUID    NULL REFERENCES pharmacy.bioprint_jobs(id),

    -- Telemetry cache (last known state from drone's onboard computer)
    last_telemetry      JSONB   NULL,
    -- Structure: {"speed_ms": 12.3, "heading_deg": 245, "wind_ms": 3.1,
    --             "temperature_c": 22, "signal_strength_pct": 94}

    last_seen_at        TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PostGIS 3D spatial index on current drone positions
-- Enables fast "find all drones within X km of this point" queries
CREATE INDEX idx_drone_position ON pharmacy.drone_fleet USING gist(current_position);

COMMENT ON TABLE  pharmacy.drone_fleet IS 'Real-time drone fleet registry. current_position is PostGIS PointZ (3D) for altitude-aware routing.';
COMMENT ON COLUMN pharmacy.drone_fleet.current_position IS 'PostGIS PointZ(4326): longitude, latitude, altitude_m (WGS84). Updated every 500ms during flight.';


-- ── Table: no_fly_zones ────────────────────────────────────────────────────────
-- Defines restricted airspace volumes as 3D polygons.
-- The drone routing A* algorithm queries this table to identify obstacles.
-- Each zone is a PolygonZ with a minimum and maximum altitude envelope.
CREATE TABLE pharmacy.no_fly_zones (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

    zone_name       TEXT        NOT NULL,
    zone_type       TEXT        NOT NULL CHECK (zone_type IN (
        'airport_ctr',      -- Airport Control Zone (circular, hard exclusion)
        'restricted_airspace', -- Military/government restricted zone
        'building_obstacle',-- Urban building volume buffer
        'weather_cell',     -- Dynamic: active weather/wind exclusion zone
        'event_exclusion',  -- Temporary: public event temporary restriction
        'hospital_landing', -- Protected approach path for air ambulances
        'power_lines'       -- High-voltage power line corridor buffer
    )),

    -- ── PostGIS 3D Polygon ─────────────────────────────────────────────────────
    -- The 2D footprint of the zone as a polygon in WGS84.
    -- The altitude envelope is stored separately (min/max) because PostGIS
    -- 3D polygon support is more complex; we extrude the 2D polygon to 3D
    -- in the application layer when checking intersection.
    zone_boundary   geometry(Polygon, 4326) NOT NULL,  -- 2D footprint
    min_altitude_m  REAL        NOT NULL DEFAULT 0.0,  -- Ground level
    max_altitude_m  REAL        NOT NULL,              -- Top of restricted volume

    -- Temporal validity (weather cells and event exclusions are temporary)
    is_permanent    BOOLEAN     NOT NULL DEFAULT TRUE,
    valid_from      TIMESTAMPTZ NULL,
    valid_until     TIMESTAMPTZ NULL,

    -- Regulatory authority that defined this zone
    authority       TEXT        NULL,   -- 'DGCA', 'FAA', 'EASA', 'MediFlow-Safety'
    source_ref      TEXT        NULL,   -- Regulatory document reference

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PostGIS spatial index — critical for fast intersection queries during routing
CREATE INDEX idx_nfz_boundary ON pharmacy.no_fly_zones USING gist(zone_boundary);
CREATE INDEX idx_nfz_active   ON pharmacy.no_fly_zones (is_permanent, valid_from, valid_until)
    WHERE NOT is_permanent;  -- Partial index: only temporary zones

COMMENT ON TABLE  pharmacy.no_fly_zones IS 'Regulatory and dynamic no-fly zone registry. Queried by 3D A* drone router for obstacle avoidance.';
COMMENT ON COLUMN pharmacy.no_fly_zones.zone_boundary IS 'PostGIS Polygon (WGS84 2D footprint) extruded to [min_altitude_m, max_altitude_m] in 3D routing.';


-- ── Table: drone_delivery_routes ──────────────────────────────────────────────
-- Stores computed drone flight routes as ordered sequences of 3D waypoints.
-- Routes are computed by the 3D A* algorithm (Phase 3) and stored here
-- for real-time tracking, audit, and machine learning feedback.
CREATE TABLE pharmacy.drone_delivery_routes (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    drone_id        UUID        NOT NULL REFERENCES pharmacy.drone_fleet(id),
    bioprint_job_id UUID        NOT NULL REFERENCES pharmacy.bioprint_jobs(id),
    patient_did     TEXT        NOT NULL,

    -- ── 3D Route Geometry ─────────────────────────────────────────────────────
    -- Origin and destination as 3D points
    origin_position     geometry(PointZ, 4326) NOT NULL,   -- Pharmacy bioprinter location + altitude
    destination_position geometry(PointZ, 4326) NOT NULL,  -- Patient delivery location + altitude

    -- The computed A* route as an ordered array of 3D waypoints.
    -- Stored as PostGIS LineStringZ — a sequence of 3D points forming the path.
    -- Each vertex: (longitude, latitude, altitude_m)
    -- The A* algorithm generates intermediate waypoints to avoid no-fly zones.
    route_geometry  geometry(LineStringZ, 4326) NULL,  -- NULL until route is computed

    -- Route metrics (computed by A* before storage)
    total_distance_km   REAL    NULL,
    estimated_duration_s INT    NULL,
    max_altitude_reached_m REAL NULL,
    no_fly_zones_avoided INT    NULL DEFAULT 0,

    -- Algorithm metadata
    routing_algorithm   TEXT    NOT NULL DEFAULT 'astar_3d',
    routing_computed_at TIMESTAMPTZ NULL,
    routing_cost        REAL    NULL,   -- A* total path cost (for algorithm benchmarking)

    -- Route state
    status              TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',      -- Route computation not yet started
        'computing',    -- A* algorithm running
        'ready',        -- Route computed and cleared for flight
        'active',       -- Drone is actively following this route
        'completed',    -- Delivery successful
        'aborted',      -- Route abandoned (weather, battery, emergency)
        'failed'        -- Failed to compute a valid route
    )),

    -- Actual flight tracking (recorded by drone telemetry)
    actual_departure_at TIMESTAMPTZ NULL,
    actual_arrival_at   TIMESTAMPTZ NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PostGIS spatial index on route geometry for geofencing queries
-- ("which active routes intersect with this new no-fly zone?")
CREATE INDEX idx_route_geometry     ON pharmacy.drone_delivery_routes USING gist(route_geometry);
CREATE INDEX idx_route_drone_status ON pharmacy.drone_delivery_routes (drone_id, status);
CREATE INDEX idx_route_patient      ON pharmacy.drone_delivery_routes (patient_did, created_at DESC);

COMMENT ON TABLE  pharmacy.drone_delivery_routes IS 'A* computed 3D drone flight routes stored as PostGIS LineStringZ geometry.';
COMMENT ON COLUMN pharmacy.drone_delivery_routes.route_geometry IS 'PostGIS LineStringZ: ordered 3D waypoints (lon, lat, alt_m) computed by 3D A* algorithm.';
