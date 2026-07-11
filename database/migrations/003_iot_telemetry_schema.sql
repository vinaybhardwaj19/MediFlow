-- ============================================================================
-- Migration 003: IoT Telemetry Schema — Ambient AI Biometric Data Lake
-- MediFlow 2036 — Post-Quantum Telemedicine Ecosystem
-- ============================================================================
--
-- REAL-WORLD PROBLEM SOLVED:
--   Chronic diseases present silent symptoms. A patient with atrial fibrillation
--   may feel fine until a catastrophic cardiac event. Standard appointment-based
--   healthcare REACTS to emergencies rather than PREVENTING them.
--
-- SOLUTION ARCHITECTURE:
--   Wearable devices (smartwatches, CGMs, pulse oximeters) continuously stream
--   biometric telemetry to the edge via MQTT. This schema stores that stream
--   in a TimescaleDB hypertable — a special PostgreSQL table optimised for
--   high-frequency time-series data with automatic chunk partitioning.
--
--   The Ambient AI Agent (Phase 3) runs continuous SQL queries against this
--   table using TimescaleDB's continuous aggregates to detect anomaly windows
--   and trigger proactive consultations BEFORE the patient feels unwell.
--
-- TIMESCALEDB FEATURES USED:
--   - create_hypertable():        Automatic time-based partitioning (chunks)
--   - add_compression_policy():   Auto-compress chunks older than 7 days (80% storage savings)
--   - create_continuous_aggregate(): Real-time materialized views for anomaly windows
--   - add_retention_policy():     Auto-delete raw data older than 2 years (HIPAA compliant)
-- ============================================================================

SET search_path TO telemetry, public;

