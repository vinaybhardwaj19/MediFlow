-- ============================================================================
-- Migration 006: Consultation Schema — WebXR Holographic Telepresence
-- MediFlow 2036 — Post-Quantum Telemedicine Ecosystem
-- ============================================================================
--
-- REAL-WORLD PROBLEM SOLVED:
--   Standard 2D video consultations severely limit diagnostic accuracy. A
--   dermatologist cannot assess lesion depth. A neurologist cannot observe
--   subtle tremor patterns in 3D. A radiologist must switch between the video
--   call and a separate PACS system to view scans.
--
-- SOLUTION ARCHITECTURE:
--   The WebXR consultation system uses WebRTC with Selective Forwarding Units
--   (SFU) to stream volumetric video — depth camera data compressed with
--   Draco3D — allowing the doctor to view a 3D representation of the patient
--   and their medical overlays (AR annotations, 3D DICOM scans) in a shared
--   spatial computing environment.
--
--   This schema stores:
--   - Session configuration (SFU endpoint, WebXR mode, codec parameters)
--   - Spatial overlay anchors (3D AR annotation positions)
--   - Session recordings metadata (encrypted, patient-owned)
--   - Quality-of-experience (QoE) telemetry for network optimization
-- ============================================================================

SET search_path TO consultation, public;

