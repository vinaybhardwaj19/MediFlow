"""
conftest.py — Shared Pytest Fixtures for MediFlow Enterprise Integration Test Suite
"""

import sys
import os
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).parent.parent.resolve()

# Add service paths to sys.path
sys.path.insert(0, str(ROOT_DIR / "ml-engine"))
sys.path.insert(0, str(ROOT_DIR / "services" / "identity"))
sys.path.insert(0, str(ROOT_DIR / "services" / "triage"))
sys.path.insert(0, str(ROOT_DIR / "services" / "pharmacy"))
sys.path.insert(0, str(ROOT_DIR / "services" / "analytics"))

@pytest.fixture
def mock_vitals():
    return {
        "heart_rate": 88,
        "hrv": 45,
        "spo2": 97,
        "systolic_bp": 120,
        "diastolic_bp": 80,
        "respiratory_rate": 16,
        "glucose": 95,
        "body_temp": 37.0
    }

@pytest.fixture
def sample_symptoms():
    return ["chest pain", "shortness of breath", "dizziness"]
