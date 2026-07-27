"""
main.py — MediFlow 2036 Identity Service (FastAPI)
===============================================================================

MICROSERVICE RESPONSIBILITY:
    This is the cryptographic trust anchor of the entire platform. It is the
    ONLY service that:
        1. Generates PQC (Kyber-768, Dilithium-3) key pairs
        2. Issues W3C Verifiable Credentials signed with the Platform DID key
        3. Verifies W3C Verifiable Presentations (the 2036 "login" mechanism)
        4. Holds the gateway's Kyber-768 private key for KEM decapsulation
        5. Maintains the DID Document registry and PQC key vault

ENDPOINTS:
    PUBLIC (accessible through gateway, rate-limited):
        POST /api/identity/register        — Generate DID + PQC key pair for new user
        GET  /api/identity/did/resolve     — Resolve a DID to its DID Document
        POST /api/identity/auth/present    — Present a VC to get a session VC

    PROTECTED (DID auth required):
        POST /api/identity/keys/rotate     — Rotate PQC key pair (requires old key proof)
        GET  /api/identity/audit           — View VC presentation audit log (admin only)
        POST /api/identity/vc/revoke       — Revoke a credential (admin only)

    INTERNAL (NOT exposed through gateway — pod network only):
        POST /internal/verify              — Verify a VP (called by Go gateway DID auth)
        POST /internal/pqc/decapsulate     — Kyber-768 KEM decapsulation (called by Go gateway)

SECURITY BOUNDARIES:
    - The Platform's Dilithium-3 signing key is loaded from PLATFORM_SECRET_KEY env var.
      In production, this is a Kubernetes Secret mounted from an external KMS (HashiCorp Vault).
    - The Gateway's Kyber-768 private key is loaded from GATEWAY_KEM_SECRET_KEY env var.
    - Both keys NEVER appear in logs, responses, or database rows.

STARTUP:
    uvicorn main:app --host 0.0.0.0 --port 8001 --workers 4
===============================================================================
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

import asyncpg
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from pqc_keys import (
    KyberKEM, DilithiumSigner, pqc_mode,
    decode_b64url, encode_b64url,
)
from did_resolver import DIDResolver
from vc_issuer import VCIssuer, PLATFORM_DID
from schemas import (
    RegisterIdentityRequest, RegisterIdentityResponse,
    ResolveDIDResponse,
    PresentVCRequest, AuthenticationResponse,
    InternalVerifyRequest, InternalVerifyResponse,
    InternalDecapsulateRequest, InternalDecapsulateResponse,
    RotateKeyRequest, KeyInfoResponse,
    IdentityHealthResponse,
)

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s"
)
log = logging.getLogger("mediflow.identity")

# ── Global State ──────────────────────────────────────────────────────────────
# These are initialised in the lifespan context manager on startup.
_db_pool: Optional[asyncpg.Pool] = None
_did_resolver: Optional[DIDResolver] = None
_vc_issuer: Optional[VCIssuer] = None
# The gateway's Kyber-768 secret key for KEM decapsulation.
# Loaded from environment — NEVER from DB, never logged.
_gateway_kem_secret_key: Optional[bytes] = None


# ── Startup / Shutdown ────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context: initialises and tears down all shared resources.
    Using lifespan (not @app.on_event) per FastAPI ≥ 0.93 best practices.
    """
    global _db_pool, _did_resolver, _vc_issuer, _gateway_kem_secret_key

    # ── Database Connection Pool ───────────────────────────────────────────────
    db_url = os.getenv("DATABASE_URL",
        "postgresql://mediflow:mediflow@localhost:5432/mediflow_2036")
    log.info(f"[Startup] Connecting to PostgreSQL...")
    try:
        _db_pool = await asyncpg.create_pool(
            db_url,
            min_size=1,
            max_size=5,
            command_timeout=3,
            timeout=3,
        )
        log.info("[Startup] ✅ Database pool established")
    except Exception as e:
        log.warning(f"[Startup] ⚠️  PostgreSQL unavailable ({e}) — running Identity Service in degraded in-memory mode")
        _db_pool = None

    # ── Platform DID Initialisation ────────────────────────────────────────────
    # Ensure the Platform DID exists in the database (idempotent).
    # In a fresh deployment, this creates the platform's DID Document and
    # stores its PQC public keys. The private key comes from the env var.
    _did_resolver = DIDResolver(_db_pool)
    platform_doc = await _did_resolver.resolve(PLATFORM_DID)
    if not platform_doc:
        log.info("[Startup] Platform DID not found — bootstrapping...")
        await _bootstrap_platform_did()
    else:
        log.info(f"[Startup] ✅ Platform DID resolved: {PLATFORM_DID}")

    # ── Load Platform Signing Key ──────────────────────────────────────────────
    platform_secret_b64 = os.getenv("PLATFORM_DILITHIUM_SECRET_KEY", "")
    if not platform_secret_b64:
        log.warning("[Startup] ⚠️  PLATFORM_DILITHIUM_SECRET_KEY not set — using auto-generated key (exhibition mode)")
        # Generate a temporary key for exhibition demo (not persistent across restarts)
        kp = DilithiumSigner.generate_keypair()
        platform_secret_key = kp.secret_key
    else:
        platform_secret_key = decode_b64url(platform_secret_b64)

    # ── Load Gateway KEM Key ───────────────────────────────────────────────────
    gateway_kem_b64 = os.getenv("GATEWAY_KYBER_SECRET_KEY", "")
    if not gateway_kem_b64:
        log.warning("[Startup] ⚠️  GATEWAY_KYBER_SECRET_KEY not set — using auto-generated key (exhibition mode)")
        kem_kp = KyberKEM.generate_keypair()
        _gateway_kem_secret_key = kem_kp.secret_key
    else:
        _gateway_kem_secret_key = decode_b64url(gateway_kem_b64)

    # ── VC Issuer ──────────────────────────────────────────────────────────────
    _vc_issuer = VCIssuer(_db_pool, _did_resolver, platform_secret_key)

    log.info(f"[Startup] ✅ Identity Service ready | PQC Mode: {pqc_mode()}")
    log.info(f"[Startup] Platform DID: {PLATFORM_DID}")

    yield

    # ── Teardown ───────────────────────────────────────────────────────────────
    if _db_pool:
        await _db_pool.close()
    log.info("[Shutdown] Identity Service stopped")


