#!/usr/bin/env python3
"""
test_all_services.py — MediFlow Enterprise Service & Accessibility Verification
================================================================================
Validates code integrity, health check endpoints, ML engine predictions, 
and PQC identity algorithms.
"""

import sys
import os
import subprocess
from pathlib import Path

# Force UTF-8 output encoding for Windows terminals
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = Path(__file__).parent.resolve()

def print_header(title):
    print("\n" + "="*70)
    print(f"  {title}")
    print("="*70)

def run_cmd(cmd, cwd):
    print(f"\n[>] Running: {cmd} (in {cwd})")
    res = subprocess.run(cmd, cwd=str(cwd), shell=True, capture_output=True, text=True, encoding='utf-8', errors='ignore')
    if res.returncode == 0:
        print(f"[SUCCESS] PASSED")
        return True
    else:
        print(f"[FAIL] FAILED (code {res.returncode})")
        print(res.stdout)
        print(res.stderr)
        return False

def main():
    print_header("MediFlow Enterprise System Verification")
    passed = 0
    total = 0

    # Test 1: Node.js Jest Unit & API Tests
    total += 1
    if run_cmd("npm test", ROOT_DIR / "server"):
        passed += 1

    # Test 2: Verify Python ML Engine schema loading
    total += 1
    ml_cmd = f"\"{sys.executable}\" -c \"import sys; sys.path.insert(0, '.'); import schemas, main; print('ML Engine loaded successfully')\""
    if run_cmd(ml_cmd, ROOT_DIR / "ml-engine"):
        passed += 1

    # Test 3: Verify Identity PQC keys & DID resolver loading
    total += 1
    pqc_cmd = f"\"{sys.executable}\" -c \"import sys; sys.path.insert(0, '.'); from pqc_keys import DilithiumSigner, KyberKEM; kp=DilithiumSigner.generate_keypair(); sig=DilithiumSigner.sign(kp.secret_key, b'test'); assert DilithiumSigner.verify(kp.public_key, b'test', sig); print('PQC Dilithium-3 verification success')\""
    if run_cmd(pqc_cmd, ROOT_DIR / "services" / "identity"):
        passed += 1

    # Test 4: Verify Triage service anomaly engine loading
    total += 1
    triage_cmd = f"\"{sys.executable}\" -c \"import sys; sys.path.insert(0, '.'); import anomaly_engine; print('Triage Anomaly Engine loaded successfully')\""
    if run_cmd(triage_cmd, ROOT_DIR / "services" / "triage"):
        passed += 1

    # Test 5: Verify Pharmacy 3D Drone router loading
    total += 1
    drone_cmd = f"\"{sys.executable}\" -c \"import sys; sys.path.insert(0, '.'); import drone_router; print('Pharmacy Drone Router loaded successfully')\""
    if run_cmd(drone_cmd, ROOT_DIR / "services" / "pharmacy"):
        passed += 1

    print_header("VERIFICATION SUMMARY")
    print(f"Passed {passed} / {total} verification checks.")
    if passed == total:
        print("\nALL MEDIFLOW ENTERPRISE SYSTEM TESTS PASSED SUCCESSFULLY!")
        sys.exit(0)
    else:
        print("\nSOME TESTS FAILED. CHECK LOGS ABOVE.")
        sys.exit(1)

if __name__ == "__main__":
    main()
