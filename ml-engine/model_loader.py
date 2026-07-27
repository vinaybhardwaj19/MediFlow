"""
model_loader.py — Secure Model Loading with SHA-256 Integrity Verification
================================================================================

Prevents arbitrary code execution via tampered pickle files by verifying
the model's SHA-256 hash before deserialization.

USAGE:
    First deployment — generate the hash:
        python -c "from model_loader import compute_hash; from pathlib import Path; print(compute_hash(Path('triage_model.pkl')))"
    
    Then set the EXPECTED_MODEL_HASH environment variable or update MODEL_HASHES below.
"""

import hashlib
import logging
import os
from pathlib import Path

import joblib

log = logging.getLogger("mediflow-ml")

# Known-good model hashes. Add the SHA-256 of each verified model version here.
# If EXPECTED_MODEL_HASH env var is set, it takes precedence.
MODEL_HASHES: dict[str, str] = {
    # "2.0.0": "abc123...",  # Populate after first verified deployment
}


def compute_hash(path: Path) -> str:
    """Compute SHA-256 hash of a file in 8KB chunks (memory-efficient for large models)."""
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def load_model_secure(path: Path, skip_verify: bool = False) -> dict:
    """
    Load a joblib/pickle model file with optional SHA-256 integrity verification.

    Args:
        path: Path to the .pkl model file.
        skip_verify: If True, skip hash verification (for freshly trained models).

    Returns:
        The deserialized model bundle dict.

    Raises:
        FileNotFoundError: If the model file doesn't exist.
        RuntimeError: If hash verification fails (possible tampering).
    """
    if not path.exists():
        raise FileNotFoundError(f"Model file not found: {path}")

    actual_hash = compute_hash(path)

    # Check against environment variable first, then known hashes
    expected_hash = os.getenv("EXPECTED_MODEL_HASH")

    if not expected_hash and MODEL_HASHES:
        # Use the most recent known hash
        expected_hash = list(MODEL_HASHES.values())[-1]

    if expected_hash and not skip_verify:
        if actual_hash != expected_hash:
            raise RuntimeError(
                f"MODEL INTEGRITY FAILURE!\n"
                f"  Expected SHA-256: {expected_hash}\n"
                f"  Actual SHA-256:   {actual_hash}\n"
                f"The model file may have been tampered with. Refusing to load.\n"
                f"If this is a legitimately updated model, set EXPECTED_MODEL_HASH={actual_hash}"
            )
        log.info(f"✓ Model integrity verified: SHA-256={actual_hash[:16]}...")
    elif not skip_verify:
        log.warning(
            f"⚠ No expected hash configured — skipping integrity verification. "
            f"Current model hash: {actual_hash} — set EXPECTED_MODEL_HASH to enable verification."
        )

    bundle = joblib.load(path)
    log.info(f"Model loaded successfully from {path.name}")
    return bundle
