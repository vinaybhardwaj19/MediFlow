-- ============================================================================
-- Migration 001: Core Extensions Bootstrap
-- MediFlow 2036 — Post-Quantum Telemedicine Ecosystem
-- ============================================================================
--
-- PURPOSE:
--   Activates all three advanced PostgreSQL extensions that form the technical
--   backbone of the 2036 architecture:
--
--   1. pgvector   — Enables high-dimensional vector storage for AI embeddings.
--                   Used by the Health Records service to store semantic
--                   representations of medical notes, enabling similarity-based
--                   retrieval ("find all records similar to this ECG pattern").
--
--   2. TimescaleDB — Transforms PostgreSQL into a high-throughput time-series
--                   database. Critical for ingesting continuous IoT biometric
--                   streams (heart rate, SpO2) from wearable devices at scale
--                   without degrading query performance.
--
--   3. PostGIS     — Adds full geospatial and 3D spatial support. Required for
--                   the drone routing engine, which must compute A* paths in
--                   true 3D space (latitude, longitude, altitude) while
--                   respecting no-fly zones modelled as geospatial polygons.
--
-- EXECUTION ORDER: This migration MUST run first before all others.
-- ============================================================================

-- Enable pgvector: AI/ML vector similarity search
-- Prerequisite: PostgreSQL 15+ with pgvector extension installed
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable TimescaleDB: time-series optimisation engine
-- Prerequisite: TimescaleDB 2.x installed alongside PostgreSQL
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Enable PostGIS: 2D/3D geospatial functions and types
-- This activates geometry, geography, ST_* functions, and 3D primitives
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enable PostGIS topology (required for complex geo-zone modelling)
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Enable pgcrypto: cryptographic primitives for DID key storage
-- Used to hash and store public key fingerprints securely
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable uuid-ossp: RFC 4122 UUID generation
-- All primary keys use UUIDv4 to eliminate sequential ID enumeration attacks
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Confirm Extension Versions ───────────────────────────────────────────────
-- Execute this block manually to confirm installation health:
--
--   SELECT extname, extversion FROM pg_extension
--   WHERE extname IN ('vector', 'timescaledb', 'postgis', 'pgcrypto', 'uuid-ossp');
--
-- ─────────────────────────────────────────────────────────────────────────────

-- Create a dedicated schema namespace for each microservice domain
-- This enforces service boundary isolation at the database level
CREATE SCHEMA IF NOT EXISTS identity;       -- DID & Verifiable Credentials
CREATE SCHEMA IF NOT EXISTS telemetry;      -- IoT biometric time-series
CREATE SCHEMA IF NOT EXISTS records;        -- Health records & FHIR resources
CREATE SCHEMA IF NOT EXISTS pharmacy;       -- Bioprinting & drone logistics
CREATE SCHEMA IF NOT EXISTS consultation;   -- WebXR session metadata

COMMENT ON SCHEMA identity     IS 'Decentralized Identity: W3C DIDs, Verifiable Credentials, PQC key material';
COMMENT ON SCHEMA telemetry    IS 'IoT Telemetry: real-time biometric streams from wearable devices (TimescaleDB)';
COMMENT ON SCHEMA records      IS 'Health Records: FHIR R4 resources with pgvector semantic embeddings';
COMMENT ON SCHEMA pharmacy     IS 'E-Pharmacy: 3D bioprinting job queue and drone fleet routing (PostGIS)';
COMMENT ON SCHEMA consultation IS 'Telepresence: WebXR session metadata, SFU configuration, volumetric streams';
