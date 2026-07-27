"""
test_pqc_keys.py — Unit Tests for Post-Quantum Cryptography Keys (FIPS 203 / 204)
"""

import sys
from pathlib import Path

# Add services/identity to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "services" / "identity"))
from pqc_keys import DilithiumSigner, KyberKEM

def test_dilithium3_keypair_generation_and_signature():
    signer = DilithiumSigner()
    keypair = signer.generate_keypair()
    assert keypair.public_key is not None
    assert keypair.secret_key is not None

    message = b"MediFlow Patient Identity Verification Payload"
    signature = signer.sign(keypair.secret_key, message)
    assert signature is not None

    valid = signer.verify(keypair.public_key, message, signature)
    assert valid is True

def test_dilithium3_signature_tamper_detection():
    signer = DilithiumSigner()
    keypair = signer.generate_keypair()

    message = b"MediFlow Patient Identity Verification Payload"
    signature = signer.sign(keypair.secret_key, message)

    tampered_message = b"MediFlow TAMPERED Payload"
    valid = signer.verify(keypair.public_key, tampered_message, signature)
    assert valid is False

def test_kyber768_kem_encapsulation_decapsulation():
    kem = KyberKEM()
    keypair = kem.generate_keypair()
    assert keypair.public_key is not None
    assert keypair.secret_key is not None

    res = kem.encapsulate(keypair.public_key)
    assert res.ciphertext is not None
    assert res.shared_secret is not None

    shared_secret_receiver = kem.decapsulate(keypair.secret_key, res.ciphertext)
    assert shared_secret_receiver is not None
    assert len(shared_secret_receiver) == 32
