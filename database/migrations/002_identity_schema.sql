-- ============================================================================
-- Migration 002: Identity Schema — Decentralized Identity & PQC Key Vault
-- MediFlow 2036 — Post-Quantum Telemedicine Ecosystem
-- ============================================================================
--
-- REAL-WORLD PROBLEM SOLVED:
--   Traditional healthcare databases store credentials in central honeypots.
--   A single breach exposes millions of patient records. Standard RSA/ECC keys
--   will be broken by quantum computers within the next decade.
--
-- SOLUTION ARCHITECTURE:
--   Each patient, doctor, and device is assigned a W3C Decentralized Identifier
--   (DID). The patient CRYPTOGRAPHICALLY OWNS their identity — no central
--   password database exists. Authentication uses Verifiable Credentials (VCs)
--   signed with Post-Quantum Cryptography (Dilithium-3 signatures, Kyber-768
--   key encapsulation), which are provably secure against quantum adversaries.
--
-- REFERENCES:
--   - W3C DID Spec: https://www.w3.org/TR/did-core/
--   - NIST PQC Finalists: CRYSTALS-Kyber (KEM), CRYSTALS-Dilithium (Signature)
-- ============================================================================

SET search_path TO identity, public;

-- ── Table: did_documents ─────────────────────────────────────────────────────
-- Stores the W3C DID Document for every registered entity.
-- A DID Document maps a DID to its public key material and service endpoints.
-- This is the root of the patient's self-sovereign identity.
CREATE TABLE identity.did_documents (
    -- Internal surrogate key (UUIDv4, never sequential/guessable)
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- The Decentralized Identifier string. Format: did:mediflow:<base58-encoded-hash>
    -- This is the public, globally unique identifier the patient shares with providers
    did                 TEXT        NOT NULL UNIQUE,

    -- The full W3C DID Document as JSONB.
    -- Contains: @context, id, verificationMethod[], authentication[], service[]
    -- Stored as JSONB for flexible querying (e.g., find DIDs with a specific key type)
    did_document        JSONB       NOT NULL,

    -- The entity type that owns this DID
    subject_type        TEXT        NOT NULL CHECK (subject_type IN ('patient','doctor','pharmacy','device','admin')),

    -- Reference to the legacy system's user record (for migration compatibility)
    -- NULL for new 2036-native registrations
    legacy_user_id      TEXT        NULL,

    -- DID lifecycle management
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    deactivated_at      TIMESTAMPTZ NULL,
    deactivation_reason TEXT        NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  identity.did_documents IS 'Root identity anchors. Each row represents one self-sovereign identity on the platform.';
COMMENT ON COLUMN identity.did_documents.did IS 'W3C Decentralized Identifier. Format: did:mediflow:<multibase-encoded-public-key-hash>';
COMMENT ON COLUMN identity.did_documents.did_document IS 'Full W3C DID Document JSON-LD. Mutable only by the DID controller (key rotation).';


-- ── Table: pqc_key_vault ─────────────────────────────────────────────────────
-- Stores Post-Quantum Cryptographic public keys associated with each DID.
-- Private keys NEVER enter this database — they reside in the patient's device
-- or a hardware security module (HSM). Only public keys are stored here.
CREATE TABLE identity.pqc_key_vault (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Foreign key to the owning DID
    did_id          UUID        NOT NULL REFERENCES identity.did_documents(id) ON DELETE CASCADE,

    -- The key ID (kid) as referenced within the DID Document's verificationMethod array
    key_id          TEXT        NOT NULL,

    -- The PQC algorithm used for this key pair.
    -- Kyber-768: Used for Key Encapsulation (encrypting session keys)
    -- Dilithium-3: Used for Digital Signatures (signing VCs and API requests)
    -- Falcon-512: Alternative signature scheme (NIST alternate standard)
    algorithm       TEXT        NOT NULL CHECK (algorithm IN ('Kyber-768', 'Dilithium-3', 'Falcon-512')),

    -- The key purpose within the DID Document
    key_purpose     TEXT        NOT NULL CHECK (key_purpose IN ('keyAgreement', 'assertionMethod', 'authentication')),

    -- The raw public key bytes, base64url-encoded.
    -- Kyber-768 public key: 1184 bytes | Dilithium-3 public key: 1952 bytes
    public_key_b64  TEXT        NOT NULL,

    -- SHA3-256 fingerprint of the public key for fast lookup and deduplication
    key_fingerprint TEXT        NOT NULL UNIQUE,

    -- Key lifecycle
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    valid_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until     TIMESTAMPTZ NULL,   -- NULL = no expiry (long-lived device keys)
    revoked_at      TIMESTAMPTZ NULL,
    revocation_reason TEXT      NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (did_id, key_id)
);

COMMENT ON TABLE  identity.pqc_key_vault IS 'Public key registry for Post-Quantum Cryptographic keys. Private keys never stored here.';
COMMENT ON COLUMN identity.pqc_key_vault.algorithm IS 'NIST PQC standard: Kyber-768 for KEM, Dilithium-3/Falcon-512 for signatures.';
COMMENT ON COLUMN identity.pqc_key_vault.public_key_b64 IS 'Base64url-encoded raw public key bytes. Kyber-768=1184 bytes, Dilithium-3=1952 bytes.';


-- ── Table: verifiable_credentials ────────────────────────────────────────────
-- Stores issued W3C Verifiable Credentials (VCs).
-- VCs replace traditional login sessions. A patient presents a VC to prove
-- they have the right to access a resource (e.g., their own health records).
-- The signature uses Dilithium-3, making it quantum-resistant.
CREATE TABLE identity.verifiable_credentials (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- The DID of the entity that issued this credential (MediFlow platform DID)
    issuer_did      TEXT        NOT NULL,

    -- The DID of the entity this credential is about (patient, doctor, etc.)
    subject_did     TEXT        NOT NULL,

    -- The credential type (determines which claims are included)
    credential_type TEXT        NOT NULL CHECK (credential_type IN (
        'PatientIdentityCredential',
        'MedicalLicenseCredential',
        'PharmacyOperatorCredential',
        'DeviceAttestation',
        'EmergencyAccessCredential'
    )),

    -- The full W3C Verifiable Credential as JSONB.
    -- Contains: @context, type, issuer, issuanceDate, expirationDate,
    --           credentialSubject{}, proof{type, created, proofValue}
    -- The 'proof.proofValue' contains the Dilithium-3 digital signature.
    credential_json JSONB       NOT NULL,

    -- Dilithium-3 signature over canonical JSON-LD serialization (JCS normalized)
    -- Stored separately for fast signature verification without JSON parsing
    proof_value     TEXT        NOT NULL,

    -- Credential lifecycle
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NULL,
    is_revoked      BOOLEAN     NOT NULL DEFAULT FALSE,
    revoked_at      TIMESTAMPTZ NULL,
    revocation_reason TEXT      NULL
);

CREATE INDEX idx_vc_subject_did  ON identity.verifiable_credentials(subject_did);
CREATE INDEX idx_vc_issuer_did   ON identity.verifiable_credentials(issuer_did);
CREATE INDEX idx_vc_type_active  ON identity.verifiable_credentials(credential_type, is_revoked);

COMMENT ON TABLE  identity.verifiable_credentials IS 'W3C Verifiable Credentials. Replace session tokens; signed with Dilithium-3 (quantum-resistant).';
COMMENT ON COLUMN identity.verifiable_credentials.proof_value IS 'Dilithium-3 digital signature over JCS-normalized credential JSON. 3309 bytes, base64url-encoded.';


-- ── Table: vc_presentation_log ────────────────────────────────────────────────
-- Immutable audit log of every credential presentation (authentication event).
-- Required for HIPAA audit trail compliance. Append-only (no UPDATE/DELETE).
CREATE TABLE identity.vc_presentation_log (
    id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_did     TEXT        NOT NULL,
    credential_id   UUID        NOT NULL REFERENCES identity.verifiable_credentials(id),
    verifier_service TEXT       NOT NULL,  -- Which microservice verified this VC
    verification_result TEXT    NOT NULL CHECK (verification_result IN ('success','failed','expired','revoked')),
    client_ip       INET        NULL,      -- Anonymized after 30 days (GDPR)
    user_agent      TEXT        NULL,
    presented_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partition by month for regulatory archival compliance
SELECT create_hypertable(
    'identity.vc_presentation_log',
    'presented_at',
    chunk_time_interval => INTERVAL '1 month'
) WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb');

COMMENT ON TABLE identity.vc_presentation_log IS 'Immutable HIPAA audit log for all authentication events. Partitioned monthly by TimescaleDB.';