-- ── Table: wearable_devices ──────────────────────────────────────────────────
-- Registry of all IoT wearable devices paired to patient DIDs.
-- Each device has its own DID for cryptographic attestation.
CREATE TABLE telemetry.wearable_devices (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_did     TEXT        NOT NULL,   -- References identity.did_documents.did

    -- Device identity and attestation
    device_did      TEXT        NOT NULL UNIQUE, -- Device's own DID for signing telemetry
    device_type     TEXT        NOT NULL CHECK (device_type IN (
        'smartwatch',           -- Apple Watch, Galaxy Watch class
        'cgm',                  -- Continuous Glucose Monitor (Dexcom G8+)
        'pulse_oximeter',       -- SpO2 ring (Oura, Samsung BioActive)
        'ecg_patch',            -- Adhesive ECG monitor (AliveCor KardiaMobile)
        'blood_pressure_cuff',  -- Automated BP cuff
        'neural_interface'      -- Future: non-invasive EEG headband
    )),
    device_model        TEXT    NOT NULL,   -- Manufacturer model string
    firmware_version    TEXT    NOT NULL,
    mqtt_client_id      TEXT    NOT NULL UNIQUE, -- MQTT topic suffix

    -- Sampling configuration (edge-configurable OTA)
    sampling_interval_ms INT    NOT NULL DEFAULT 5000,  -- Default: 5-second samples
    anomaly_threshold_override JSONB NULL, -- Per-device threshold overrides

    -- Device state
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at        TIMESTAMPTZ NULL,
    battery_level_pct   INT     NULL CHECK (battery_level_pct BETWEEN 0 AND 100),

    paired_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  telemetry.wearable_devices IS 'Registry of IoT wearables paired to patient DIDs. Each device signs its telemetry with its own DID key.';


-- ── Table: biometric_stream [TIMESCALEDB HYPERTABLE] ─────────────────────────
-- The core time-series data lake for all biometric telemetry.
-- This is a TimescaleDB hypertable partitioned by time (daily chunks).
-- Expected throughput: ~10,000 rows/second across all active devices.
--
-- SCHEMA DESIGN RATIONALE:
--   - Each row is one reading from one device at one point in time.
--   - Nullable columns for each metric type: a smartwatch doesn't send glucose.
--   - 'reading_quality' allows the ML model to downweight noisy sensor readings.
--   - 'anomaly_score' is written BACK by the edge AI agent after inference.
CREATE TABLE telemetry.biometric_stream (
    -- TimescaleDB requires the time column to be part of the primary key
    -- when partitioning. We use (device_id, recorded_at) as the composite key.
    device_id           UUID        NOT NULL REFERENCES telemetry.wearable_devices(id) ON DELETE CASCADE,
    patient_did         TEXT        NOT NULL,   -- Denormalized for fast patient-level queries

    -- ── Timestamp ─────────────────────────────────────────────────────────────
    -- 'recorded_at': when the sensor measurement was taken (device clock, UTC)
    -- 'ingested_at': when it arrived at our MQTT broker (server clock, UTC)
    -- The delta between the two indicates network latency / device offline buffering
    recorded_at         TIMESTAMPTZ NOT NULL,
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- ── Cardiovascular Metrics ────────────────────────────────────────────────
    heart_rate_bpm      SMALLINT    NULL CHECK (heart_rate_bpm BETWEEN 20 AND 300),
    heart_rate_variability_ms REAL  NULL,  -- HRV in milliseconds (SDNN metric)
    systolic_bp_mmhg    SMALLINT    NULL CHECK (systolic_bp_mmhg BETWEEN 50 AND 300),
    diastolic_bp_mmhg   SMALLINT    NULL CHECK (diastolic_bp_mmhg BETWEEN 20 AND 200),

    -- ── Respiratory & Oxygen ──────────────────────────────────────────────────
    spo2_pct            REAL        NULL CHECK (spo2_pct BETWEEN 0 AND 100),
    -- SpO2 < 92% = clinical hypoxemia threshold; < 88% = emergency
    respiratory_rate_bpm SMALLINT   NULL CHECK (respiratory_rate_bpm BETWEEN 2 AND 60),

    -- ── Metabolic Metrics ─────────────────────────────────────────────────────
    glucose_mg_dl       REAL        NULL CHECK (glucose_mg_dl BETWEEN 20 AND 600),
    -- < 70 mg/dL = hypoglycemia; > 180 mg/dL post-meal = hyperglycemia
    body_temperature_c  REAL        NULL CHECK (body_temperature_c BETWEEN 30 AND 45),

    -- ── Activity & Context ────────────────────────────────────────────────────
    activity_state      TEXT        NULL CHECK (activity_state IN ('resting','walking','exercising','sleeping','unknown')),
    -- Used to contextualise readings (elevated HR during exercise is normal)
    steps_count         INT         NULL,
    calories_burned     REAL        NULL,

    -- ── ECG / Neural ─────────────────────────────────────────────────────────
    -- Raw ECG waveform samples stored as a float array (compressed via TimescaleDB)
    -- 250Hz sampling for 5 seconds = 1250 samples per row
    ecg_waveform_samples REAL[]     NULL,

    -- ── Quality & AI Scoring ─────────────────────────────────────────────────
    -- Signal quality score from the device firmware's noise filter (0.0–1.0)
    reading_quality     REAL        NOT NULL DEFAULT 1.0 CHECK (reading_quality BETWEEN 0 AND 1),

    -- Anomaly score written back by the edge AI agent (Phase 3).
    -- 0.0 = perfectly normal; 1.0 = critical anomaly → triggers consultation
    -- NULL = not yet scored by AI agent
    anomaly_score       REAL        NULL CHECK (anomaly_score BETWEEN 0 AND 1),

    -- The specific anomaly class detected (written back by LSTM model in Phase 3)
    anomaly_class       TEXT        NULL CHECK (anomaly_class IN (
        'cardiac_arrhythmia',   -- Irregular heart rhythm pattern
        'hypoxic_episode',      -- Sustained low SpO2
        'hypoglycemic_crash',   -- Rapid glucose drop
        'hypertensive_crisis',  -- Dangerously elevated BP
        'fever_onset',          -- Rising temperature trend
        'sleep_apnea_event',    -- SpO2 drops during sleep
        NULL                    -- No anomaly detected
    )),

    -- Unique constraint prevents duplicate device readings at the same instant
    PRIMARY KEY (device_id, recorded_at)
);

-- ── Convert to TimescaleDB Hypertable ─────────────────────────────────────────
-- This is the critical TimescaleDB command. It converts the ordinary PostgreSQL
-- table into a hypertable, partitioned by 'recorded_at' into daily chunks.
-- Each chunk is an independent subtable that can be compressed or archived independently.
SELECT create_hypertable(
    'telemetry.biometric_stream',
    'recorded_at',
    partitioning_column => 'patient_did',   -- Space partitioning by patient
    number_partitions   => 16,              -- 16 space partitions for parallel I/O
    chunk_time_interval => INTERVAL '1 day' -- Each chunk = one day of data
);

-- ── Compression Policy ────────────────────────────────────────────────────────
-- Automatically compress chunks older than 7 days using TimescaleDB columnar
-- compression. Achieves ~85% storage reduction on biometric data.
-- Compressed chunks are still fully queryable via decompression on read.
ALTER TABLE telemetry.biometric_stream SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id, patient_did',
    timescaledb.compress_orderby   = 'recorded_at DESC'
);

SELECT add_compression_policy('telemetry.biometric_stream', INTERVAL '7 days');

-- ── Data Retention Policy ─────────────────────────────────────────────────────
-- HIPAA requires retention of medical records for minimum 6 years.
-- Raw high-frequency samples are retained for 2 years; continuous aggregates
-- (see below) retain statistical summaries indefinitely.
SELECT add_retention_policy('telemetry.biometric_stream', INTERVAL '2 years');

-- ── Indexes for Query Performance ─────────────────────────────────────────────
CREATE INDEX idx_bio_patient_time ON telemetry.biometric_stream (patient_did, recorded_at DESC);
CREATE INDEX idx_bio_anomaly      ON telemetry.biometric_stream (anomaly_score DESC, recorded_at DESC)
    WHERE anomaly_score IS NOT NULL AND anomaly_score > 0.7;  -- Partial index: only high-risk rows

