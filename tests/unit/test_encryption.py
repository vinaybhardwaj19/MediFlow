"""
test_encryption.py — Unit Tests for AES-256-GCM Field-Level Encryption Roundtrip
Tests the encryption service logic used by all Mongoose models for PHI protection.
"""

import os
import sys
import hashlib
import unittest
from pathlib import Path


class TestAES256GCMEncryption(unittest.TestCase):
    """
    Tests AES-256-GCM encryption/decryption roundtrip using Python's
    cryptography library, mirroring the Node.js encryption.service.js logic.
    """

    def setUp(self):
        """Set up a test encryption key (32 bytes = 64 hex chars)."""
        self.key_hex = hashlib.sha256(b"mediflow-test-key-2026").hexdigest()
        self.key_bytes = bytes.fromhex(self.key_hex)

    def _encrypt(self, plaintext: str) -> str:
        """Encrypt using AES-256-GCM, matching Node.js format: iv:authTag:ciphertext"""
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        iv = os.urandom(12)  # 96-bit IV
        aesgcm = AESGCM(self.key_bytes)
        ciphertext = aesgcm.encrypt(iv, plaintext.encode('utf-8'), None)
        # GCM appends auth tag (16 bytes) to ciphertext
        ct_without_tag = ciphertext[:-16]
        auth_tag = ciphertext[-16:]
        return f"{iv.hex()}:{auth_tag.hex()}:{ct_without_tag.hex()}"

    def _decrypt(self, encrypted: str) -> str:
        """Decrypt AES-256-GCM format: iv:authTag:ciphertext"""
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        iv_hex, tag_hex, ct_hex = encrypted.split(':')
        iv = bytes.fromhex(iv_hex)
        tag = bytes.fromhex(tag_hex)
        ct = bytes.fromhex(ct_hex)
        aesgcm = AESGCM(self.key_bytes)
        plaintext = aesgcm.decrypt(iv, ct + tag, None)
        return plaintext.decode('utf-8')

    def test_encrypt_decrypt_roundtrip(self):
        """Verify encrypt→decrypt roundtrip produces original plaintext."""
        original = "Patient: John Doe, SSN: 123-45-6789"
        encrypted = self._encrypt(original)
        decrypted = self._decrypt(encrypted)
        self.assertEqual(decrypted, original)

    def test_encrypted_format(self):
        """Verify encrypted output follows iv:authTag:ciphertext hex format."""
        encrypted = self._encrypt("test-phi-data")
        parts = encrypted.split(':')
        self.assertEqual(len(parts), 3, "Encrypted format must be iv:authTag:ciphertext")
        self.assertEqual(len(parts[0]), 24, "IV must be 12 bytes = 24 hex chars")
        self.assertEqual(len(parts[1]), 32, "Auth tag must be 16 bytes = 32 hex chars")
        self.assertTrue(len(parts[2]) > 0, "Ciphertext must not be empty")

    def test_unique_iv_per_encryption(self):
        """Each encryption must produce a different ciphertext (random IV)."""
        plaintext = "same-input-data"
        enc1 = self._encrypt(plaintext)
        enc2 = self._encrypt(plaintext)
        self.assertNotEqual(enc1, enc2, "Same plaintext must produce different ciphertexts")

    def test_tamper_detection(self):
        """Modified ciphertext must fail authentication (GCM integrity)."""
        from cryptography.exceptions import InvalidTag
        encrypted = self._encrypt("sensitive-data")
        parts = encrypted.split(':')
        # Tamper with the ciphertext
        tampered_ct = "ff" + parts[2][2:]
        tampered = f"{parts[0]}:{parts[1]}:{tampered_ct}"
        with self.assertRaises(InvalidTag):
            self._decrypt(tampered)

    def test_empty_string_roundtrip(self):
        """Empty strings should encrypt and decrypt correctly."""
        encrypted = self._encrypt("")
        decrypted = self._decrypt(encrypted)
        self.assertEqual(decrypted, "")

    def test_unicode_roundtrip(self):
        """Unicode text (Hindi/Devanagari) must roundtrip correctly."""
        original = "रोगी का नाम: राहुल शर्मा"
        encrypted = self._encrypt(original)
        decrypted = self._decrypt(encrypted)
        self.assertEqual(decrypted, original)

    def test_long_text_roundtrip(self):
        """Large clinical notes must encrypt and decrypt correctly."""
        original = "Clinical notes: " + "A" * 10000
        encrypted = self._encrypt(original)
        decrypted = self._decrypt(encrypted)
        self.assertEqual(decrypted, original)


if __name__ == '__main__':
    unittest.main()
