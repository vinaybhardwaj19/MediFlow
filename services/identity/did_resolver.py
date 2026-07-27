"""
did_resolver.py — W3C Decentralized Identifier (DID) Operations
===============================================================================

REAL-WORLD PROBLEM:
    Every healthcare system today uses a CENTRALIZED identity model:
        - Username + password stored in a hospital database.
        - The hospital OWNS your identity. If they get breached, YOUR data
          is exposed. If they go offline, YOU cannot authenticate anywhere.
        - Sharing records with another hospital requires their explicit permission
          and a custom API integration — there is no universal patient identity.

SOLUTION — SELF-SOVEREIGN IDENTITY (SSI) WITH W3C DIDs:
    Each patient is assigned a Decentralized Identifier (DID):
        did:mediflow:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK

    The DID resolves to a DID Document (a JSON-LD file) that contains:
        - The patient's PQC public keys (Kyber-768, Dilithium-3)
        - Service endpoints (where to deliver messages/records)
        - Authentication methods (how to verify requests from this patient)

    CRITICALLY: The DID Document does NOT contain:
        - The patient's name, address, or any PHI
        - Any password or secret
        - Any centralized database ID

    The DID is an opaque, content-addressed identifier. The patient controls
    it using their private key (on their device). No central authority can
    revoke or modify it without the patient's cryptographic consent.

MEDIFLOW DID METHOD (did:mediflow):
    We implement a simplified DID method where:
        DID = "did:mediflow:" + base58btc(SHA3-256(public_key_bytes))
    This makes the DID deterministically derivable from the public key —
    a property called "DID key derivation". The first Dilithium-3 public key
    generated during registration becomes the DID's permanent identifier.

W3C REFERENCES:
    - DID Core Specification: https://www.w3.org/TR/did-core/
    - Verifiable Credentials: https://www.w3.org/TR/vc-data-model/
===============================================================================
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import asyncpg  # Async PostgreSQL driver

from pqc_keys import DilithiumSigner, KyberKEM, encode_b64url, decode_b64url

log = logging.getLogger("mediflow.did")

# ── DID Method Constants ──────────────────────────────────────────────────────

DID_METHOD = "mediflow"
DID_CONTEXT = [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/jws-2020/v1",
    # Custom MediFlow context for PQC key types
    "https://mediflow.health/contexts/pqc-2036/v1",
]

# ── DID Generation ────────────────────────────────────────────────────────────

def _base58btc_encode(data: bytes) -> str:
    """
    Base58Bitcoin encoding — the encoding used by Bitcoin addresses and
    IPFS CIDs. Used here because it is URL-safe and human-readable without
    ambiguous characters (no 0, O, I, l).
    """
    ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    n = int.from_bytes(data, "big")
    result = ""
    while n > 0:
        n, r = divmod(n, 58)
        result = ALPHABET[r] + result
    # Preserve leading zero bytes as '1'
    for byte in data:
        if byte == 0:
            result = "1" + result
        else:
            break
    return result


def derive_did_from_public_key(dilithium_public_key: bytes) -> str:
    """
    Deterministically derive a W3C DID from a Dilithium-3 public key.

    Algorithm:
        1. Compute SHA3-256 of the raw public key bytes (32 bytes)
        2. Take the first 20 bytes (similar to Ethereum address derivation)
        3. Base58Bitcoin-encode → produces a ~28-character string
        4. Prepend "did:mediflow:" prefix

    The result is a globally unique, collision-resistant identifier that:
        - Cannot be guessed or enumerated
        - Is deterministic (same key always produces same DID)
        - Does not require any central registration
        - Is quantum-resistant (derives from a Dilithium-3 key)
    """
    # SHA3-256 of the public key bytes — 32 bytes
    key_hash = hashlib.sha3_256(dilithium_public_key).digest()
    # Take first 20 bytes (160 bits — collision probability < 2^-80)
    identifier_bytes = key_hash[:20]
    # Base58Bitcoin encode for URL-safe, human-readable DID
    identifier = _base58btc_encode(identifier_bytes)
    return f"did:{DID_METHOD}:{identifier}"


def build_did_document(
    did: str,
    dilithium_public_key: bytes,
    kyber_public_key: bytes,
    subject_type: str,
    service_endpoints: Optional[List[Dict]] = None,
) -> Dict[str, Any]:
    """
    Construct a W3C DID Document for a newly registered identity.

    The DID Document is a JSON-LD document that maps a DID to its public
    key material and service endpoints. It is the "DNS record" of the
    self-sovereign identity world.

    Args:
        did:                   The derived DID string (did:mediflow:...)
        dilithium_public_key:  Raw bytes of the Dilithium-3 public key
        kyber_public_key:      Raw bytes of the Kyber-768 public key
        subject_type:          'patient' | 'doctor' | 'pharmacy' | 'device'
        service_endpoints:     Optional list of service endpoint objects

    Returns:
        A W3C-compliant DID Document as a Python dictionary (ready to serialize as JSON).
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    # Key IDs — stable, unique identifiers for each key in this DID Document
    dilithium_key_id = f"{did}#dilithium3-auth-1"
    kyber_key_id     = f"{did}#kyber768-key-agreement-1"

    # Base64url-encode the raw public key bytes for JSON transport
    dilithium_pub_b64 = encode_b64url(dilithium_public_key)
    kyber_pub_b64     = encode_b64url(kyber_public_key)

    did_document = {
        # JSON-LD context array — defines the semantic vocabulary
        "@context": DID_CONTEXT,

        # The DID this document describes (must match the resolved DID)
        "id": did,

        # DID Document creation timestamp (informational, not enforced by spec)
        "created": now_iso,
        "updated": now_iso,

        # ── Verification Methods ───────────────────────────────────────────────
        # Lists all public keys associated with this DID, each with an algorithm
        # descriptor and the raw public key material.
        "verificationMethod": [
            {
                # Dilithium-3 key for AUTHENTICATION and ASSERTION (signing VCs and VPs)
                "id":           dilithium_key_id,
                "type":         "Dilithium3VerificationKey2024",  # Custom type for PQC
                "controller":   did,
                # The PQC public key, multibase-encoded (base64url with 'u' prefix)
                "publicKeyMultibase": "u" + dilithium_pub_b64,
                # Metadata about the cryptographic algorithm
                "algorithm": {
                    "id":            "NIST-FIPS-204",  # ML-DSA-65 standard identifier
                    "keySize":       "NIST-Level-3",
                    "publicKeySize": "1952 bytes",
                    "sigSize":       "3309 bytes",
                }
            },
            {
                # Kyber-768 key for KEY AGREEMENT (encrypting session keys TO this DID)
                "id":           kyber_key_id,
                "type":         "Kyber768KeyAgreementKey2024",  # Custom type for PQC KEM
                "controller":   did,
                "publicKeyMultibase": "u" + kyber_pub_b64,
                "algorithm": {
                    "id":            "NIST-FIPS-203",  # ML-KEM-768 standard identifier
                    "keySize":       "NIST-Level-3",
                    "publicKeySize": "1184 bytes",
                    "ciphertextSize": "1088 bytes",
                }
            }
        ],

        # ── Authentication ─────────────────────────────────────────────────────
        # References to verification methods that can be used to authenticate as this DID.
        # Uses the Dilithium-3 key — the patient signs a VP with this key's private counterpart.
        "authentication": [dilithium_key_id],

        # ── Assertion Method ───────────────────────────────────────────────────
        # References to methods used to issue credentials FROM this DID.
        # (Patients asserting facts about themselves, e.g., emergency consent VCs)
        "assertionMethod": [dilithium_key_id],

        # ── Key Agreement ──────────────────────────────────────────────────────
        # References to methods for establishing encrypted communications TO this DID.
        # Uses the Kyber-768 key — anyone can encrypt a session key for this patient.
        "keyAgreement": [kyber_key_id],

        # ── Service Endpoints ──────────────────────────────────────────────────
        # Where to deliver messages, health records, or notifications to this DID.
        "service": service_endpoints or [
            {
                "id":              f"{did}#mediflow-inbox",
                "type":            "MediFlowInbox",
                "serviceEndpoint": f"https://notify.mediflow.health/inbox/{did}",
            }
        ],

        # Custom MediFlow metadata (outside the W3C spec, for platform use)
        "mediflowMetadata": {
            "subjectType":    subject_type,
            "platformVersion": "2036.2.0",
        }
    }

    return did_document