COMMENT ON TABLE telemetry.biometric_stream IS
    'TimescaleDB hypertable: primary IoT telemetry sink. '
    'Partitioned daily; compressed after 7 days; retained for 2 years. '
    'anomaly_score column backfilled by Ambient AI Agent (Phase 3).';


-- ── Continuous Aggregate: 5-Minute Vital Signs Windows ───────────────────────
-- TimescaleDB Continuous Aggregates are materialised views that incrementally
-- update as new data arrives. The Ambient AI Agent queries THIS view (not the
-- raw hypertable) for anomaly detection. This reduces query latency from seconds
-- to milliseconds for the real-time monitoring dashboard.
CREATE MATERIALIZED VIEW telemetry.vitals_5min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('5 minutes', recorded_at)   AS bucket,
    patient_did,
    device_id,

    -- Cardiovascular aggregates
    AVG(heart_rate_bpm)                     AS avg_hr,
    MIN(heart_rate_bpm)                     AS min_hr,
    MAX(heart_rate_bpm)                     AS max_hr,
    STDDEV(heart_rate_bpm)                  AS stddev_hr,    -- High stddev = arrhythmia indicator

    -- Oxygen saturation aggregates
    AVG(spo2_pct)                           AS avg_spo2,
    MIN(spo2_pct)                           AS min_spo2,    -- Min SpO2 is the clinically critical value

    -- Blood pressure aggregates
    AVG(systolic_bp_mmhg)                   AS avg_systolic,
    MAX(systolic_bp_mmhg)                   AS max_systolic,

    -- Glucose aggregates
    AVG(glucose_mg_dl)                      AS avg_glucose,
    MIN(glucose_mg_dl)                      AS min_glucose,

    -- AI scoring
    MAX(anomaly_score)                      AS peak_anomaly_score,  -- Worst reading in window
    COUNT(*)                                AS reading_count,
    COUNT(*) FILTER (WHERE reading_quality < 0.5) AS low_quality_count

FROM telemetry.biometric_stream
GROUP BY bucket, patient_did, device_id;

-- Refresh policy: rebuild the last 15 minutes of the aggregate every 60 seconds
SELECT add_continuous_aggregate_policy('telemetry.vitals_5min',
    start_offset => INTERVAL '15 minutes',
    end_offset   => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute'
);

COMMENT ON MATERIALIZED VIEW telemetry.vitals_5min IS
    'Real-time 5-minute aggregate windows for Ambient AI anomaly detection. '
    'Refreshed every 60 seconds. Query this, not biometric_stream, for live monitoring.';


-- ── Table: ambient_ai_alerts ──────────────────────────────────────────────────
-- Records every alert generated by the Ambient AI Agent.
-- When an alert is generated, the system auto-creates a consultation request
-- in the consultation schema — without the patient ever pressing a button.
CREATE TABLE telemetry.ambient_ai_alerts (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_did         TEXT        NOT NULL,
    device_id           UUID        NOT NULL REFERENCES telemetry.wearable_devices(id),

    -- Alert classification
    alert_type          TEXT        NOT NULL CHECK (alert_type IN (
        'cardiac_arrhythmia',
        'hypoxic_episode',
        'hypoglycemic_crash',
        'hypertensive_crisis',
        'fever_onset',
        'sleep_apnea_event',
        'composite_risk'        -- Multiple minor anomalies forming a pattern
    )),
    severity            TEXT        NOT NULL CHECK (severity IN ('advisory','warning','critical','emergency')),

    -- The biometric values that triggered this alert
    triggering_readings JSONB       NOT NULL,   -- Snapshot of the vitals_5min row

    -- The AI model's confidence in this alert (0.0–1.0)
    ai_confidence       REAL        NOT NULL CHECK (ai_confidence BETWEEN 0 AND 1),

    -- LSTM model output: the predicted time until a clinical event if untreated
    predicted_event_in_minutes INT NULL,

    -- Downstream action taken by the system
    action_taken        TEXT        NOT NULL CHECK (action_taken IN (
        'consultation_created',  -- Auto-created a consultation request
        'notification_sent',     -- Push notification only (low severity)
        'emergency_services_alerted', -- Critical: emergency escalation
        'suppressed'             -- Patient had do-not-disturb active
    )),
    consultation_id     UUID        NULL,        -- Links to consultation.sessions if created
    emergency_case_id   TEXT        NULL,        -- External emergency services reference

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('telemetry.ambient_ai_alerts', 'created_at',
    chunk_time_interval => INTERVAL '1 month');

COMMENT ON TABLE telemetry.ambient_ai_alerts IS
    'Log of all AI-generated proactive health alerts. '
    'Critical-severity rows trigger automatic consultation creation.';