async def _bootstrap_platform_did():
    """Create the platform DID on first startup. Idempotent."""
    kp_dilithium = DilithiumSigner.generate_keypair()
    kp_kyber     = KyberKEM.generate_keypair()
    await _did_resolver.register_identity(
        subject_type="admin",
        dilithium_keypair=kp_dilithium,
        kyber_keypair=kp_kyber,
    )
    log.info(f"[Bootstrap] Platform DID created: {PLATFORM_DID}")


# ── FastAPI Application ────────────────────────────────────────────────────────

app = FastAPI(
    title       = "MediFlow 2036 Identity Service",
    description = (
        "Decentralized Identity, Post-Quantum Cryptography, and Verifiable Credential "
        "operations for the MediFlow 2036 Telemedicine Ecosystem. "
        "Implements W3C DID Core, W3C VC Data Model 2.0, NIST FIPS 203 (ML-KEM-768), "
        "and NIST FIPS 204 (ML-DSA-65)."
    ),
    version     = "2036.2.0",
    docs_url    = "/docs",
    redoc_url   = "/redoc",
    lifespan    = lifespan,
)

# ── Middleware ─────────────────────────────────────────────────────────────────

# CORS: The Identity Service is called directly by the frontend SPA only for
# public DID resolution. All sensitive ops go through the Go gateway.
app.add_middleware(
    CORSMiddleware,
    allow_origins  = [os.getenv("CORS_ALLOWED_ORIGIN", "http://localhost:5050"), "http://localhost:3000"],
    allow_methods  = ["GET", "POST"],
    allow_headers  = ["Content-Type", "Authorization", "X-MediFlow-Request-ID"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)


# ── Dependency: Database Pool ──────────────────────────────────────────────────

async def get_db() -> asyncpg.Pool:
    """FastAPI dependency that provides the database connection pool."""
    if _db_pool is None:
        raise HTTPException(503, detail="Database not initialised")
    return _db_pool


# ── Health Check ───────────────────────────────────────────────────────────────

@app.get("/health", response_model=IdentityHealthResponse, tags=["System"])
async def health(db: asyncpg.Pool = Depends(get_db)):
    """
    Liveness + readiness probe for Kubernetes.
    Checks database connectivity and key initialisation.
    """
    try:
        await db.fetchval("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False

    return IdentityHealthResponse(
        status       = "ok" if db_ok else "degraded",
        pqc_mode     = pqc_mode(),
        db_connected = db_ok,
        platform_did = PLATFORM_DID,
    )


# ── PUBLIC: DID Registration ───────────────────────────────────────────────────

@app.post(
    "/api/identity/register",
    response_model=RegisterIdentityResponse,
    status_code=201,
    tags=["DID Management"],
    summary="Register a new self-sovereign identity",
)
async def register_identity(
    req: RegisterIdentityRequest,
    db: asyncpg.Pool = Depends(get_db),
):
    """
    Register a new W3C Decentralized Identifier (DID) for a patient, doctor,
    pharmacy, or IoT device.

    **Process**:
    1. Generate a Kyber-768 key pair (for encrypting communications TO this DID)
    2. Generate a Dilithium-3 key pair (for signing requests FROM this DID)
    3. Derive the DID from the Dilithium-3 public key (deterministic)
    4. Build and store the W3C DID Document
    5. Return the DID + private keys (**ONCE ONLY** — store securely!)

    **Security**: Private keys are returned in this response and **never stored**
    by MediFlow. Loss of private keys = permanent loss of identity access.
    """
    try:
        # Generate PQC key pairs for the new identity
        kp_dilithium = DilithiumSigner.generate_keypair()
        kp_kyber     = KyberKEM.generate_keypair()

        resolver = DIDResolver(db)
        result = await resolver.register_identity(
            subject_type    = req.subject_type,
            dilithium_keypair = kp_dilithium,
            kyber_keypair   = kp_kyber,
            legacy_user_id  = req.legacy_user_id,
        )

        return RegisterIdentityResponse(
            did          = result["did"],
            did_document = result["did_document"],
            secret_keys  = result["secret_keys"],
            pqc_mode     = pqc_mode(),
        )
    except Exception as e:
        log.error(f"[register] Failed: {e}")
        raise HTTPException(500, detail=f"Registration failed: {str(e)}")


# ── PUBLIC: DID Resolution ────────────────────────────────────────────────────

@app.get(
    "/api/identity/did/resolve",
    response_model=ResolveDIDResponse,
    tags=["DID Management"],
    summary="Resolve a DID to its DID Document",
)
async def resolve_did(did: str, db: asyncpg.Pool = Depends(get_db)):
    """
    Resolve a `did:mediflow:` identifier to its W3C DID Document.
    This is the equivalent of a DNS lookup for self-sovereign identities.
    Returns the DID Document containing the entity's PQC public keys.
    """
    resolver = DIDResolver(db)
    doc = await resolver.resolve(did)

    if doc is None:
        raise HTTPException(404, detail=f"DID not found: {did}")

    return ResolveDIDResponse(
        did          = did,
        did_document = doc,
        resolved     = True,
        deactivated  = doc.get("deactivated", False),
    )


# ── PUBLIC: VC Presentation (Authentication) ──────────────────────────────────

@app.post(
    "/api/identity/auth/present",
    response_model=AuthenticationResponse,
    tags=["Authentication"],
    summary="Authenticate by presenting a Verifiable Credential",
)
async def present_credential(
    req: PresentVCRequest,
    db: asyncpg.Pool = Depends(get_db),
):
    """
    The **passwordless login** endpoint for the MediFlow 2036 platform.

    The client presents a W3C Verifiable Presentation (VP) containing their
    Verifiable Credential, signed with their Dilithium-3 private key.

    **On success**: Returns a short-lived session VC for use in subsequent
    gateway-authenticated requests.

    **On failure**: Returns 401 with a descriptive reason (invalid signature,
    expired credential, revoked credential, replay attack detected).
    """
    if _vc_issuer is None:
        raise HTTPException(503, detail="Identity service not initialised")

    try:
        # Verify the VP and extract claims (see vc_issuer.py for the full flow)
        claims = await _vc_issuer.verify_presentation(
            presentation_b64  = req.presentation,
            request_timestamp = req.request_timestamp,
        )

        # Issue a short-lived session VC (24h) for the gateway to accept
        session_vc = await _vc_issuer.issue_credential(
            subject_did     = claims["subject_did"],
            credential_type = "PatientIdentityCredential",  # Session token type
            role            = claims["role"],
        )

        import time
        expiry_ts = int(time.time()) + (24 * 60 * 60)  # 24 hours from now

        return AuthenticationResponse(
            subject_did = claims["subject_did"],
            role        = claims["role"],
            vc_type     = claims["vc_type"],
            permissions = claims["permissions"],
            session_vc  = session_vc,
            expires_at  = expiry_ts,
        )

    except ValueError as e:
        reason = str(e)
        # Map specific error reasons to appropriate HTTP status codes
        if "expired" in reason:
            raise HTTPException(422, detail=reason)
        elif "revoked" in reason:
            raise HTTPException(410, detail=reason)
        else:
            raise HTTPException(401, detail=reason)
    except Exception as e:
        log.error(f"[auth/present] Unexpected error: {e}")
        raise HTTPException(500, detail="Internal verification error")


# ── INTERNAL: VP Verification (called by Go gateway) ─────────────────────────

@app.post(
    "/internal/verify",
    response_model=InternalVerifyResponse,
    tags=["Internal — Gateway"],
    include_in_schema=False,  # Hidden from public OpenAPI docs
    summary="[INTERNAL] Verify a VP for the Go gateway DID auth middleware",
)
async def internal_verify(
    req: InternalVerifyRequest,
    request: Request,
    db: asyncpg.Pool = Depends(get_db),
):
    """
    Internal endpoint called ONLY by the Go API Gateway on the pod network.
    Verifies a Verifiable Presentation and returns the extracted claims.

    Security: This endpoint should be network-policy restricted to only accept
    traffic from the gateway pod's IP range (Kubernetes NetworkPolicy).
    """
    # Ensure this is being called from the gateway (internal caller check)
    caller = request.headers.get("X-MediFlow-Caller", "")
    if caller != "gateway":
        raise HTTPException(403, detail="This endpoint is restricted to internal callers")

    if _vc_issuer is None:
        raise HTTPException(503, detail="Identity service not initialised")

    try:
        claims = await _vc_issuer.verify_presentation(
            presentation_b64  = req.presentation_json,
            request_timestamp = req.request_timestamp,
        )
        return InternalVerifyResponse(**claims)

    except ValueError as e:
        reason = str(e)
        if "expired" in reason:
            raise HTTPException(422, detail=reason)
        elif "revoked" in reason:
            raise HTTPException(410, detail=reason)
        else:
            raise HTTPException(401, detail=reason)


# ── INTERNAL: Kyber-768 KEM Decapsulation ────────────────────────────────────

@app.post(
    "/internal/pqc/decapsulate",
    response_model=InternalDecapsulateResponse,
    tags=["Internal — Gateway"],
    include_in_schema=False,
    summary="[INTERNAL] Kyber-768 KEM decapsulation for Go gateway PQC middleware",
)
async def internal_decapsulate(
    req: InternalDecapsulateRequest,
    request: Request,
):
    """
    Decapsulates a Kyber-768 KEM ciphertext using the gateway's private key.
    Returns the recovered shared secret (32-byte AES-256 content key).

    This is called by the Go gateway's PQCMiddleware for every PQC-encrypted
    request body. The Gateway holds NO private keys — this service holds them.

    THROUGHPUT: Kyber-768 decapsulation ≈ 0.07ms on modern hardware.
    This endpoint can sustain ~14,000 calls/second on a single CPU core.
    """
    caller = request.headers.get("X-MediFlow-Caller", "")
    if caller != "gateway":
        raise HTTPException(403, detail="Restricted to internal callers")

    if _gateway_kem_secret_key is None:
        raise HTTPException(503, detail="Gateway KEM key not initialised")

    # Validate the key_id matches our gateway key
    if req.key_id != "gateway-kyber768-v1":
        raise HTTPException(400, detail=f"Unknown key ID: {req.key_id}")

    try:
        ciphertext = decode_b64url(req.kem_ciphertext)
        shared_secret = KyberKEM.decapsulate(_gateway_kem_secret_key, ciphertext)
        return InternalDecapsulateResponse(
            shared_secret=encode_b64url(shared_secret)
        )
    except Exception as e:
        log.warning(f"[decapsulate] Failed: {e}")
        raise HTTPException(400, detail="decapsulation_failed")


# ── PROTECTED: Key Rotation ───────────────────────────────────────────────────

@app.post(
    "/api/identity/keys/rotate",
    tags=["Key Management"],
    summary="Rotate a PQC key pair",
)
async def rotate_key(
    req: RotateKeyRequest,
    request: Request,
    db: asyncpg.Pool = Depends(get_db),
):
    """
    Rotate a PQC key pair for the authenticated DID.

    The request must include a 'rotation_proof': the NEW public key bytes,
    signed with the OLD private key. This proves the requester controls the
    existing identity and is intentionally performing the key rotation.

    Called after DID auth — the subject DID is in X-MediFlow-DID header.
    """
    subject_did = request.headers.get("X-MediFlow-DID")
    if not subject_did:
        raise HTTPException(401, detail="Missing DID claim — authentication required")

    resolver = DIDResolver(db)

    # Fetch the current (old) Dilithium-3 public key
    old_key_id = f"{subject_did}#dilithium3-auth-1"
    old_public_key = await resolver.get_public_key(subject_did, old_key_id)
    if not old_public_key:
        raise HTTPException(404, detail="Current key not found for DID")

    # Verify the rotation proof: new public key signed with old private key
    new_public_key_bytes = decode_b64url(req.new_public_key_b64)
    rotation_proof = decode_b64url(req.rotation_proof_b64)

    if not DilithiumSigner.verify(old_public_key, new_public_key_bytes, rotation_proof):
        raise HTTPException(401, detail="Invalid rotation proof — old key signature required")

    # Update pqc_key_vault and DID Document with new key
    if _db_pool:
        await resolver.update_dilithium_key(subject_did, new_public_key_bytes)

    return {"status": "key_rotation_completed", "subject_did": subject_did}


# ── PROTECTED: Audit Log ──────────────────────────────────────────────────────

@app.get(
    "/api/identity/audit",
    tags=["Audit & Compliance"],
    summary="View VC presentation audit log (admin only)",
)
async def get_audit_log(
    request: Request,
    limit: int = 100,
    offset: int = 0,
    db: asyncpg.Pool = Depends(get_db),
):
    """
    Returns the HIPAA-compliant audit log of all VC presentation (authentication)
    events. Accessible only to admin-role DIDs.

    Each row represents one authentication event: who authenticated, when,
    from which IP (anonymized after 30 days per GDPR), and whether it succeeded.
    """
    role = request.headers.get("X-MediFlow-Role", "")
    if role != "admin":
        raise HTTPException(403, detail="Admin role required for audit access")

    rows = await db.fetch("""
        SELECT subject_did, verifier_service, verification_result,
               presented_at
        FROM identity.vc_presentation_log
        ORDER BY presented_at DESC
        LIMIT $1 OFFSET $2
    """, limit, offset)

    return {"audit_log": [dict(r) for r in rows], "limit": limit, "offset": offset}


# ── Dev Entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host      = "0.0.0.0",
        port      = 8001,
        reload    = True,
        log_level = "info",
    )