-- ── Table: sessions ───────────────────────────────────────────────────────────
-- Master record for each WebXR consultation session.
CREATE TABLE consultation.sessions (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_did     TEXT        NOT NULL,
    doctor_did      TEXT        NOT NULL,

    -- Consultation context
    session_type    TEXT        NOT NULL CHECK (session_type IN (
        'standard_2d',          -- Fallback: standard WebRTC video (legacy browsers)
        'volumetric_ar',        -- Full WebXR: volumetric video + spatial overlays
        'dicom_review',         -- 3D medical image review session
        'ambient_triggered'     -- Auto-created by Ambient AI Agent
    )),
    trigger_alert_id UUID       NULL,   -- If ambient_triggered: source alert ID

    -- ── WebRTC / SFU Configuration ─────────────────────────────────────────────
    -- The SFU (Selective Forwarding Unit) endpoint assigned to this session.
    -- MediFlow uses a distributed SFU cluster (e.g., mediasoup) for low-latency
    -- media routing without transcoding.
    sfu_endpoint_url    TEXT    NULL,
    sfu_room_id         TEXT    NULL,
    ice_servers_config  JSONB   NULL,  -- STUN/TURN server list for WebRTC ICE

    -- WebXR rendering configuration
    webxr_mode          TEXT    NULL CHECK (webxr_mode IN ('inline','immersive-ar','immersive-vr')),
    volumetric_codec    TEXT    NULL DEFAULT 'draco3d',  -- 3D mesh compression codec
    spatial_audio_mode  TEXT    NULL DEFAULT 'ambisonics',

    -- Session keys (encrypted data-at-rest)
    -- The session encryption key is wrapped with the patient's Kyber-768 public key.
    -- Only the patient (with their private key) can decrypt session recordings.
    session_key_wrapped_patient TEXT NULL,  -- Kyber-768 ciphertext
    session_key_wrapped_doctor  TEXT NULL,  -- Kyber-768 ciphertext

    -- ── Session Lifecycle ─────────────────────────────────────────────────────
    status          TEXT        NOT NULL DEFAULT 'scheduled' CHECK (status IN (
        'scheduled',    -- Future appointment
        'waiting_room', -- Patient has joined, waiting for doctor
        'active',       -- Live session in progress
        'paused',       -- Temporarily paused (e.g., patient on hold)
        'completed',    -- Ended normally
        'cancelled',    -- Cancelled before start
        'failed'        -- Technical failure
    )),
    scheduled_at    TIMESTAMPTZ NULL,
    started_at      TIMESTAMPTZ NULL,
    ended_at        TIMESTAMPTZ NULL,
    duration_seconds INT         NULL,   -- Computed on session end

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_patient ON consultation.sessions (patient_did, created_at DESC);
CREATE INDEX idx_session_doctor  ON consultation.sessions (doctor_did, created_at DESC);
CREATE INDEX idx_session_status  ON consultation.sessions (status, scheduled_at);

COMMENT ON TABLE  consultation.sessions IS 'WebXR consultation session master record with SFU configuration and PQC-wrapped session keys.';
COMMENT ON COLUMN consultation.sessions.session_key_wrapped_patient IS 'Kyber-768 KEM ciphertext. Only decryptable with patient private key (self-sovereign).';


-- ── Table: spatial_overlays ────────────────────────────────────────────────────
-- AR annotations placed in 3D space during a volumetric consultation.
-- A doctor can place a marker on a 3D scan saying "inflammation here" — this
-- stores the 3D coordinate of that annotation in the session's spatial frame.
CREATE TABLE consultation.spatial_overlays (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID        NOT NULL REFERENCES consultation.sessions(id) ON DELETE CASCADE,
    created_by_did  TEXT        NOT NULL,   -- Doctor or patient who placed the overlay

    -- Overlay type
    overlay_type    TEXT        NOT NULL CHECK (overlay_type IN (
        'annotation_point',     -- Pin marker at a 3D coordinate
        'annotation_region',    -- Bounding box or freehand region
        'dicom_anchor',         -- DICOM scan anchored to patient avatar
        'measurement_ruler',    -- Distance measurement tool
        'anatomy_label'         -- Labeled anatomy structure
    )),

    -- 3D position in the shared spatial frame (XR reference space coordinates)
    -- Using 3D point coordinates (x, y, z) in metres from the session origin
    position_x      REAL        NOT NULL,
    position_y      REAL        NOT NULL,
    position_z      REAL        NOT NULL,

    -- Quaternion orientation for oriented overlays (rotation in 3D space)
    orientation_qx  REAL        NOT NULL DEFAULT 0.0,
    orientation_qy  REAL        NOT NULL DEFAULT 0.0,
    orientation_qz  REAL        NOT NULL DEFAULT 0.0,
    orientation_qw  REAL        NOT NULL DEFAULT 1.0,

    -- Overlay content
    label_text      TEXT        NULL,
    note_text       TEXT        NULL,
    color_hex       TEXT        NULL DEFAULT '#2563EB',   -- Clinical blue default
    dicom_series_id TEXT        NULL,   -- DICOM series UID if anchoring a scan

    -- Persistence: some overlays are temporary (laser pointer), some persistent
    is_persistent   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_overlay_session ON consultation.spatial_overlays (session_id, created_at);

COMMENT ON TABLE consultation.spatial_overlays IS '3D AR annotation anchors placed during WebXR sessions. Coordinates in XR reference space (metres).';


-- ── Table: session_qoe_telemetry [TIMESCALEDB HYPERTABLE] ────────────────────
-- Quality-of-Experience metrics collected during each session.
-- Used for network optimization and SFU routing decisions.
-- TimescaleDB partitioned because QoE is sampled every 5 seconds during calls.
CREATE TABLE consultation.session_qoe_telemetry (
    session_id          UUID        NOT NULL REFERENCES consultation.sessions(id),
    participant_did     TEXT        NOT NULL,   -- Which participant sent this report
    recorded_at         TIMESTAMPTZ NOT NULL,

    -- WebRTC QoE metrics (from browser's RTCStatsReport API)
    round_trip_time_ms  REAL        NULL,   -- ICE round-trip latency
    jitter_ms           REAL        NULL,   -- Packet arrival jitter
    packet_loss_pct     REAL        NULL,   -- Outbound packet loss percentage

    -- Video quality metrics
    video_bitrate_kbps  INT         NULL,
    video_frame_width   SMALLINT    NULL,
    video_frame_height  SMALLINT    NULL,
    video_frames_ps     REAL        NULL,   -- Frames per second

    -- Volumetric stream metrics (WebXR-specific)
    mesh_vertices_count     INT     NULL,   -- 3D mesh complexity (Draco3D output)
    depth_stream_fps        REAL    NULL,   -- Depth camera frame rate
    spatial_audio_latency_ms REAL   NULL,

    PRIMARY KEY (session_id, participant_did, recorded_at)
);

SELECT create_hypertable('consultation.session_qoe_telemetry', 'recorded_at',
    chunk_time_interval => INTERVAL '1 day');

SELECT add_retention_policy('consultation.session_qoe_telemetry', INTERVAL '90 days');

COMMENT ON TABLE consultation.session_qoe_telemetry IS
    'TimescaleDB hypertable for WebRTC/WebXR QoE telemetry during consultations. '
    'Sampled every 5 seconds. Used for adaptive bitrate and SFU routing optimization.';


-- ── Table: session_recordings ──────────────────────────────────────────────────
-- Metadata about session recordings stored in encrypted object storage.
-- The actual recording bytes are NEVER in the database — only the storage
-- reference and the patient-owned encryption key wrapper.
CREATE TABLE consultation.session_recordings (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID        NOT NULL UNIQUE REFERENCES consultation.sessions(id),
    patient_did     TEXT        NOT NULL,

    -- Storage location (encrypted object storage — AWS S3 / GCS with SSE-C)
    storage_bucket  TEXT        NOT NULL,
    storage_key     TEXT        NOT NULL,   -- Object key / path in the bucket
    recording_format TEXT       NOT NULL CHECK (recording_format IN ('webm','mp4','volumetric_glb')),
    size_bytes      BIGINT      NULL,
    duration_seconds INT        NULL,

    -- Patient-owned encryption
    -- The recording is encrypted with a random AES-256 content key.
    -- That content key is wrapped with the patient's Kyber-768 public key.
    -- The patient (and ONLY the patient) can decrypt with their private key.
    content_key_wrapped TEXT    NOT NULL,   -- Kyber-768 ciphertext of AES key
    content_key_algorithm TEXT  NOT NULL DEFAULT 'Kyber-768+AES-256-GCM',

    -- Consent and retention
    patient_consent_given   BOOLEAN     NOT NULL DEFAULT FALSE,
    retention_until         DATE        NULL,   -- Patient can set their own retention

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  consultation.session_recordings IS 'Encrypted session recording metadata. Actual bytes in object storage. Patient holds the only decryption key.';
COMMENT ON COLUMN consultation.session_recordings.content_key_wrapped IS 'AES-256 content key, Kyber-768 wrapped with patient public key. Platform cannot decrypt.';