# ── DID Resolver Class ────────────────────────────────────────────────────────

class DIDResolver:
    """
    Resolves and manages W3C DIDs on the MediFlow platform.

    Provides async methods to:
        - Register a new DID (create DID Document + key vault entry)
        - Resolve a DID (fetch its DID Document)
        - Fetch a specific public key by key ID from a DID Document
        - Update a DID Document (key rotation)
        - Deactivate a DID (soft-delete, irreversible)
    """

    def __init__(self, db_pool: Optional[asyncpg.Pool]):
        self._db = db_pool
        self._mem_dids = {}
        self._mem_keys = {}

    # ── Registration ──────────────────────────────────────────────────────────

    async def register_identity(
        self,
        subject_type: str,
        dilithium_keypair,  # SignatureKeyPair from pqc_keys
        kyber_keypair,      # KEMKeyPair from pqc_keys
        legacy_user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        did = derive_did_from_public_key(dilithium_keypair.public_key)
        log.info(f"[DID] Registering new identity: {did} (type={subject_type})")

        did_document = build_did_document(
            did=did,
            dilithium_public_key=dilithium_keypair.public_key,
            kyber_public_key=kyber_keypair.public_key,
            subject_type=subject_type,
        )

        if not self._db:
            self._mem_dids[did] = did_document
            self._mem_keys[f"{did}#dilithium3-auth-1"] = dilithium_keypair.public_key_b64
            self._mem_keys[f"{did}#kyber768-key-agreement-1"] = kyber_keypair.public_key_b64
            log.info(f"[DID] [In-Memory] Identity registered: {did}")
            return {
                "did": did,
                "did_document": did_document,
                "secret_keys": {
                    "dilithium3_secret_key_b64": encode_b64url(dilithium_keypair.secret_key),
                    "kyber768_secret_key_b64":   encode_b64url(kyber_keypair.secret_key),
                    "warning": (
                        "CRITICAL: Store these keys securely on your device. "
                        "MediFlow does not retain copies. Loss = permanent identity loss."
                    ),
                },
            }

        did_id = str(uuid.uuid4())
        async with self._db.acquire() as conn:
            async with conn.transaction():
                # Insert the DID Document
                await conn.execute("""
                    INSERT INTO identity.did_documents
                        (id, did, did_document, subject_type, legacy_user_id)
                    VALUES ($1, $2, $3, $4, $5)
                """,
                    did_id,
                    did,
                    json.dumps(did_document),
                    subject_type,
                    legacy_user_id,
                )

                # Insert the Dilithium-3 public key into the key vault
                await conn.execute("""
                    INSERT INTO identity.pqc_key_vault
                        (did_id, key_id, algorithm, key_purpose, public_key_b64, key_fingerprint)
                    VALUES ($1, $2, $3, $4, $5, $6)
                """,
                    did_id,
                    f"{did}#dilithium3-auth-1",
                    "Dilithium-3",
                    "assertionMethod",
                    dilithium_keypair.public_key_b64,
                    dilithium_keypair.fingerprint,
                )

                # Insert the Kyber-768 public key into the key vault
                await conn.execute("""
                    INSERT INTO identity.pqc_key_vault
                        (did_id, key_id, algorithm, key_purpose, public_key_b64, key_fingerprint)
                    VALUES ($1, $2, $3, $4, $5, $6)
                """,
                    did_id,
                    f"{did}#kyber768-key-agreement-1",
                    "Kyber-768",
                    "keyAgreement",
                    kyber_keypair.public_key_b64,
                    kyber_keypair.fingerprint,
                )

        log.info(f"[DID] Identity registered successfully: {did}")

        return {
            "did": did,
            "did_document": did_document,
            "secret_keys": {
                "dilithium3_secret_key_b64": encode_b64url(dilithium_keypair.secret_key),
                "kyber768_secret_key_b64":   encode_b64url(kyber_keypair.secret_key),
                "warning": (
                    "CRITICAL: Store these keys securely on your device. "
                    "MediFlow does not retain copies. Loss = permanent identity loss."
                ),
            },
        }

    # ── Resolution ────────────────────────────────────────────────────────────

    async def resolve(self, did: str) -> Optional[Dict[str, Any]]:
        if not self._db:
            return self._mem_dids.get(did)

        row = await self._db.fetchrow("""
            SELECT did_document, is_active
            FROM identity.did_documents
            WHERE did = $1
        """, did)

        if not row:
            return None

        if not row["is_active"]:
            return {
                "@context": DID_CONTEXT,
                "id": did,
                "deactivated": True,
            }

        return json.loads(row["did_document"])

    # ── Key Retrieval ─────────────────────────────────────────────────────────

    async def get_public_key(self, did: str, key_id: str) -> Optional[bytes]:
        if not self._db:
            pub_b64 = self._mem_keys.get(key_id)
            return decode_b64url(pub_b64) if pub_b64 else None
        """
        Fetch a specific public key's raw bytes from the pqc_key_vault.

        Called by the VC verifier when it needs to verify a Dilithium-3 signature
        from a specific DID. The key_id comes from the VC's 'proof.verificationMethod' field.
        """
        row = await self._db.fetchrow("""
            SELECT v.public_key_b64
            FROM identity.pqc_key_vault v
            JOIN identity.did_documents d ON d.id = v.did_id
            WHERE d.did = $1 AND v.key_id = $2 AND v.is_active = TRUE
        """, did, key_id)

        if not row:
            return None

        return decode_b64url(row["public_key_b64"])

    async def get_all_keys_for_did(self, did: str) -> List[Dict]:
        """Return all active public keys for a DID (for key rotation audit)."""
        rows = await self._db.fetch("""
            SELECT v.key_id, v.algorithm, v.key_purpose,
                   v.public_key_b64, v.key_fingerprint,
                   v.valid_from, v.valid_until, v.is_active
            FROM identity.pqc_key_vault v
            JOIN identity.did_documents d ON d.id = v.did_id
            WHERE d.did = $1
            ORDER BY v.created_at DESC
        """, did)
        return [dict(r) for r in rows]

    async def update_dilithium_key(self, did: str, new_public_key: bytes) -> bool:
        """
        Update the Dilithium-3 public key for a DID (Key Rotation).
        Persists newly rotated key into pqc_key_vault and updates the DID document.
        """
        row = await self._db.fetchrow("SELECT id, did_document FROM identity.did_documents WHERE did = $1", did)
        if not row:
            return False

        did_id = row["id"]
        doc = json.loads(row["did_document"])
        new_key_id = f"{did}#dilithium3-auth-1"
        new_pub_b64 = encode_b64url(new_public_key)

        # Update DID Document verificationMethod
        for vm in doc.get("verificationMethod", []):
            if vm.get("id") == new_key_id or "Dilithium" in vm.get("type", ""):
                vm["publicKeyMultibase"] = "u" + new_pub_b64

        doc["updated"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

        async with self._db.acquire() as conn:
            async with conn.transaction():
                # Deactivate old key
                await conn.execute("""
                    UPDATE identity.pqc_key_vault
                    SET is_active = FALSE
                    WHERE did_id = $1 AND key_purpose = 'authentication'
                """, did_id)

                # Insert new key
                await conn.execute("""
                    INSERT INTO identity.pqc_key_vault
                        (did_id, key_id, algorithm, key_purpose, public_key_b64, key_fingerprint)
                    VALUES ($1, $2, 'NIST-FIPS-204', 'authentication', $3, $4)
                """, did_id, new_key_id, new_pub_b64, compute_key_fingerprint(new_public_key))

                # Update DID Document
                await conn.execute("""
                    UPDATE identity.did_documents
                    SET did_document = $1, updated_at = NOW()
                    WHERE id = $2
                """, json.dumps(doc), did_id)

        log.info(f"[DID] Key rotation completed for DID: {did}")
        return True

