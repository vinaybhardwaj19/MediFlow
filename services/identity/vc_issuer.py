"""
vc_issuer.py — W3C Verifiable Credential Issuance & Verification
===============================================================================

ROLE IN THE 2036 AUTH FLOW:
    Traditional auth:
        Patient → [username, password] → Server hashes & compares → Issues JWT

    MediFlow 2036 auth:
        1. REGISTRATION (one-time):
           Identity Service issues a PatientIdentityCredential (VC) to the patient.
           The VC is signed with the PLATFORM's Dilithium-3 key.
           The VC contains: subject DID, role, issued date, expiry, permissions.

        2. AUTHENTICATION (every request):
           Patient creates a Verifiable Presentation (VP) — a wrapper that:
               a. Contains their VC
               b. Is signed with the PATIENT's Dilithium-3 private key
           Patient sends: "Authorization: DID-VP <base64url(VP)>"
           Gateway calls Identity Service to verify:
               - Verify the VP signature (patient's Dilithium-3 key)
               - Verify the VC signature (platform's Dilithium-3 key)
               - Check VC expiry and revocation status
               - Return extracted claims (DID, role, permissions)

WHY TWO SIGNATURES?
    The VP has two layers of signatures:
        Layer 1 (VC signature): Proves the PLATFORM issued this credential to
                                this specific patient (cannot be forged without
                                the platform's Dilithium-3 private key).
        Layer 2 (VP signature): Proves the PATIENT is the legitimate holder
                                of this credential RIGHT NOW (prevents replay —
                                even if someone intercepts the VP, they cannot
                                use it without the patient's private key).

    The two-signature design is equivalent to: "Here is my government-issued ID
    (VC), and here is my live fingerprint proving I'm the ID's owner (VP)."

W3C REFERENCES:
    - VC Data Model 2.0: https://www.w3.org/TR/vc-data-model-2.0/
    - Verifiable Presentations: https://www.w3.org/TR/vc-data-model-2.0/#presentations
===============================================================================
"""

from __future__ import annotations

import base64
import json
import logging
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import asyncpg

from pqc_keys import DilithiumSigner, decode_b64url, encode_b64url
from did_resolver import DIDResolver

log = logging.getLogger("mediflow.vc")

# ── Platform Constants ────────────────────────────────────────────────────────

VC_CONTEXT = [
    "https://www.w3.org/2018/credentials/v1",
    "https://mediflow.health/contexts/credentials/v1",
]

# The Platform's DID — the issuer of all MediFlow Verifiable Credentials.
# In production, this DID's Dilithium-3 private key is stored in an HSM.
PLATFORM_DID = "did:mediflow:MediFlowPlatform2036"

# Credential validity periods by type
VC_VALIDITY = {
    "PatientIdentityCredential":    timedelta(days=365),   # 1 year
    "MedicalLicenseCredential":     timedelta(days=365),   # 1 year (requires annual renewal)
    "PharmacyOperatorCredential":   timedelta(days=365),
    "DeviceAttestation":            timedelta(days=90),    # 90 days — IoT devices rotate frequently
    "EmergencyAccessCredential":    timedelta(hours=4),    # Short-lived — 4-hour emergency access
}

# Role-to-permissions mapping — defines what each role can do on the platform
ROLE_PERMISSIONS = {
    "patient": [
        "read:own_records", "write:own_records",
        "create:consultation", "read:own_consultations",
        "create:pharmacy_order", "read:own_pharmacy_orders",
        "read:own_triage", "create:triage",
    ],
    "doctor": [
        "read:patient_records", "write:consultation_notes",
        "create:prescription", "read:prescriptions",
        "create:consultation", "manage:consultations",
        "read:triage_results", "read:patient_triage",
    ],
    "pharmacy": [
        "read:prescriptions", "update:pharmacy_orders",
        "manage:bioprint_jobs", "manage:drone_fleet",
    ],
    "admin": ["*"],  # Admin wildcard — all permissions
}


# ── JSON Canonicalization (JCS) ───────────────────────────────────────────────

def _jcs_serialize(obj: Any) -> bytes:
    """
    JSON Canonicalization Scheme (RFC 8785) serialization.
    Produces a deterministic, canonical byte representation of a JSON object
    by sorting keys and using specific numeric formatting.

    This is required for digital signatures over JSON documents — without
    canonicalization, the same logical document could produce different byte
    sequences (different key ordering, whitespace), causing signature mismatches.

    Simplified implementation: uses sorted keys + no whitespace (sufficient for
    the MediFlow VC data model which uses simple string/number values).
    For production, use the 'jcs' PyPI package (pip install jcs).
    """
    return json.dumps(obj, sort_keys=True, separators=(',', ':')).encode('utf-8')


# ── VC Issuer ─────────────────────────────────────────────────────────────────

