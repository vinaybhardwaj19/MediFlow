-- ============================================================================
-- Migration 004: Health Records Schema — FHIR R4 + pgvector Semantic Search
-- MediFlow 2036 — Post-Quantum Telemedicine Ecosystem
-- ============================================================================
--
-- REAL-WORLD PROBLEM SOLVED:
--   Medical records are siloed across different hospital systems in incompatible
--   formats. A doctor treating an emergency patient cannot access their history.
--   Text-based search for "similar patients" is too rigid — "MI" and "myocardial
--   infarction" are treated as different by keyword search.
--
-- SOLUTION ARCHITECTURE:
--   All health records are stored as FHIR R4 (HL7 FHIR Release 4) resources —
--   the global interoperability standard for healthcare data exchange. This
--   enables direct record sharing with any FHIR-compliant system worldwide.
--
--   Every medical note and record is processed by a clinical NLP model that
--   generates a 1536-dimensional semantic embedding vector. These vectors are
--   stored in pgvector columns, enabling SEMANTIC SEARCH: "find all patients
--   with similar cardiac presentations to this new admission" — regardless of
--   the exact words used.
--
-- PGVECTOR OPERATIONS USED:
--   - <->  (L2 distance): Find semantically closest records
--   - <=>  (cosine distance): Normalised similarity (preferred for text)
--   - <#>  (inner product): Fast approximate similarity for recommendation
--   - ivfflat / hnsw indexes: ANN (Approximate Nearest Neighbour) for <100ms queries
-- ============================================================================

SET search_path TO records, public;

