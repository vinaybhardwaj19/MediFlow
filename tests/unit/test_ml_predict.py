"""
test_ml_predict.py — Integration Tests for ML Engine /predict Endpoint
Tests the FastAPI triage prediction pipeline end-to-end using TestClient.

NOTE: These tests require the ML Engine dependencies to be installed AND the
model to be loaded. In CI, they run inside the ml-engine Docker container.
When running locally without the model, tests are skipped gracefully.
"""

import sys
import unittest
from pathlib import Path

# Add ml-engine to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "ml-engine"))


class TestMLPredictEndpoint(unittest.TestCase):
    """
    Tests the /predict endpoint of the ML Engine using FastAPI TestClient.
    These tests run WITHOUT a live server — TestClient handles everything.
    Skips gracefully if model is not loaded or dependencies are missing.
    """

    @classmethod
    def setUpClass(cls):
        """Import and configure the FastAPI app with TestClient."""
        try:
            from fastapi.testclient import TestClient
            from main import app
            cls.client = TestClient(app)
            # Quick check: if health returns 503, model not loaded — skip all
            res = cls.client.get("/health")
            if res.status_code != 200:
                cls.available = False
                cls.skip_reason = f"ML Engine returned {res.status_code} — model not loaded (run inside Docker)"
            else:
                cls.available = True
        except Exception as e:
            cls.available = False
            cls.skip_reason = str(e)

    def setUp(self):
        if not self.available:
            self.skipTest(f"ML Engine unavailable: {self.skip_reason}")

    def test_health_endpoint(self):
        """GET /health should return status ok with model info."""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ok")

    def test_predict_basic_symptoms(self):
        """POST /predict with valid symptoms should return triage result."""
        res = self.client.post("/predict", json={
            "symptoms": ["headache", "fever", "cough"]
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("recommendedSpecialty", data)
        self.assertIn("confidence", data)
        self.assertIn("urgencyLevel", data)

    def test_predict_emergency_keywords(self):
        """Emergency keywords should force urgencyLevel to 'emergency'."""
        res = self.client.post("/predict", json={
            "symptoms": ["chest pain", "difficulty breathing"]
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["urgencyLevel"], "emergency")

    def test_predict_with_vital_signs(self):
        """Prediction with vital signs should include clinical scores."""
        res = self.client.post("/predict", json={
            "symptoms": ["fever", "cough"],
            "vitalSigns": {
                "heartRate": 95,
                "oxygenSaturation": 96,
                "systolicBP": 130,
                "temperature": 38.5,
                "respiratoryRate": 20
            },
            "patientAge": 45
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("clinicalScores", data)

    def test_predict_returns_differentials(self):
        """Prediction should include differential diagnoses."""
        res = self.client.post("/predict", json={
            "symptoms": ["headache", "nausea", "dizziness"]
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("differentials", data)


if __name__ == '__main__':
    unittest.main()