class VCIssuer:
    """
    Issues and verifies W3C Verifiable Credentials for the MediFlow platform.

    The platform's Dilithium-3 private key is required for issuance.
    Only the Identity Service holds this key — it is never exposed through any API.
    """

    def __init__(
        self,
        db_pool: asyncpg.Pool,
        did_resolver: DIDResolver,
        platform_secret_key: bytes,  # Platform's Dilithium-3 secret key (from HSM/env)
    ):
        self._db = db_pool
        self._resolver = did_resolver
        self._platform_secret_key = platform_secret_key

    # ── Credential Issuance ───────────────────────────────────────────────────

    async def issue_credential(
        self,
        subject_did: str,
        credential_type: str,
        role: str,
        extra_claims: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """
        Issue a W3C Verifiable Credential to a subject DID.

        The issued VC:
            - Is signed by the Platform's Dilithium-3 key
            - Contains the subject's role and permissions as credential claims
            - Has an expiry date based on the credential type
            - Is stored in identity.verifiable_credentials for revocation checking

        Args:
            subject_did:     The DID of the credential recipient
            credential_type: One of the types defined in ROLE_PERMISSIONS
            role:            The role claim to embed (patient|doctor|pharmacy|admin)
            extra_claims:    Additional claims to include in credentialSubject

        Returns:
            The complete W3C Verifiable Credential JSON object.
        """
        now = datetime.now(timezone.utc)
        expiry = now + VC_VALIDITY.get(credential_type, timedelta(days=365))
        credential_id = f"urn:mediflow:vc:{uuid.uuid4()}"

        # ── Build Credential Subject ───────────────────────────────────────────
        # The credentialSubject contains the verifiable claims about the subject.
        # These claims are embedded in the signed credential — they CANNOT be
        # tampered with without invalidating the Dilithium-3 signature.
        credential_subject = {
            "id":          subject_did,
            "role":        role,
            "permissions": ROLE_PERMISSIONS.get(role, []),
            **(extra_claims or {}),
        }

        # ── Build Unsigned Credential ──────────────────────────────────────────
        # The credential structure follows W3C VC Data Model 2.0
        unsigned_credential = {
            "@context":         VC_CONTEXT,
            "id":               credential_id,
            "type":             ["VerifiableCredential", credential_type],
            "issuer":           PLATFORM_DID,
            "issuanceDate":     now.isoformat(),
            "expirationDate":   expiry.isoformat(),
            "credentialSubject": credential_subject,
        }

        # ── Sign the Credential ────────────────────────────────────────────────
        # The proof is a Dilithium-3 signature over the JCS-canonicalized credential.
        # The signature covers the ENTIRE credential body — any modification
        # (e.g., changing 'role' from 'patient' to 'admin') will break the signature.
        canonical_bytes = _jcs_serialize(unsigned_credential)
        signature_bytes = DilithiumSigner.sign(self._platform_secret_key, canonical_bytes)
        proof_value_b64 = encode_b64url(signature_bytes)

        # The proof object follows the W3C Data Integrity Proofs specification
        proof = {
            "type":               "Dilithium3Signature2024",   # Custom PQC proof type
            "created":            now.isoformat(),
            "verificationMethod": f"{PLATFORM_DID}#dilithium3-signing-key-1",
            "proofPurpose":       "assertionMethod",
            # The actual Dilithium-3 signature (3309 bytes, base64url-encoded)
            "proofValue":         proof_value_b64,
            # Algorithm identifier for verifier library selection
            "cryptosuite":        "dilithium3-jcs-2024",
        }

        # Combine unsigned credential + proof = signed Verifiable Credential
        signed_credential = {**unsigned_credential, "proof": proof}

        # ── Persist to Database ────────────────────────────────────────────────
        vc_db_id = str(uuid.uuid4())
        await self._db.execute("""
            INSERT INTO identity.verifiable_credentials
                (id, issuer_did, subject_did, credential_type,
                 credential_json, proof_value, issued_at, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
            vc_db_id,
            PLATFORM_DID,
            subject_did,
            credential_type,
            json.dumps(signed_credential),
            proof_value_b64,
            now,
            expiry,
        )

        log.info(f"[VC] Credential issued: {credential_type} → {subject_did} (expires: {expiry.date()})")
        return signed_credential

    # ── Verifiable Presentation Verification ──────────────────────────────────

    async def verify_presentation(
        self,
        presentation_b64: str,
        request_timestamp: int,
    ) -> Dict[str, Any]:
        """
        Verify a W3C Verifiable Presentation and return the extracted claims.

        This is the CORE authentication operation called by the gateway's
        DID auth middleware for every protected request.

        A VP is a wrapper around a VC, additionally signed by the VC holder
        (the patient) to prove they are the legitimate credential holder right now.

        Process:
            1. Decode and parse the VP JSON
            2. Extract the embedded VC from the VP
            3. Verify the VP signature (patient's Dilithium-3 key)
               → Proves the PATIENT is currently presenting this credential
            4. Verify the VC signature (platform's Dilithium-3 key)
               → Proves MEDIFLOW issued this credential
            5. Check VC expiry and revocation status in the database
            6. Check replay: VP 'created' must be within 2 minutes of request
            7. Return verified claims: {subject_did, role, permissions, vc_type, expires_at}

        Raises:
            ValueError with a descriptive reason for any verification failure.
            The gateway translates these into appropriate HTTP status codes.
        """
        # ── Step 1: Decode and parse the VP ───────────────────────────────────
        try:
            # Add padding back (base64url has no padding)
            padding = 4 - len(presentation_b64) % 4
            if padding != 4:
                presentation_b64 += '=' * padding
            vp_json = base64.urlsafe_b64decode(presentation_b64).decode('utf-8')
            vp = json.loads(vp_json)
        except Exception as e:
            raise ValueError(f"malformed_presentation: {e}")

        # ── Step 2: Extract the VC from the VP ────────────────────────────────
        vcs = vp.get("verifiableCredential", [])
        if not vcs:
            raise ValueError("presentation_missing_credential")
        vc = vcs[0] if isinstance(vcs, list) else vcs

        # ── Step 3: Replay Attack Prevention ──────────────────────────────────
        # The VP's proof.created timestamp must be within 120 seconds of the
        # gateway's request timestamp. A stolen VP cannot be replayed after 2 minutes.
        vp_proof = vp.get("proof", {})
        vp_created_str = vp_proof.get("created", "")
        try:
            vp_created_ts = datetime.fromisoformat(vp_created_str).timestamp()
            age_seconds = abs(request_timestamp - vp_created_ts)
            if age_seconds > 120:
                raise ValueError(f"presentation_expired: age={int(age_seconds)}s (max 120s)")
        except (ValueError, AttributeError) as e:
            if "presentation_expired" in str(e):
                raise
            raise ValueError(f"invalid_proof_timestamp: {vp_created_str}")

        # ── Step 4: Verify VP Holder Signature (Patient's Dilithium-3 key) ────
        # The VP signature proves the PATIENT currently controls the DID.
        vp_proof_value_b64 = vp_proof.get("proofValue")
        if not vp_proof_value_b64:
            raise ValueError("presentation_missing_proof")

        vp_holder_did = vp.get("holder")
        if not vp_holder_did:
            raise ValueError("presentation_missing_holder")

        # The VP was signed over the VP body WITHOUT the proof field (standard)
        vp_without_proof = {k: v for k, v in vp.items() if k != "proof"}
        vp_canonical = _jcs_serialize(vp_without_proof)

        # Fetch the holder's Dilithium-3 public key from the DID document
        holder_key_id = vp_proof.get("verificationMethod")
        if not holder_key_id:
            raise ValueError("presentation_missing_verification_method")

        holder_public_key = await self._resolver.get_public_key(vp_holder_did, holder_key_id)
        if not holder_public_key:
            raise ValueError(f"did_key_not_found: {holder_key_id}")

        vp_signature = decode_b64url(vp_proof_value_b64)
        if not DilithiumSigner.verify(holder_public_key, vp_canonical, vp_signature):
            raise ValueError("invalid_presentation_signature")

        # ── Step 5: Verify VC Issuer Signature (Platform's Dilithium-3 key) ───
        vc_proof = vc.get("proof", {})
        vc_proof_value_b64 = vc_proof.get("proofValue")
        if not vc_proof_value_b64:
            raise ValueError("credential_missing_proof")

        vc_without_proof = {k: v for k, v in vc.items() if k != "proof"}
        vc_canonical = _jcs_serialize(vc_without_proof)

        # Fetch the platform's signing public key (known, trusted key)
        platform_key_id = vc_proof.get("verificationMethod")
        platform_public_key = await self._resolver.get_public_key(PLATFORM_DID, platform_key_id)
        if not platform_public_key:
            raise ValueError("platform_key_not_found: cannot verify credential signature")

        vc_signature = decode_b64url(vc_proof_value_b64)
        if not DilithiumSigner.verify(platform_public_key, vc_canonical, vc_signature):
            raise ValueError("invalid_credential_signature")

        # ── Step 6: Check VC Expiry and Revocation ────────────────────────────
        expiration_str = vc.get("expirationDate")
        if expiration_str:
            expiry = datetime.fromisoformat(expiration_str)
            if datetime.now(timezone.utc) > expiry:
                raise ValueError("credential_expired")

        # Check revocation status in the database (covers explicit admin revocations)
        vc_id = vc.get("id", "")
        revoked = await self._db.fetchval("""
            SELECT is_revoked FROM identity.verifiable_credentials
            WHERE credential_json->>'id' = $1
        """, vc_id)

        if revoked:
            raise ValueError("credential_revoked")

        # ── Step 7: Extract and Return Verified Claims ─────────────────────────
        credential_subject = vc.get("credentialSubject", {})
        expiry_ts = (
            int(datetime.fromisoformat(expiration_str).timestamp())
            if expiration_str else 0
        )

        log.info(
            f"[VC] Presentation verified: holder={vp_holder_did} "
            f"role={credential_subject.get('role')} "
            f"type={vc.get('type', [])[-1]}"
        )

        return {
            "subject_did":  vp_holder_did,
            "role":         credential_subject.get("role", ""),
            "vc_type":      vc.get("type", ["VerifiableCredential"])[-1],
            "permissions":  credential_subject.get("permissions", []),
            "expires_at":   expiry_ts,
        }
