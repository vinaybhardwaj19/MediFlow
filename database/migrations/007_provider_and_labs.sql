-- ============================================================================
-- Migration 007: Provider Search & Laboratory Bookings
-- MediFlow AI Healthcare OS — Multi-Sensor RPM Architecture
-- ============================================================================
-- Description:
--   This migration extends the PostgreSQL schema with two new tables:
--   1. provider_locations — PostGIS-indexed healthcare provider registry
--      (Hospitals, Labs, Pharmacies, Ambulance Stations, Emergency Centers)
--   2. lab_bookings — Patient diagnostic test bookings with AI summary fields
--
-- Backward Compatibility: Non-destructive. No existing tables are modified.
-- Depends On: 001_core_extensions.sql (must be run first for PostGIS)
-- ============================================================================

BEGIN;

-- ── 1. Healthcare Provider Registry ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_locations (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    provider_type VARCHAR(64) NOT NULL
        CHECK (provider_type IN (
            'hospital', 'doctor', 'medical_store', 'laboratory',
            'emergency_center', 'ambulance_service'
        )),
    phone         VARCHAR(30),
    address_line  VARCHAR(512),
    city          VARCHAR(128),
    state         VARCHAR(64),
    country       VARCHAR(64) DEFAULT 'IN',
    pincode       VARCHAR(12),
    location      GEOGRAPHY(POINT, 4326) NOT NULL,   -- PostGIS (lng, lat)
    is_active     BOOLEAN DEFAULT TRUE,
    details       JSONB DEFAULT '{}',                -- flex fields (hours, etc.)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spatial index for <distance> / <nearest> geospatial queries
CREATE INDEX IF NOT EXISTS idx_provider_location_gist
    ON provider_locations USING GIST (location);

-- Composite filter index (active providers of a given type near a location)
CREATE INDEX IF NOT EXISTS idx_provider_type_active
    ON provider_locations (provider_type, is_active);

-- Full-text search index on provider name
CREATE INDEX IF NOT EXISTS idx_provider_name_fts
    ON provider_locations USING GIN (to_tsvector('english', name));

COMMENT ON TABLE provider_locations IS
    'Healthcare provider directory with PostGIS coordinates for geo-proximity queries.';

-- ── 2. Laboratory Test Bookings ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lab_bookings (
    id              BIGSERIAL PRIMARY KEY,
    patient_id      UUID NOT NULL,          -- references identity.users(id)
    test_name       VARCHAR(256) NOT NULL,
    lab_name        VARCHAR(256),
    provider_id     BIGINT REFERENCES provider_locations(id) ON DELETE SET NULL,
    booking_date    TIMESTAMPTZ NOT NULL DEFAULT now(),
    collection_date TIMESTAMPTZ,            -- scheduled home/centre collection
    status          VARCHAR(32) NOT NULL DEFAULT 'booked'
        CHECK (status IN ('booked', 'sample_collected', 'processing', 'completed', 'cancelled')),
    report_url      TEXT,                   -- URL to stored PDF/image
    results         JSONB DEFAULT '{}',     -- structured numeric results
    ai_explanation  TEXT,                   -- LLM / rule-engine plain-english summary
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for patient-level history queries
CREATE INDEX IF NOT EXISTS idx_lab_bookings_patient
    ON lab_bookings (patient_id, booking_date DESC);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_lab_bookings_status
    ON lab_bookings (status);

COMMENT ON TABLE lab_bookings IS
    'Diagnostic test bookings and completed digital lab reports with AI explanations.';

-- ── 3. Auto-update trigger for updated_at ────────────────────────────────────
-- Re-use the common trigger function (created in migration 001 or create inline)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_provider_locations_updated_at
    BEFORE UPDATE ON provider_locations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lab_bookings_updated_at
    BEFORE UPDATE ON lab_bookings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4. Seed: 5 example provider locations in Bengaluru ───────────────────────
INSERT INTO provider_locations (name, provider_type, phone, address_line, city, location)
VALUES
    ('Bengaluru General Hospital',
        'hospital', '+91 80 1234 5678', '100 Feet Rd, Indiranagar', 'Bengaluru',
        ST_GeogFromText('POINT(77.6400 12.9720)')),
    ('MedPlus Pharmacy Indiranagar',
        'medical_store', '+91 80 8765 4321', '12th Main Rd, Indiranagar', 'Bengaluru',
        ST_GeogFromText('POINT(77.6415 12.9730)')),
    ('MediFlow Diagnostics Lab',
        'laboratory', '+91 80 9999 8888', 'Double Road, Sadashivnagar', 'Bengaluru',
        ST_GeogFromText('POINT(77.6380 12.9705)')),
    ('Apollo Emergency Centre',
        'emergency_center', '+91 80 2222 1111', 'Bannerghatta Rd', 'Bengaluru',
        ST_GeogFromText('POINT(77.5970 12.8960)')),
    ('ZELL Ambulance Services',
        'ambulance_service', '+91 80 1080 1080', 'MG Road', 'Bengaluru',
        ST_GeogFromText('POINT(77.6100 12.9762)'))
ON CONFLICT DO NOTHING;

COMMIT;