-- ── Table: patient_profiles ───────────────────────────────────────────────────
-- The longitudinal patient record, anchored to their DID.
-- No passwords stored here — identity is handled by the identity schema.
CREATE TABLE records.patient_profiles (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_did         TEXT        NOT NULL UNIQUE,  -- W3C DID (from identity schema)

    -- Demographics (minimised — only what is clinically relevant)
    date_of_birth       DATE        NOT NULL,
    biological_sex      TEXT        NULL CHECK (biological_sex IN ('male','female','intersex','unspecified')),
    blood_type          TEXT        NULL CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown')),

    -- Clinical risk profile
    known_allergies     TEXT[]      NOT NULL DEFAULT '{}',  -- Drug/substance allergy codes
    chronic_conditions  TEXT[]      NOT NULL DEFAULT '{}',  -- ICD-10 codes for chronic conditions
    current_medications TEXT[]      NOT NULL DEFAULT '{}',  -- RxNorm medication codes

    -- Emergency contact (encrypted at application layer with patient's Kyber-768 key)
    emergency_contact_encrypted BYTEA NULL,

    -- FHIR Patient resource (canonical, complete W3C/HL7 FHIR R4 JSON)
    fhir_patient_resource JSONB    NULL,

    -- ── pgvector: Longitudinal Health Embedding ──────────────────────────────
    -- A 1536-dimensional embedding of the patient's entire medical history
    -- (summarized by clinical NLP model, e.g., BioBERT, ClinicalBERT).
    -- Used for: "find patients with similar longitudinal profiles" (research)
    -- and personalised drug recommendation (pharmacy service).
    -- Updated asynchronously whenever a new health event is recorded.
    health_profile_embedding vector(1536) NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN records.patient_profiles.health_profile_embedding IS
    'pgvector 1536-dim embedding of full medical history (ClinicalBERT). '
    'Enables semantic similarity search across patient population.';

-- ── HNSW Index on pgvector column ─────────────────────────────────────────────
-- HNSW (Hierarchical Navigable Small Worlds) is the state-of-the-art ANN algorithm.
-- Supports ~99% recall at millisecond latency for 1536-dimensional vectors.
-- 'vector_cosine_ops': uses cosine distance — best for normalized text embeddings.
-- ef_construction=200, m=16 are the standard production quality parameters.
CREATE INDEX idx_patient_health_embedding ON records.patient_profiles
    USING hnsw (health_profile_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

COMMENT ON INDEX idx_patient_health_embedding IS
    'HNSW index for approximate nearest-neighbour search on patient health embeddings. '
    'Enables semantic cohort queries at < 50ms for population of 1M patients.';


-- ── Table: fhir_resources ─────────────────────────────────────────────────────
-- Universal FHIR R4 resource store. Every medical artifact — observations,
-- conditions, medications, procedures, reports — is stored here as a FHIR
-- resource with a semantic embedding for AI-driven retrieval.
CREATE TABLE records.fhir_resources (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_did         TEXT        NOT NULL,

    -- FHIR resource taxonomy
    resource_type       TEXT        NOT NULL CHECK (resource_type IN (
        'Observation',          -- Lab results, vital signs, biometric readings
        'Condition',            -- Diagnosed conditions (ICD-10 coded)
        'MedicationRequest',    -- Prescriptions
        'MedicationStatement',  -- Reported medication usage
        'Procedure',            -- Surgical and clinical procedures
        'DiagnosticReport',     -- Radiology, pathology reports
        'DocumentReference',    -- Unstructured clinical notes (PDF, HL7 CDA)
        'Encounter',            -- Clinical encounters (consultations)
        'AllergyIntolerance',   -- Allergy records
        'Immunization',         -- Vaccine records
        'CarePlan',             -- Long-term care plans
        'MolecularSequence'     -- Genomic sequence data (future: pharmacogenomics)
    )),

    -- The complete FHIR R4 resource JSON (HL7-compliant)
    resource_json       JSONB       NOT NULL,

    -- Source system (for provenance tracking in federated queries)
    source_system       TEXT        NOT NULL DEFAULT 'mediflow-2036',
    source_resource_id  TEXT        NULL,   -- Original ID in source system (if imported)

    -- Clinical timestamp (extracted from FHIR resource for fast range queries)
    -- For Observations: effectiveDateTime. For Conditions: onsetDateTime.
    clinical_date       TIMESTAMPTZ NULL,

    -- ── pgvector: Resource-level Semantic Embedding ───────────────────────────
    -- 768-dimensional embedding of this specific resource's narrative content.
    -- Smaller than patient-level embedding for index efficiency at resource scale.
    -- Generated by: ClinicalBERT-768 processing the resource's 'text.div' narrative.
    -- Used for: "find all ECG reports similar to this one", cross-patient research.
    resource_embedding  vector(768) NULL,

    -- Versioning for FHIR resource mutation tracking
    version_id          INT         NOT NULL DEFAULT 1,
    is_deleted          BOOLEAN     NOT NULL DEFAULT FALSE,  -- FHIR soft-delete

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Standard lookup indexes
CREATE INDEX idx_fhir_patient_type   ON records.fhir_resources (patient_did, resource_type, clinical_date DESC);
CREATE INDEX idx_fhir_resource_type  ON records.fhir_resources (resource_type, clinical_date DESC);
CREATE INDEX idx_fhir_jsonb_code     ON records.fhir_resources USING gin (resource_json jsonb_path_ops);

-- ── IVFFlat Index for resource embeddings ─────────────────────────────────────
-- IVFFlat (Inverted File Flat) is more memory-efficient than HNSW for large
-- collections (millions of resources). Lists=100 is suitable for up to 1M rows.
CREATE INDEX idx_fhir_resource_embedding ON records.fhir_resources
    USING ivfflat (resource_embedding vector_cosine_ops)
    WITH (lists = 100);

COMMENT ON COLUMN records.fhir_resources.resource_embedding IS
    'pgvector 768-dim ClinicalBERT embedding of FHIR resource narrative. '
    'IVFFlat ANN index for < 30ms semantic similarity search across all resources.';


-- ── Table: consultation_records ───────────────────────────────────────────────
-- Stores the complete record of each telemedicine consultation.
-- The 'session_transcript_embedding' enables AI-powered consultation search.
CREATE TABLE records.consultation_records (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID        NOT NULL UNIQUE,  -- Links to consultation.sessions
    patient_did         TEXT        NOT NULL,
    doctor_did          TEXT        NOT NULL,

    -- Consultation metadata
    consultation_type   TEXT        NOT NULL CHECK (consultation_type IN (
        'standard',         -- Routine video consultation
        'volumetric_xr',    -- WebXR holographic consultation
        'ambient_triggered',-- Auto-triggered by Ambient AI Agent
        'emergency'         -- Emergency escalation
    )),
    specialty           TEXT        NOT NULL,         -- Medical specialty
    chief_complaint     TEXT        NULL,             -- Patient's stated reason

    -- Clinical outputs
    diagnosis_codes     TEXT[]      NOT NULL DEFAULT '{}',  -- ICD-10 codes
    prescription_ids    UUID[]      NOT NULL DEFAULT '{}',  -- Issued prescription IDs
    follow_up_required  BOOLEAN     NOT NULL DEFAULT FALSE,
    follow_up_date      DATE        NULL,

    -- Session transcript (de-identified by NLP pipeline before storage)
    transcript_text     TEXT        NULL,             -- De-identified session transcript

    -- ── pgvector: Consultation Semantic Embedding ─────────────────────────────
    -- 768-dimensional embedding of the session transcript + diagnosis.
    -- Enables "find all past consultations similar to this presentation" for
    -- clinical decision support and continuous doctor learning.
    session_transcript_embedding vector(768) NULL,

    -- Duration and quality metrics
    duration_seconds    INT         NULL,
    patient_rating      SMALLINT    NULL CHECK (patient_rating BETWEEN 1 AND 5),

    started_at          TIMESTAMPTZ NULL,
    ended_at            TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consult_patient ON records.consultation_records (patient_did, created_at DESC);
CREATE INDEX idx_consult_doctor  ON records.consultation_records (doctor_did, created_at DESC);

CREATE INDEX idx_consult_embedding ON records.consultation_records
    USING hnsw (session_transcript_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

COMMENT ON TABLE records.consultation_records IS
    'Comprehensive consultation record with HNSW-indexed semantic embeddings '
    'for AI-assisted clinical decision support.';
