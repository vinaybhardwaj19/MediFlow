"""
test_bigquery_ml.py — Unit Tests for BigQuery ML Integration Module
Tests health check, query generation, and simulation fallback.
"""

import sys
import asyncio
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "services" / "analytics"))
import bigquery_ml


class TestBigQueryMLHealth(unittest.TestCase):
    """Test BigQuery ML health and configuration."""

    def test_health_check_returns_required_fields(self):
        """Health check must return status, project_id, dataset_id."""
        health = bigquery_ml.check_bigquery_health()
        self.assertIn("status", health)
        self.assertIn("project_id", health)
        self.assertIn("dataset_id", health)
        self.assertIn("is_connected", health)
        self.assertIn(health["status"], ["connected", "simulation_fallback"])

    def test_project_and_dataset_configured(self):
        """Project ID and dataset should have values."""
        health = bigquery_ml.check_bigquery_health()
        self.assertTrue(len(health["project_id"]) > 0)
        self.assertTrue(len(health["dataset_id"]) > 0)


class TestBigQueryMLQuery(unittest.TestCase):
    """Test SQL query generation."""

    def test_query_generation(self):
        """ML.PREDICT query should contain correct vitals values."""
        vitals = {
            "systolic_bp": 140,
            "heart_rate": 88,
            "spo2": 95,
            "temp": 37.5
        }
        sql = bigquery_ml.get_bigquery_ml_triage_query(vitals)
        self.assertIn("ML.PREDICT", sql)
        self.assertIn("140.0", sql)
        self.assertIn("88.0", sql)
        self.assertIn("95.0", sql)
        self.assertIn("37.5", sql)
        self.assertIn("triage_risk_model", sql)

    def test_query_with_defaults(self):
        """Missing vitals should use defaults."""
        sql = bigquery_ml.get_bigquery_ml_triage_query({})
        self.assertIn("ML.PREDICT", sql)
        self.assertIn("120.0", sql)  # default systolic_bp
        self.assertIn("72.0", sql)   # default heart_rate


class TestBigQueryMLPrediction(unittest.TestCase):
    """Test prediction with simulation fallback."""

    def test_simulation_fallback(self):
        """Without GCP credentials, should return simulation result."""
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(
            bigquery_ml.predict_risk_bigquery({"spo2": 97, "heart_rate": 72})
        )
        loop.close()

        self.assertIn("engine", result)
        self.assertIn("predictedRiskLevel", result)
        self.assertIn("confidencePercentage", result)
        self.assertIn("sqlQuery", result)
        self.assertEqual(result["engine"], "Google BigQuery ML (Serverless SQL)")

    def test_low_spo2_triggers_high_risk(self):
        """SpO2 below 95 in simulation should return HIGH_RISK."""
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(
            bigquery_ml.predict_risk_bigquery({"spo2": 90})
        )
        loop.close()

        if result["status"] == "simulation_fallback":
            self.assertEqual(result["predictedRiskLevel"], "HIGH_RISK")


if __name__ == '__main__':
    unittest.main()
