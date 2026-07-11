"""
schemas.py — Pydantic v2 Request/Response Schemas for the Identity Service
===============================================================================
All schemas use strict typing for FastAPI's automatic OpenAPI documentation
and request validation. Field aliases use camelCase for JSON interoperability
with the JavaScript frontend while keeping Python attributes in snake_case.
===============================================================================
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator
import re


# ── Registration Schemas ──────────────────────────────────────────────────────

class RegisterIdentityRequest(BaseModel):
    """
    Request body for POST /api/identity/register

    A new patient or doctor registers by providing only their subject type.
    The Identity Service generates their PQC key pairs and DID automatically.
    No username, no password, no email (privacy-first).

    Optional: legacy_user_id links this DID to an existing Node.js user account
    during the migration phase. This will be removed in the final 2036 platform.
    """
    subject_type:   str  = Field(..., pattern="^(patient|doctor|pharmacy|device|admin)$",
                                  description="The type of entity being registered")
    legacy_user_id: Optional[str] = Field(None, description="Optional link to legacy Node.js user ID")
    # Optional initial device metadata for IoT device DID registration
    device_metadata: Optional[Dict[str, Any]] = Field(None, description="IoT device specs (for device type only)")

    model_config = {"populate_by_name": True}


class RegisterIdentityResponse(BaseModel):
    """
    Response for a successful DID registration.

    CRITICAL: The secret_keys field is returned ONLY ONCE and must be
    immediately and securely stored by the client. MediFlow does not retain
    any copy of the private keys.
    """
    did:          str
    did_document: Dict[str, Any]
    secret_keys:  Dict[str, str]  # {dilithium3_secret_key_b64, kyber768_secret_key_b64, warning}
    pqc_mode:     str             # 'REAL PQC (liboqs)' or 'SIMULATION (exhibition)'


# ── DID Resolution Schemas ────────────────────────────────────────────────────

class ResolveDIDResponse(BaseModel):
    """Response for GET /api/identity/did/resolve?did=did:mediflow:..."""
    did:          str
    did_document: Optional[Dict[str, Any]]
    resolved:     bool
    deactivated:  bool = False


# ── Authentication / VC Presentation Schemas ──────────────────────────────────

class PresentVCRequest(BaseModel):
    """
    Request body for POST /api/identity/auth/present

    The client presents a W3C Verifiable Presentation to authenticate.
    The VP is a base64url-encoded JSON-LD document containing:
        - The patient's Verifiable Credential (issued by the platform at registration)
        - A Dilithium-3 signature by the patient's private key over the VP body

    No passwords. No session cookies. Pure cryptographic proof.
    """
    # The base64url-encoded W3C Verifiable Presentation JSON
    presentation: str  = Field(..., min_length=50,
                                description="Base64url-encoded W3C Verifiable Presentation JSON")
    # Request timestamp for replay attack prevention (Unix epoch seconds)
    request_timestamp: int = Field(..., description="Unix epoch seconds from the requesting client")

    @field_validator("presentation")
    @classmethod
    def validate_presentation_format(cls, v: str) -> str:
        # Basic format check: must be valid base64url (no padding)
        if not re.match(r'^[A-Za-z0-9_-]+$', v):
            raise ValueError("presentation must be base64url-encoded (no padding)")
        return v


class AuthenticationResponse(BaseModel):
    """
    Response for a successful VC presentation authentication.

    Returns a short-lived Platform Session VC — this IS ITSELF a Verifiable Credential
    signed by the platform, embedding the verified claims. The gateway accepts this
    for subsequent requests without re-verifying the original VP.
    """
    subject_did:      str
    role:             str
    vc_type:          str
    permissions:      List[str]
    # A new short-lived VC for use as the session token (24h validity)
    session_vc:       Dict[str, Any]
    expires_at:       int   # Unix epoch seconds


# ── Internal Gateway Schemas ──────────────────────────────────────────────────

class InternalVerifyRequest(BaseModel):
    """
    Internal endpoint schema for POST /internal/verify
    Called by the Go gateway's DID auth middleware.
    This endpoint is NOT exposed through the gateway (internal pod network only).
    """
    presentation_json: str   # Base64url-encoded VP (same as PresentVCRequest.presentation)
    request_timestamp: int


class InternalVerifyResponse(BaseModel):
    """
    Verified claims returned to the Go gateway after VP verification.
    These become the X-MediFlow-* headers injected into upstream requests.
    """
    subject_did:  str
    role:         str
    vc_type:      str
    expires_at:   int
    permissions:  List[str]


class InternalDecapsulateRequest(BaseModel):
    """
    Internal endpoint schema for POST /internal/pqc/decapsulate
    Called by the Go gateway's PQC decrypt middleware.
    """
    kem_ciphertext: str   # Base64url-encoded Kyber-768 KEM ciphertext
    key_id:         str   # The key ID to use for decapsulation


class InternalDecapsulateResponse(BaseModel):
    """
    Decapsulation response — the recovered shared secret (AES-256 key).
    """
    shared_secret: str    # Base64url-encoded 32-byte AES-256-GCM key


# ── Key Management Schemas ────────────────────────────────────────────────────

class RotateKeyRequest(BaseModel):
    """
    Request body for POST /api/identity/keys/rotate
    Initiates a PQC key rotation for the requesting DID.
    The new public key must be pre-signed with the OLD private key
    to prove the requester still controls the identity.
    """
    new_public_key_b64:  str  = Field(..., description="New Dilithium-3 public key (base64url)")
    algorithm:           str  = Field("Dilithium-3", pattern="^(Dilithium-3|Falcon-512)$")
    # Proof of control: the new public key signed with the OLD private key
    rotation_proof_b64:  str  = Field(..., description="Old private key signature over new public key")
    key_purpose:         str  = Field("assertionMethod",
                                       pattern="^(keyAgreement|assertionMethod|authentication)$")


class KeyInfoResponse(BaseModel):
    """Public key information for display in the identity management panel."""
    key_id:          str
    algorithm:       str
    key_purpose:     str
    key_fingerprint: str
    is_active:       bool
    valid_from:      str
    valid_until:     Optional[str]


# ── Health Check ──────────────────────────────────────────────────────────────

class IdentityHealthResponse(BaseModel):
    """Response for GET /health"""
    status:          str  = "ok"
    service:         str  = "mediflow-identity"
    version:         str  = "2036.2.0"
    pqc_mode:        str  # 'REAL PQC (liboqs)' or 'SIMULATION (exhibition)'
    db_connected:    bool
    platform_did:    str
